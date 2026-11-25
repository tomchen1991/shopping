import { ApiError, invalid, jsonInput } from './input.js';
import { coverResponse, modelResponse } from './cover.js';

const slots = {
  'desk-1': 'electronics', 'desk-2': 'electronics',
  'shelf-1': 'game', 'shelf-2': 'game',
  'cabinet-1': 'figure', 'cabinet-2': 'figure',
};
const exhibits = `FROM room_placements r
  JOIN holdings h ON h.owner_id = r.owner_id AND h.id = r.holding_id
  JOIN purchases o ON o.owner_id = h.owner_id AND o.product_id = h.product_id
    AND o.id = h.purchase_id AND o.status = 'received'
  JOIN products p ON p.owner_id = h.owner_id AND p.id = h.product_id
  LEFT JOIN covers c ON c.owner_id = p.owner_id AND c.id = p.cover_id
  LEFT JOIN models m ON m.owner_id = p.owner_id AND m.id = p.model_id`;
const notFound = () => { throw new ApiError(404, 'not_found'); };

function layout(rows, exhibit) {
  const bySlot = new Map(rows.map(row => [row.slot, row]));
  return Object.entries(slots).map(([slot, category]) => ({
    slot, category, exhibit: bySlot.has(slot) ? exhibit(bySlot.get(slot)) : null,
  }));
}

export async function manageRoom(request, { DB }, ownerId, path, headers) {
  const sql = (query, ...params) => DB.prepare(query).bind(...params);
  const json = body => Response.json(body, { headers });
  if (path === '/room' && request.method === 'GET') {
    const { results } = await sql(`SELECT r.slot, h.id AS holding_id, p.id AS product_id,
      p.name, c.id AS cover_id, m.id AS model_id ${exhibits} WHERE r.owner_id = ?`, ownerId).all();
    const share = await sql('SELECT token FROM room_shares WHERE owner_id = ?', ownerId).first();
    return json({ shareToken: share?.token ?? null, slots: layout(results, row => ({
      holdingId: row.holding_id, productId: row.product_id, name: row.name,
      hasCover: !!row.cover_id, ...(row.model_id && { hasModel: true }),
    })) });
  }
  if (path === '/room/share' && request.method === 'PUT') {
    const { enabled } = await jsonInput(request, ['enabled']);
    if (typeof enabled !== 'boolean') invalid('enabled');
    if (!enabled) {
      await sql('DELETE FROM room_shares WHERE owner_id = ?', ownerId).run();
      return json({ shareToken: null });
    }
    const { token } = await sql(`INSERT INTO room_shares (owner_id, token) VALUES (?, ?)
      ON CONFLICT (owner_id) DO UPDATE SET token = room_shares.token RETURNING token`,
    ownerId, crypto.randomUUID().replaceAll('-', '')).first();
    return json({ shareToken: token });
  }
  const match = /^\/room\/slots\/([^/]+)$/.exec(path);
  if (!match || request.method !== 'PUT' || !Object.hasOwn(slots, match[1])) return notFound();
  const slot = match[1];
  const { holdingId } = await jsonInput(request, ['holdingId']);
  if (holdingId === null) {
    await sql('DELETE FROM room_placements WHERE owner_id = ? AND slot = ?', ownerId, slot).run();
  } else {
    if (typeof holdingId !== 'string' || !/^[a-f0-9]{32}$/.test(holdingId)) invalid('holdingId');
    // Validate ownership, receipt, category and single placement in the same statement as the write.
    const row = await sql(`INSERT INTO room_placements (owner_id, slot, holding_id)
      SELECT h.owner_id, ?, h.id FROM holdings h
      JOIN purchases o ON o.owner_id = h.owner_id AND o.product_id = h.product_id
        AND o.id = h.purchase_id AND o.status = 'received'
      JOIN products p ON p.owner_id = h.owner_id AND p.id = h.product_id
      WHERE h.owner_id = ? AND h.id = ? AND p.category = ?
      AND NOT EXISTS (SELECT 1 FROM room_placements r
        WHERE r.owner_id = h.owner_id AND r.holding_id = h.id AND r.slot <> ?)
      ON CONFLICT (owner_id, slot) DO UPDATE SET holding_id = excluded.holding_id RETURNING slot`,
    slot, ownerId, holdingId, slots[slot], slot).first();
    if (!row) throw new ApiError(409, 'holding_not_placeable');
  }
  return json({ slot, holdingId });
}

export async function publicRoom(request, { DB, COVERS }, path, headers) {
  const match = /^\/([a-f0-9]{32})(?:\/(covers|models)\/([^/]+))?$/.exec(path);
  if (!match || request.method !== 'GET') return notFound();
  const [, token, assetKind, slot] = match;
  const sql = (query, ...params) => DB.prepare(query).bind(...params);
  if (slot) {
    if (!Object.hasOwn(slots, slot)) return notFound();
    // Only resolve a blob key through a currently shared, occupied slot. Never accept an R2 key.
    if (assetKind === 'covers') {
      const row = await sql(`SELECT c.id, c.content_type ${exhibits}
        JOIN room_shares s ON s.owner_id = r.owner_id
        WHERE s.token = ? AND r.slot = ? AND c.id IS NOT NULL`, token, slot).first();
      return (await coverResponse(COVERS, row, headers)) ?? notFound();
    }
    const row = await sql(`SELECT m.id, m.content_type ${exhibits}
      JOIN room_shares s ON s.owner_id = r.owner_id
      WHERE s.token = ? AND r.slot = ? AND m.id IS NOT NULL`, token, slot).first();
    return (await modelResponse(COVERS, row, headers)) ?? notFound();
  }
  // A left join distinguishes an empty shared room from a nonexistent or revoked link.
  const { results } = await sql(`WITH shared AS (SELECT owner_id FROM room_shares WHERE token = ?)
    SELECT e.slot, e.name, e.cover_id, e.model_id FROM shared s
    LEFT JOIN (SELECT r.owner_id, r.slot, p.name, c.id AS cover_id, m.id AS model_id ${exhibits}
      JOIN shared f ON f.owner_id = r.owner_id) e ON e.owner_id = s.owner_id`, token).all();
  if (!results.length) return notFound();
  return Response.json({ slots: layout(results, row => ({
    name: row.name,
    coverPath: row.cover_id ? `/api/public/rooms/${token}/covers/${row.slot}` : null,
    ...(row.model_id && { modelPath: `/api/public/rooms/${token}/models/${row.slot}` }),
  })) }, { headers });
}
