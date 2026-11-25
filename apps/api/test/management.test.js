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
  await expect(call('/covers', { method: 'POST', body: new Uint8Array(5 * 1024 * 1024 + 1), headers: { 'Content-Type': 'image/png' } }), 413);
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
