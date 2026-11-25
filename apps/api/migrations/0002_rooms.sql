CREATE TABLE room_placements (
  owner_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('desk-1', 'desk-2', 'shelf-1', 'shelf-2', 'cabinet-1', 'cabinet-2')),
  holding_id TEXT NOT NULL,
  PRIMARY KEY (owner_id, slot),
  UNIQUE (owner_id, holding_id),
  FOREIGN KEY (owner_id, holding_id) REFERENCES holdings (owner_id, id)
) STRICT;

-- Absence means private. Deleting the token permanently revokes the old URL.
CREATE TABLE room_shares (
  owner_id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL UNIQUE
) STRICT;
