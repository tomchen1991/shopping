import { ApiError, invalid, jsonInput } from './input.js';
import { coverResponse, modelResponse } from './cover.js';

export const surfaces = {
  'desk-main': { category: 'electronics', label: '办公桌台面' },
  'game-upper': { category: 'game', label: '游戏柜 · 上层' },
  'game-lower': { category: 'game', label: '游戏柜 · 中层' },
  'figure-upper': { category: 'figure', label: '手办柜 · 上层' },
  'figure-lower': { category: 'figure', label: '手办柜 · 下层' },
};

const exhibits = `FROM room_placements r
  JOIN holdings h ON h.owner_id = r.owner_id AND h.id = r.holding_id
  JOIN purchases o ON o.owner_id = h.owner_id AND o.product_id = h.product_id
    AND o.id = h.purchase_id AND o.status = 'received'
  JOIN products p ON p.owner_id = h.owner_id AND p.id = h.product_id
  LEFT JOIN covers c ON c.owner_id = p.owner_id AND c.id = p.cover_id
  LEFT JOIN models m ON m.owner_id = p.owner_id AND m.id = p.model_id`;

const notFound = () => { throw new ApiError(404, 'not_found'); };
const hex32 = /^[a-f0-9]{32}$/;

function finiteRange(value, min, max, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(field);
  return value;
}

function viewPrivatePlacement(row) {
  return {
    id: row.id,
    holdingId: row.holding_id,
    productId: row.product_id,
    name: row.name,
    category: row.category,
    surface: row.surface,
    x: row.x,
    z: row.z,
    rotationY: row.rotation_y,
    scale: row.scale,
    hasCover: !!row.cover_id,
    ...(row.model_id && { hasModel: true }),
  };
}

export async function manageRoom(request, { DB }, ownerId, path, headers) {
  const sql = (query, ...params) => DB.prepare(query).bind(...params);
  const json = body => Response.json(body, { headers });

  if (path === '/room' && request.method === 'GET') {
    const { results } = await sql(`SELECT r.id, r.holding_id, r.surface, r.x, r.z, r.rotation_y, r.scale,
      p.id AS product_id, p.name, p.category, c.id AS cover_id, m.id AS model_id
      ${exhibits} WHERE r.owner_id = ? ORDER BY r.surface, r.x, r.id`, ownerId).all();
    const share = await sql('SELECT token FROM room_shares WHERE owner_id = ?', ownerId).first();
    return json({
      shareToken: share?.token ?? null,
      surfaces: Object.entries(surfaces).map(([id, meta]) => ({ id, ...meta })),
      placements: results.map(viewPrivatePlacement),
    });
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

  const match = /^\/room\/placements\/([^/]+)$/.exec(path);
  if (!match || !['PUT', 'DELETE'].includes(request.method)) return notFound();
  const holdingId = match[1];
  if (!hex32.test(holdingId)) invalid('holdingId');

  if (request.method === 'DELETE') {
    await sql('DELETE FROM room_placements WHERE owner_id = ? AND holding_id = ?', ownerId, holdingId).run();
    return json({ holdingId, removed: true });
  }

  const body = await jsonInput(request, ['surface', 'x', 'z', 'rotationY', 'scale']);
  if (typeof body.surface !== 'string' || !Object.hasOwn(surfaces, body.surface)) invalid('surface');
  const x = finiteRange(body.x, 0, 1, 'x');
  const z = finiteRange(body.z, 0, 1, 'z');
  const rotationY = body.rotationY === undefined ? 0 : finiteRange(body.rotationY, -Math.PI * 2, Math.PI * 2, 'rotationY');
  const scale = body.scale === undefined ? 1 : finiteRange(body.scale, 0.6, 1.6, 'scale');

  // Validate ownership, receipt, and surface category in the same statement as the upsert.
  const row = await sql(`INSERT INTO room_placements (owner_id, holding_id, surface, x, z, rotation_y, scale)
    SELECT h.owner_id, h.id, ?, ?, ?, ?, ? FROM holdings h
    JOIN purchases o ON o.owner_id = h.owner_id AND o.product_id = h.product_id
      AND o.id = h.purchase_id AND o.status = 'received'
    JOIN products p ON p.owner_id = h.owner_id AND p.id = h.product_id
    WHERE h.owner_id = ? AND h.id = ? AND p.category = ?
    ON CONFLICT (owner_id, holding_id) DO UPDATE SET
      surface = excluded.surface,
      x = excluded.x,
      z = excluded.z,
      rotation_y = excluded.rotation_y,
      scale = excluded.scale
    RETURNING id, holding_id, surface, x, z, rotation_y, scale`,
  body.surface, x, z, rotationY, scale, ownerId, holdingId, surfaces[body.surface].category).first();

  if (!row) throw new ApiError(409, 'holding_not_placeable');

  const meta = await sql(`SELECT r.id, r.holding_id, r.surface, r.x, r.z, r.rotation_y, r.scale,
    p.id AS product_id, p.name, p.category, c.id AS cover_id, m.id AS model_id
    ${exhibits} WHERE r.owner_id = ? AND r.id = ?`, ownerId, row.id).first();

  return json({ placement: viewPrivatePlacement(meta) });
}

export async function publicRoom(request, { DB, COVERS }, path, headers) {
  const match = /^\/([a-f0-9]{32})(?:\/(covers|models)\/([^/]+))?$/.exec(path);
  if (!match || request.method !== 'GET') return notFound();
  const [, token, assetKind, placementId] = match;
  const sql = (query, ...params) => DB.prepare(query).bind(...params);

  if (placementId) {
    if (!hex32.test(placementId)) return notFound();
    // Only resolve a blob key through a currently shared, placed exhibit. Never accept an R2 key.
    if (assetKind === 'covers') {
      const row = await sql(`SELECT c.id, c.content_type ${exhibits}
        JOIN room_shares s ON s.owner_id = r.owner_id
        WHERE s.token = ? AND r.id = ? AND c.id IS NOT NULL`, token, placementId).first();
      return (await coverResponse(COVERS, row, headers)) ?? notFound();
    }
    const row = await sql(`SELECT m.id, m.content_type ${exhibits}
      JOIN room_shares s ON s.owner_id = r.owner_id
      WHERE s.token = ? AND r.id = ? AND m.id IS NOT NULL`, token, placementId).first();
    return (await modelResponse(COVERS, row, headers)) ?? notFound();
  }

  // Distinguish an empty shared room from a nonexistent or revoked link.
  const share = await sql('SELECT owner_id FROM room_shares WHERE token = ?', token).first();
  if (!share) return notFound();

  const { results } = await sql(`SELECT r.id, r.surface, r.x, r.z, r.rotation_y, r.scale,
    p.name, p.category, c.id AS cover_id, m.id AS model_id
    ${exhibits} WHERE r.owner_id = ? ORDER BY r.surface, r.x, r.id`, share.owner_id).all();

  return Response.json({
    placements: results.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      surface: row.surface,
      x: row.x,
      z: row.z,
      rotationY: row.rotation_y,
      scale: row.scale,
      coverPath: row.cover_id ? `/api/public/rooms/${token}/covers/${row.id}` : null,
      ...(row.model_id && { modelPath: `/api/public/rooms/${token}/models/${row.id}` }),
    })),
  }, { headers });
}
