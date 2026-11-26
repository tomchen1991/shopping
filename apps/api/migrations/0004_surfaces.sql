-- Migrate fixed 6-slot room_placements to continuous display-surface placements.
CREATE TABLE room_placements_v2 (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  owner_id TEXT NOT NULL,
  holding_id TEXT NOT NULL,
  surface TEXT NOT NULL CHECK (surface IN (
    'desk-main',
    'game-upper', 'game-lower',
    'figure-upper', 'figure-lower'
  )),
  x REAL NOT NULL CHECK (x >= 0.0 AND x <= 1.0),
  z REAL NOT NULL CHECK (z >= 0.0 AND z <= 1.0),
  rotation_y REAL NOT NULL DEFAULT 0.0,
  scale REAL NOT NULL DEFAULT 1.0 CHECK (scale >= 0.6 AND scale <= 1.6),
  UNIQUE (owner_id, holding_id),
  FOREIGN KEY (owner_id, holding_id) REFERENCES holdings (owner_id, id)
) STRICT;

INSERT INTO room_placements_v2 (owner_id, holding_id, surface, x, z, rotation_y, scale)
SELECT
  owner_id,
  holding_id,
  CASE slot
    WHEN 'desk-1' THEN 'desk-main'
    WHEN 'desk-2' THEN 'desk-main'
    WHEN 'shelf-1' THEN 'game-upper'
    WHEN 'shelf-2' THEN 'game-lower'
    WHEN 'cabinet-1' THEN 'figure-upper'
    ELSE 'figure-lower'
  END,
  CASE slot
    WHEN 'desk-1' THEN 0.45
    WHEN 'desk-2' THEN 0.55
    WHEN 'shelf-1' THEN 0.28
    WHEN 'shelf-2' THEN 0.72
    ELSE 0.5
  END,
  CASE slot
    WHEN 'desk-1' THEN 0.14
    WHEN 'desk-2' THEN 0.86
    ELSE 0.52
  END,
  0.0,
  1.0
FROM room_placements;

DROP TABLE room_placements;
ALTER TABLE room_placements_v2 RENAME TO room_placements;
CREATE INDEX room_placements_owner ON room_placements (owner_id, surface);
