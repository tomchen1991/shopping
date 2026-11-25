import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import deployed from '../src/index.js';
import fixture from '../fixtures/management-worker.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const databaseId = '00000000-0000-0000-0000-000000000000'; // Local ID in wrangler.jsonc
const webOrigin = 'https://room.example';
const alice = 'Bearer test-alice';
const bob = 'Bearer test-bob';
let directory, mf;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'order-room-'));
  const require = createRequire(import.meta.url);
  const bin = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
  execFileSync(process.execPath, [bin, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', directory], {
    cwd: root, env: { ...process.env, CI: 'true' },
  });
  const modules = ['fixtures/management-worker.js', ...(await readdir(join(root, 'src')))
    .filter(file => file.endsWith('.js')).map(file => `src/${file}`)];
  mf = new Miniflare(convertV4MiniflareOptions({
    modulesRoot: root, modules: modules.map(file => ({ type: 'ESModule', path: join(root, file) })),
    compatibilityDate: '2026-04-01', d1Databases: { DB: databaseId }, resourcePersistencePath: join(directory, 'v3'),
    r2Buckets: { COVERS: 'order-room-covers' }, bindings: { WEB_ORIGIN: webOrigin },
  }));
});

after(async () => {
  try { await mf?.dispose(); } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
});

function call(path, { method = 'GET', auth = alice, json, body, headers = {} } = {}) {
  const init = { method, headers: { ...(auth ? { Authorization: auth } : {}), ...headers }, body };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  return mf.dispatchFetch(`https://api.example/api/manage${path}`, init);
}

const put = (path, json, auth) => call(path, { method: 'PUT', json, auth });
const visitor = (path, init) => mf.dispatchFetch(`https://api.example${path}`, init);
const place = (slot, holdingId, auth) => put(`/room/slots/${slot}`, { holdingId }, auth);

async function expect(response, status = 200) {
  const res = await response;
  const value = await res.json();
  assert.equal(res.status, status, JSON.stringify(value));
  return value;
}

const post = (path, json, auth) => call(path, { method: 'POST', json, auth });
const newProduct = (json = { name: '示例商品', category: 'electronics' }, auth) => expect(post('/products', json, auth), 201);

test('management adapters fail closed and verified owners cannot be overridden', async () => {
  const product = await newProduct();
  const unverified = { auth: null, headers: { 'X-User-Id': 'alice' } };
  assert.deepEqual(await expect(call('/products?userId=alice', unverified), 401), { error: 'unauthorized' });
  for (const path of ['/covers', '/holdings', `/products/${product.id}/cover`, `/products/${product.id}/purchases`, '/purchases/anything/receive']) {
    await expect(call(path, unverified), 401);
  }
  await expect(call(`/products/${product.id}?userId=alice`, { auth: bob, headers: { 'X-User-Id': 'alice' } }), 404);
  assert.deepEqual(await expect(call('/products', { auth: bob })), { products: [] });
  await expect(post('/products', { name: 'x', category: 'game', ownerId: 'alice' }, bob), 400);
  const result = await deployed.fetch(new Request('https://api.example/api/manage/products', {
    headers: { Authorization: alice, 'X-User-Id': 'alice' },
  }), { resolveIdentity: () => ({ subject: 'alice' }) });
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const preflight = await call('/products', { method: 'OPTIONS', auth: null, headers: {
    Origin: webOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), webOrigin);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), 'true');
  await expect(call('/products', { headers: { Origin: 'https://other.example' } }), 403);
});

test('minimum product fields and all category details round trip through D1', async () => {
  const minimum = await newProduct({ name: '  显示器  ', category: 'electronics' });
  assert.equal(minimum.name, '显示器');
  assert.equal(minimum.coverId, null);
  assert.equal(minimum.targetPriceCents, null);
  assert.deepEqual(minimum.details, {});
  assert.deepEqual(minimum.tags, []);
  assert.deepEqual(await expect(call(`/products/${minimum.id}`)), minimum);
  assert.equal(minimum.modelId, null);
  for (const [category, details] of Object.entries({
    electronics: { brand: '品牌', model: 'V1', configuration: '16GB / 512GB', specifications: '144 Hz' },
    game: { platform: 'Switch', medium: '卡带', edition: '限定版', developer: '工作室', releaseDate: '2024-02-29' },
    figure: { work: '作品', character: '角色', manufacturer: '厂商', series: '系列', scale: '1:7', height: '25 cm', expectedRelease: '2027-Q2' },
  })) {
    const input = { name: '想买', category, link: 'https://shop.example/product', targetPriceCents: 12345,
      tags: ['限量', '收藏'], interestReason: '等待发售', details };
    const product = await newProduct(input);
    const roundTrip = await expect(call(`/products/${product.id}`));
    assert.deepEqual(roundTrip, { ...product, ...input });
    assert.ok((await expect(call('/products'))).products.some(row => row.id === product.id));
  }
  await expect(post('/products', { name: 'x', category: 'game', details: { releaseDate: '2023-02-29' } }), 400);
  await expect(post('/products', { name: 'x', category: 'game', details: { brand: 'x' } }), 400);
  await expect(post('/products', { name: 'x', category: 'electronics', targetPriceCents: 0.1 }), 400);
});

test('purchase accounting and receipt are atomic and isolated', async () => {
  const product = await newProduct();
  const purchases = `/products/${product.id}/purchases`;
  const regular = await expect(post(purchases, { kind: 'regular', shop: '本地店', amountCents: 29900 }), 201);
  assert.equal(regular.totalCents, 29900);
  assert.equal(regular.shop, '本地店');
  assert.equal(regular.currency, 'CNY');
  const preorder = await expect(post(purchases, { kind: 'preorder', shop: '官方店', depositCents: 1001 }), 201);
  assert.equal(preorder.balanceCents, null);
  assert.equal(preorder.totalCents, 1001);
  const preorderPath = `/purchases/${preorder.id}`;
  const paid = await expect(call(preorderPath, { method: 'PATCH', json: { balanceCents: 2002 } }));
  assert.equal(paid.totalCents, 3003);
  assert.equal(paid.depositCents, 1001);
  assert.equal(paid.balanceCents, 2002);
  const cancelled = await expect(post(purchases, { kind: 'regular', shop: '商城', amountCents: 0 }), 201);
  const cancelledPath = `/purchases/${cancelled.id}`;
  assert.equal((await expect(post(`${cancelledPath}/cancel`))).status, 'cancelled');
  assert.deepEqual(await expect(call('/holdings')), { holdings: [] });
  await expect(post(`${cancelledPath}/receive`, { receivedDate: '2026-11-01' }), 409);
  await expect(post(`${preorderPath}/receive`, { receivedDate: '2026-11-01' }, bob), 404);
  const receive = () => post(`${preorderPath}/receive`, { receivedDate: '2026-11-01' });
  const [first, second] = await Promise.all([expect(receive()), expect(receive())]);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'received');
  assert.equal(first.receivedDate, '2026-11-01');
  assert.deepEqual(await expect(post(`${preorderPath}/receive`, { receivedDate: '2026-11-02' })), first);
  assert.deepEqual(await expect(call(preorderPath)), first);
  await expect(post(`${preorderPath}/cancel`), 409);
  await expect(call(preorderPath, { method: 'PATCH', json: { balanceCents: 0 } }), 409);
  const { holdings } = await expect(call('/holdings'));
  assert.equal(holdings.length, 1);
  assert.deepEqual(holdings[0], { id: holdings[0].id, productId: product.id, purchaseId: preorder.id, receivedDate: '2026-11-01' });
  assert.deepEqual(await expect(call('/holdings', { auth: bob })), { holdings: [] });
  await expect(call(purchases, { auth: bob }), 404);
  await expect(post(purchases, { kind: 'regular', shop: '商城', amountCents: 0.01 }), 400);
  await expect(post(purchases, { kind: 'regular', shop: '商城', amountCents: 100, currency: 'USD' }), 400);
  assert.deepEqual(new Set((await expect(call(purchases))).purchases.map(row => row.id)), new Set([regular.id, preorder.id, cancelled.id]));
  const db = await mf.getD1Database('DB');
  assert.deepEqual(await db.prepare('SELECT typeof(total_cents) AS type, total_cents AS total FROM purchases WHERE id = ?').bind(preorder.id).first(), { type: 'integer', total: 3003 });
});

test('fixed room accepts only matching received holdings; guest projection follows current placement', async () => {
  const put = (path, json) => call(path, { method: 'PUT', json });
  assert.equal((await expect(call('/room'))).shareToken, null);
  const { shareToken } = await expect(put('/room/share', { enabled: true }));
  const publicURL = `https://api.example/api/public/rooms/${shareToken}`;
  const guest = () => mf.dispatchFetch(publicURL);
  const coverURL = publicURL + '/covers/cabinet-2';
  for (const [category, slot] of [['electronics', 'desk-2'], ['game', 'shelf-2'], ['figure', 'cabinet-2']]) {
    const product = await newProduct({category, name: `示例-${category}`, interestReason: '私人笔记'});
    const order = await expect(post(`/products/${product.id}/purchases`, {kind:'regular', shop:'私人店', amountCents:314}), 201);
    const path = `/room/slots/${slot}`;
    await expect(put(path, {holdingId:order.id}), 400);
    await expect(post(`/purchases/${order.id}/receive`, {receivedDate:'2025-06-01'}));
    const holding = (await expect(call('/holdings'))).holdings.find(h => h.purchaseId === order.id);
    await expect(put(path, {holdingId:holding.id}));
    const room = await expect(guest());
    assert.deepEqual(Object.keys(room), ['slots']);
    assert.deepEqual(room.slots.find(s => s.slot === slot), {slot, category, exhibit:{name:product.name, coverPath:null}});
  }
  const product = await newProduct({category:'figure',name:'未展示手办'});
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xjb0AAAAASUVORK5CYII=', 'base64');
  const { id } = await expect(call('/covers', {method:'POST', body:png, headers:{'Content-Type':'image/png'}}),201);
  await expect(put(`/products/${product.id}/cover`, {coverId:id}));
  const cancelled = await expect(post(`/products/${product.id}/purchases`, {kind:'regular', shop:'隐藏店', amountCents:4}),201);
  await expect(post(`/purchases/${cancelled.id}/cancel`));
  await expect(put('/room/slots/cabinet-2', {holdingId:cancelled.id}),400);
  for (const key of [id, product.id, 'cabinet-1']) assert.equal((await mf.dispatchFetch(`${publicURL}/covers/${key}`)).status,404);
  assert.ok(!JSON.stringify(await expect(guest())).includes(product.name));
  const displayed = (await expect(call('/products'))).products.find(p => p.name === '示例-figure');
  await expect(put(`/products/${displayed.id}/cover`, {coverId:id}));
  const image = await mf.dispatchFetch(coverURL);
  assert.equal(image.status,200);
  assert.equal(image.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  await expect(put('/room/share', {enabled:false}));
  assert.equal((await guest()).status,404);
  assert.equal((await mf.dispatchFetch(coverURL)).status,404);
  for (const slot of ['desk-2','shelf-2','cabinet-2']) await expect(put(`/room/slots/${slot}`, {holdingId:null}));
});

test('local R2 stores raster bytes and only a verified owner can attach or read them', async () => {
  const product = await newProduct();
  const bobsProduct = await newProduct({ name: 'Bob', category: 'game' }, bob);
  const path = `/products/${product.id}/cover`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xjb0AAAAASUVORK5CYII=', 'base64');
  await expect(call(path), 404);
  await expect(post('/products', { name: '外链封面', category: 'game', coverUrl: 'https://other.example/cover.png' }), 400);
  await expect(call(path, { method: 'PUT', json: { coverId: 'https://other.example/cover.png' } }), 400);
  await expect(call('/covers', { method: 'POST', body: '<svg/>', headers: { 'Content-Type': 'image/svg+xml' } }), 415);
  await expect(call('/covers', { method: 'POST', body: 'not a png', headers: { 'Content-Type': 'image/png' } }), 400);
  // Test the streaming cap without a socket: an early 413 can close the
  // Miniflare connection while the HTTP client is still uploading 5 MiB.
  await expect(fixture.fetch(new Request('https://api.example/api/manage/covers', {
    method: 'POST', headers: { Authorization: alice, 'Content-Type': 'image/png' },
    body: new Uint8Array(5 * 1024 * 1024 + 1),
  }), { WEB_ORIGIN: webOrigin }), 413);
  const { id } = await expect(call('/covers', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } }), 201);
  const bucket = await mf.getR2Bucket('COVERS');
  assert.deepEqual(Buffer.from(await (await bucket.get(`covers/${id}`)).arrayBuffer()), png);
  await expect(call(`/products/${bobsProduct.id}/cover`, { auth: bob, method: 'PUT', json: { coverId: id } }), 404);
  await expect(call(path, { auth: bob, method: 'PUT', json: { coverId: id } }), 404);
  assert.equal((await expect(call(path, { method: 'PUT', json: { coverId: id } }))).coverId, id);
  assert.equal((await expect(call(`/products/${product.id}`))).coverId, id);
  const image = await call(path);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.equal(image.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  await expect(call(path, { auth: bob }), 404);
  await expect(call(path, { auth: null }), 401);
  await expect(call(`/covers/${id}`), 404);
});

async function order(product, auth) {
  return expect(post(`/products/${product.id}/purchases`, { kind: 'regular', shop: '私有店铺', amountCents: 34300 }, auth), 201);
}

async function receiveHolding(purchase, auth) {
  await expect(post(`/purchases/${purchase.id}/receive`, { receivedDate: '2026-11-21' }, auth));
  const { holdings } = await expect(call('/holdings', { auth }));
  return holdings.find(item => item.purchaseId === purchase.id);
}

test('room placement requires an owned received holding, matching slot category and no duplicate', async () => {
  const electronics = await newProduct({ name: '显示器', category: 'electronics' });
  const game = await newProduct({ name: '光盘', category: 'game' });
  const figure = await newProduct({ name: '手办', category: 'figure' });
  const pending = await order(figure);
  const cancelled = await order(figure);
  await expect(post(`/purchases/${cancelled.id}/cancel`));
  assert.equal((await expect(call('/room'))).shareToken, null);
  await expect(call('/room', { auth: null }), 401);
  await expect(place('cabinet-1', 'a'.repeat(32), null), 401);
  await expect(put('/room/share', { enabled: true }, null), 401);
  await expect(put('/room/share', { enabled: 'true' }), 400);
  for (const purchase of [pending, cancelled]) {
    await expect(place('cabinet-1', purchase.id), 400);
    // Even a legacy/imported holding pointing to a non-received order cannot be placed.
    const db = await mf.getD1Database('DB');
    const { id } = await db.prepare(`INSERT INTO holdings (owner_id, product_id, purchase_id, received_date)
      VALUES (?, ?, ?, ?) RETURNING id`).bind('alice', figure.id, purchase.id, '2026-11-21').first();
    await expect(place('cabinet-1', id), 409);
    await db.prepare('DELETE FROM holdings WHERE id = ?').bind(id).run();
  }
  const display = await receiveHolding(await order(electronics));
  const disc = await receiveHolding(await order(game));
  const statue = await receiveHolding(await order(figure));
  await expect(place('cabinet-1', display.id), 409);
  await expect(place('somewhere', statue.id), 404);
  await expect(place('cabinet-1', statue.id, bob), 409);
  for (const [slot, item] of [['desk-1', display], ['shelf-2', disc], ['cabinet-1', statue]]) {
    assert.deepEqual(await expect(place(slot, item.id)), { slot, holdingId: item.id });
  }
  await expect(place('cabinet-2', statue.id), 409);
  const room = await expect(call('/room'));
  assert.equal(room.slots.length, 6);
  assert.deepEqual(room.slots.filter(slot => slot.exhibit).map(slot => [slot.slot, slot.category, slot.exhibit.productId]), [
    ['desk-1', 'electronics', electronics.id], ['shelf-2', 'game', game.id], ['cabinet-1', 'figure', figure.id],
  ]);
  assert.ok((await expect(call('/room', { auth: bob }))).slots.every(slot => slot.exhibit === null));
  for (const slot of ['desk-1', 'shelf-2', 'cabinet-1']) await expect(place(slot, null));
});

test('public share only exposes current slot metadata and covers; revocation and rotation invalidate old URLs', async () => {
  const figure = await newProduct({ name: '公开手办', category: 'figure', interestReason: '私有备注', targetPriceCents: 12345 });
  const privateFigure = await newProduct({ name: '未摆出的收藏', category: 'figure' });
  const holding = await receiveHolding(await order(figure));
  await receiveHolding(await order(privateFigure));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRUsAAAAASUVORK5CYII=', 'base64');
  const coverIds = [];
  for (const product of [figure, privateFigure]) {
    const { id } = await expect(call('/covers', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } }), 201);
    coverIds.push(id);
    await expect(put(`/products/${product.id}/cover`, { coverId: id }));
  }
  await expect(place('cabinet-1', holding.id));
  await expect(visitor(`/api/public/rooms/${'0'.repeat(32)}`), 404);
  const { shareToken } = await expect(put('/room/share', { enabled: true }));
  const publicPath = `/api/public/rooms/${shareToken}`;
  const coverPath = `${publicPath}/covers/cabinet-1`;
  assert.equal((await expect(put('/room/share', { enabled: true }))).shareToken, shareToken);
  const publicResponse = await visitor(publicPath, { headers: { Origin: webOrigin } });
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal(publicResponse.headers.get('Access-Control-Allow-Origin'), webOrigin);
  assert.equal(publicResponse.headers.get('Access-Control-Allow-Credentials'), null);
  assert.deepEqual(await publicResponse.json(), { slots: [
    { slot: 'desk-1', category: 'electronics', exhibit: null }, { slot: 'desk-2', category: 'electronics', exhibit: null },
    { slot: 'shelf-1', category: 'game', exhibit: null }, { slot: 'shelf-2', category: 'game', exhibit: null },
    { slot: 'cabinet-1', category: 'figure', exhibit: { name: figure.name, coverPath } },
    { slot: 'cabinet-2', category: 'figure', exhibit: null },
  ] });
  const image = await visitor(coverPath);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Cache-Control'), 'no-store');
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  for (const key of ['cabinet-2', privateFigure.id, coverIds[1]]) await expect(visitor(`${publicPath}/covers/${key}`), 404);
  await expect(call(`/products/${privateFigure.id}/cover`, { auth: null }), 401);
  await expect(place('cabinet-1', null));
  await expect(visitor(coverPath), 404);
  const empty = await expect(visitor(publicPath));
  assert.ok(empty.slots.every(slot => slot.exhibit === null));
  await expect(place('cabinet-1', holding.id));
  assert.deepEqual(await expect(put('/room/share', { enabled: false })), { shareToken: null });
  for (const path of [publicPath, coverPath]) await expect(visitor(path), 404);
  const reopened = await expect(put('/room/share', { enabled: true }));
  assert.notEqual(reopened.shareToken, shareToken);
  await expect(visitor(`/api/public/rooms/${reopened.shareToken}`));
  for (const path of [publicPath, coverPath]) await expect(visitor(path), 404);
});

function buildMinimalGlb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }));
  const pad = (4 - (json.length % 4)) % 4;
  const chunkLen = json.length + pad;
  const totalLen = 12 + 8 + chunkLen;
  const out = Buffer.alloc(totalLen, 0x20);
  out.writeUInt32LE(0x46546C67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(chunkLen, 12);
  out.writeUInt32LE(0x4E4F534A, 16);
  json.copy(out, 20);
  return out;
}

test('local R2 stores glb 3D models, enforces ownership, and exposes via active share only', async () => {
  const figure = await newProduct({ name: '带3D模型手办', category: 'figure' });
  const bobsProduct = await newProduct({ name: 'Bob手办', category: 'figure' }, bob);
  const modelPath = `/products/${figure.id}/model`;
  const glb = buildMinimalGlb();
  await expect(call(modelPath), 404);
  await expect(call('/models', { method: 'POST', body: glb, headers: { 'Content-Type': 'application/octet-stream' } }), 415);
  await expect(call('/models', { method: 'POST', body: 'not a glb', headers: { 'Content-Type': 'model/gltf-binary' } }), 400);
  const { id } = await expect(call('/models', { method: 'POST', body: glb, headers: { 'Content-Type': 'model/gltf-binary' } }), 201);
  const bucket = await mf.getR2Bucket('COVERS');
  assert.deepEqual(Buffer.from(await (await bucket.get(`models/${id}`)).arrayBuffer()), glb);
  await expect(call(`/products/${bobsProduct.id}/model`, { auth: bob, method: 'PUT', json: { modelId: id } }), 404);
  assert.equal((await expect(call(modelPath, { method: 'PUT', json: { modelId: id } }))).modelId, id);
  const fetched = await call(modelPath);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('Content-Type'), 'model/gltf-binary');
  assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), glb);
  await expect(call(modelPath, { auth: bob }), 404);
  await expect(call(modelPath, { auth: null }), 401);

  const holding = await receiveHolding(await order(figure));
  await expect(place('cabinet-1', holding.id));
  const privateRoom = await expect(call('/room'));
  assert.equal(privateRoom.slots.find(s => s.slot === 'cabinet-1').exhibit.hasModel, true);

  const { shareToken } = await expect(put('/room/share', { enabled: true }));
  const publicPath = `/api/public/rooms/${shareToken}`;
  const publicModelPath = `${publicPath}/models/cabinet-1`;
  const publicRoom = await expect(visitor(publicPath));
  assert.deepEqual(publicRoom.slots.find(s => s.slot === 'cabinet-1'), {
    slot: 'cabinet-1', category: 'figure',
    exhibit: { name: figure.name, coverPath: null, modelPath: publicModelPath },
  });
  const guestModel = await visitor(publicModelPath);
  assert.equal(guestModel.status, 200);
  assert.equal(guestModel.headers.get('Content-Type'), 'model/gltf-binary');
  assert.deepEqual(Buffer.from(await guestModel.arrayBuffer()), glb);

  await expect(put('/room/share', { enabled: false }));
  assert.equal((await visitor(publicModelPath)).status, 404);

  assert.equal((await expect(call(modelPath, { method: 'PUT', json: { modelId: null } }))).modelId, null);
  await expect(call(modelPath), 404);
  await expect(place('cabinet-1', null));
});
