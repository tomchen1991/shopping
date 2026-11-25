CREATE TABLE models (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('model/gltf-binary')),
  UNIQUE (owner_id, id)
) STRICT;

ALTER TABLE products ADD COLUMN model_id TEXT REFERENCES models (id);
