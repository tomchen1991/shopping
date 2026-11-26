export const SURFACES = {
  'desk-main': {
    id: 'desk-main',
    category: 'electronics',
    label: '办公桌台面',
    zone: 'electronics',
    bounds: { xMin: -0.46, xMax: 0.54, zMin: -1.66, zMax: 1.66, y: 0.9 },
    defaultRotY: Math.PI / 2,
    itemRadius: 0.24,
    // Keep-out footprints in normalized [0..1] surface coordinates for fixed studio equipment
    obstacles: [
      { x: 0.14, z: 0.48, r: 0.17 }, // Studio monitor + speakers back-center
      { x: 0.62, z: 0.48, r: 0.16 }, // Keyboard + mouse + desk mat
      { x: 0.25, z: 0.14, r: 0.14 }, // MacBook Pro + stand
      { x: 0.72, z: 0.66, r: 0.11 }, // iPad Air 4 + OPPO Find X8
      { x: 0.78, z: 0.28, r: 0.09 }, // Kindle + mug
      { x: 0.08, z: 0.04, r: 0.09 }, // Desk lamp base
      { x: 0.16, z: 0.92, r: 0.08 }, // Succulent pot
    ],
  },
  'game-upper': {
    id: 'game-upper',
    category: 'game',
    label: '游戏柜 · 上层',
    zone: 'game',
    bounds: { xMin: -1.26, xMax: 1.26, zMin: -0.18, zMax: 0.2, y: 1.94 },
    defaultRotY: 0,
    itemRadius: 0.22,
    obstacles: [
      { x: 0.08, z: 0.45, r: 0.12 }, // Collector artbooks on far left
    ],
  },
  'game-lower': {
    id: 'game-lower',
    category: 'game',
    label: '游戏柜 · 中层',
    zone: 'game',
    bounds: { xMin: -1.26, xMax: 1.26, zMin: -0.18, zMax: 0.2, y: 1.02 },
    defaultRotY: 0,
    itemRadius: 0.22,
    obstacles: [],
  },
  'figure-upper': {
    id: 'figure-upper',
    category: 'figure',
    label: '手办柜 · 上层',
    zone: 'figure',
    bounds: { xMin: -0.82, xMax: 0.82, zMin: -0.32, zMax: 0.32, y: 2.08 },
    defaultRotY: 0,
    itemRadius: 0.24,
    obstacles: [],
  },
  'figure-lower': {
    id: 'figure-lower',
    category: 'figure',
    label: '手办柜 · 下层',
    zone: 'figure',
    bounds: { xMin: -0.82, xMax: 0.82, zMin: -0.32, zMax: 0.32, y: 1.2 },
    defaultRotY: 0,
    itemRadius: 0.24,
    obstacles: [],
  },
};

export function clamp01(val) {
  return Math.min(0.96, Math.max(0.04, val));
}

export function surfaceNormToLocal(surfaceId, nx, nz) {
  const s = SURFACES[surfaceId];
  const x = s.bounds.xMin + (s.bounds.xMax - s.bounds.xMin) * nx;
  const z = s.bounds.zMin + (s.bounds.zMax - s.bounds.zMin) * nz;
  return [x, s.bounds.y, z];
}

export function surfaceLocalToNorm(surfaceId, lx, lz) {
  const s = SURFACES[surfaceId];
  const nx = (lx - s.bounds.xMin) / (s.bounds.xMax - s.bounds.xMin);
  const nz = (lz - s.bounds.zMin) / (s.bounds.zMax - s.bounds.zMin);
  return { x: clamp01(nx), z: clamp01(nz) };
}

export function checkSurfacePlacement(surfaceId, nx, nz, placements = [], ignoreHoldingId = null, scale = 1) {
  const s = SURFACES[surfaceId];
  if (!s) return { ok: false, reason: 'invalid_surface' };
  const w = s.bounds.xMax - s.bounds.xMin;
  const d = s.bounds.zMax - s.bounds.zMin;
  const wx = s.bounds.xMin + w * nx;
  const wz = s.bounds.zMin + d * nz;

  for (const obs of s.obstacles) {
    const ox = s.bounds.xMin + w * obs.x;
    const oz = s.bounds.zMin + d * obs.z;
    const minDist = obs.r * Math.max(w, d) * 0.42 + s.itemRadius * 0.65 * scale;
    if (Math.hypot(wx - ox, wz - oz) < minDist) {
      return { ok: false, reason: 'obstacle' };
    }
  }

  for (const p of placements) {
    if (p.surface !== surfaceId || p.holdingId === ignoreHoldingId) continue;
    const px = s.bounds.xMin + w * p.x;
    const pz = s.bounds.zMin + d * p.z;
    const minDist = s.itemRadius * (scale + (p.scale ?? 1)) * 0.85;
    if (Math.hypot(wx - px, wz - pz) < minDist) {
      return { ok: false, reason: 'overlap' };
    }
  }

  return { ok: true };
}

export function findOpenSpot(category, placements = [], preferredSurface = null) {
  const candidates = Object.values(SURFACES).filter(s => s.category === category);
  if (preferredSurface) {
    candidates.sort((a, b) => (a.id === preferredSurface ? -1 : b.id === preferredSurface ? 1 : 0));
  }

  for (const s of candidates) {
    const xSteps = s.id === 'desk-main' ? [0.58, 0.72, 0.36, 0.84] : [0.5, 0.28, 0.72, 0.16, 0.84, 0.4, 0.6];
    const zSteps = s.id === 'desk-main' ? [0.85, 0.12, 0.74, 0.22, 0.92, 0.08] : [0.52, 0.34, 0.68];
    for (const nz of zSteps) {
      for (const nx of xSteps) {
        if (checkSurfacePlacement(s.id, nx, nz, placements).ok) {
          return { surface: s.id, x: nx, z: nz, rotationY: 0, scale: 1 };
        }
      }
    }
  }

  const fallback = candidates[0] || SURFACES['desk-main'];
  return { surface: fallback.id, x: 0.5, z: 0.5, rotationY: 0, scale: 1 };
}
