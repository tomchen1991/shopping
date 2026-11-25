import { ApiError, date, invalid, jsonInput, paymentInput, productInput, purchaseInput, readBytes } from './input.js';

const notFound = () => { throw new ApiError(404, 'not_found'); };
const conflict = () => { throw new ApiError(409, 'purchase_closed'); };
const viewProduct = row => ({
  id: row.id, name: row.name, category: row.category, link: row.link,
  targetPriceCents: row.target_price_cents, tags: JSON.parse(row.tags_json),
  interestReason: row.interest_reason, details: JSON.parse(row.details_json),
  coverId: row.cover_id, createdAt: row.created_at,
});
const viewPurchase = row => ({
  id: row.id, productId: row.product_id, kind: row.kind, shop: row.shop,
  currency: 'CNY', amountCents: row.amount_cents, depositCents: row.deposit_cents,
  balanceCents: row.balance_cents, totalCents: row.total_cents,
  status: row.status, receivedDate: row.received_date, createdAt: row.created_at,
});

const imageTypes = {
  'image/png': bytes => [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte),
  'image/jpeg': bytes => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  'image/webp': bytes => ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP',
  'image/gif': bytes => ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6)),
};
const ascii = (bytes, start, end) => String.fromCharCode(...bytes.subarray(start, end));
const coverKey = id => `covers/${id}`;

export async function manage(request, env, ownerId, path, headers) {
  const { DB, COVERS } = env;
  const sql = (query, ...params) => DB.prepare(query).bind(...params);
  const json = (body, status = 200) => Response.json(body, { status, headers });
  const method = request.method;
  const product = id => sql('SELECT * FROM products WHERE owner_id = ? AND id = ?', ownerId, id).first();
  const purchase = id => sql('SELECT * FROM purchases WHERE owner_id = ? AND id = ?', ownerId, id).first();

  if (path === '/products' && method === 'GET') {
    const { results } = await sql('SELECT * FROM products WHERE owner_id = ? ORDER BY created_at DESC, id', ownerId).all();
    return json({ products: results.map(viewProduct) });
  }
  if (path === '/products' && method === 'POST') {
    const input = await productInput(request);
    const row = await sql(`INSERT INTO products
      (id, owner_id, name, category, link, target_price_cents, tags_json, interest_reason, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, crypto.randomUUID(), ownerId,
    input.name, input.category, input.link, input.targetPriceCents, JSON.stringify(input.tags),
    input.interestReason, JSON.stringify(input.details)).first();
    return json(viewProduct(row), 201);
  }
  if (path === '/covers' && method === 'POST') {
    const mime = request.headers.get('Content-Type')?.trim().toLowerCase();
    if (!Object.hasOwn(imageTypes, mime)) throw new ApiError(415, 'unsupported_media_type');
    const bytes = await readBytes(request, 5 * 1024 * 1024);
    if (!imageTypes[mime](bytes)) invalid('body');
    const id = crypto.randomUUID();
    // Publish metadata only after the blob exists. An interrupted write may leave an
    // unreachable object, but cannot expose it or produce a dangling attachment.
    await COVERS.put(coverKey(id), bytes, { httpMetadata: { contentType: mime } });
    await sql('INSERT INTO covers (id, owner_id, content_type) VALUES (?, ?, ?)', id, ownerId, mime).run();
    return json({ id }, 201);
  }
  if (path === '/holdings' && method === 'GET') {
    const { results } = await sql(`SELECT id, product_id AS productId, purchase_id AS purchaseId,
      received_date AS receivedDate FROM holdings WHERE owner_id = ? ORDER BY received_date DESC, id`, ownerId).all();
    return json({ holdings: results });
  }

  const productRoute = /^\/products\/([a-f0-9-]{36})(?:\/(cover|purchases))?$/.exec(path);
  if (productRoute) {
    const [, id, sub] = productRoute;
    if (!sub && method === 'GET') {
      const row = await product(id);
      return row ? json(viewProduct(row)) : notFound();
    }
    if (sub === 'cover' && method === 'PUT') {
      const { coverId } = await jsonInput(request, ['coverId']);
      if (typeof coverId !== 'string' || !/^[a-f0-9-]{36}$/.test(coverId)) invalid('coverId');
      const row = await sql(`UPDATE products SET cover_id = ? WHERE owner_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM covers WHERE owner_id = ? AND id = ?) RETURNING *`,
      coverId, ownerId, id, ownerId, coverId).first();
      return row ? json(viewProduct(row)) : notFound();
    }
    if (sub === 'cover' && method === 'GET') {
      const row = await sql(`SELECT c.id, c.content_type FROM products p JOIN covers c
        ON c.id = p.cover_id AND c.owner_id = p.owner_id WHERE p.owner_id = ? AND p.id = ?`, ownerId, id).first();
      if (!row) return notFound();
      const object = await COVERS.get(coverKey(row.id));
      if (!object) return notFound();
      headers.set('Content-Type', row.content_type);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
      return new Response(object.body, { headers });
    }
    if (sub === 'purchases' && ['GET', 'POST'].includes(method)) {
      if (!(await product(id))) return notFound();
      if (method === 'GET') {
        const { results } = await sql(`SELECT * FROM purchases WHERE owner_id = ? AND product_id = ?
          ORDER BY created_at DESC, id`, ownerId, id).all();
        return json({ purchases: results.map(viewPurchase) });
      }
      const payment = await purchaseInput(request);
      const row = await sql(`INSERT INTO purchases
        (id, owner_id, product_id, kind, shop, amount_cents, deposit_cents, balance_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`, crypto.randomUUID(), ownerId, id, ...payment).first();
      return json(viewPurchase(row), 201);
    }
  }

  const purchaseRoute = /^\/purchases\/([a-f0-9-]{36})(?:\/(receive|cancel))?$/.exec(path);
  if (purchaseRoute) {
    const [, id, action] = purchaseRoute;
    if (!action && method === 'GET') {
      const row = await purchase(id);
      return row ? json(viewPurchase(row)) : notFound();
    }
    if (!action && method === 'PATCH') {
      const current = await purchase(id);
      if (!current) return notFound();
      if (current.status !== 'pending') return conflict();
      const payment = paymentInput(await jsonInput(request, ['amountCents', 'depositCents', 'balanceCents']), current.kind);
      const row = await sql(`UPDATE purchases SET amount_cents = coalesce(?, amount_cents),
        deposit_cents = coalesce(?, deposit_cents), balance_cents = coalesce(?, balance_cents)
        WHERE owner_id = ? AND id = ? AND status = 'pending' RETURNING *`, ...payment, ownerId, id).first();
      return row ? json(viewPurchase(row)) : conflict();
    }
    if (action && method === 'POST') {
      const receivedDate = action === 'receive'
        ? date((await jsonInput(request, ['receivedDate'])).receivedDate, 'receivedDate') : null;
      const status = action === 'receive' ? 'received' : 'cancelled';
      const changed = await sql(`UPDATE purchases SET status = ?, received_date = ?
        WHERE owner_id = ? AND id = ? AND status = 'pending' RETURNING *`, status, receivedDate, ownerId, id).first();
      if (changed) return json(viewPurchase(changed));
      const current = await purchase(id);
      if (!current) return notFound();
      // A retry does not overwrite the original receipt date or create a second holding.
      return current.status === status ? json(viewPurchase(current)) : conflict();
    }
  }
  return notFound();
}
