CREATE TABLE covers (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  UNIQUE (owner_id, id)
) STRICT;

CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK (category IN ('electronics', 'game', 'figure')),
  link TEXT,
  target_price_cents INTEGER CHECK (target_price_cents BETWEEN 0 AND 1000000000000),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  interest_reason TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  cover_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, cover_id) REFERENCES covers (owner_id, id)
) STRICT;
CREATE INDEX products_owner_latest ON products (owner_id, created_at DESC, id);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('regular', 'preorder')),
  shop TEXT NOT NULL CHECK (length(trim(shop)) BETWEEN 1 AND 200),
  amount_cents INTEGER CHECK (amount_cents BETWEEN 0 AND 1000000000000),
  deposit_cents INTEGER CHECK (deposit_cents BETWEEN 0 AND 1000000000000),
  balance_cents INTEGER CHECK (balance_cents BETWEEN 0 AND 1000000000000),
  total_cents INTEGER GENERATED ALWAYS AS (coalesce(amount_cents, 0) + coalesce(deposit_cents, 0) + coalesce(balance_cents, 0)) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'cancelled')),
  received_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((kind = 'regular' AND amount_cents IS NOT NULL AND deposit_cents IS NULL AND balance_cents IS NULL)
      OR (kind = 'preorder' AND amount_cents IS NULL AND deposit_cents IS NOT NULL)),
  CHECK ((status = 'received' AND received_date IS NOT NULL) OR (status <> 'received' AND received_date IS NULL)),
  UNIQUE (owner_id, product_id, id),
  FOREIGN KEY (owner_id, product_id) REFERENCES products (owner_id, id)
) STRICT;
CREATE INDEX purchases_product_latest ON purchases (owner_id, product_id, created_at DESC, id);

CREATE TABLE holdings (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  owner_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  purchase_id TEXT NOT NULL UNIQUE,
  received_date TEXT NOT NULL,
  UNIQUE (owner_id, id),
  FOREIGN KEY (owner_id, product_id, purchase_id) REFERENCES purchases (owner_id, product_id, id)
) STRICT;
CREATE INDEX holdings_owner_latest ON holdings (owner_id, received_date DESC, id);

CREATE TRIGGER purchase_must_start_pending
BEFORE INSERT ON purchases WHEN NEW.status <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'purchase must start pending');
END;

CREATE TRIGGER purchase_terminal_status
BEFORE UPDATE OF status, received_date ON purchases WHEN OLD.status <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'purchase is already closed');
END;

CREATE TRIGGER purchase_received_creates_holding
AFTER UPDATE OF status ON purchases WHEN OLD.status = 'pending' AND NEW.status = 'received'
BEGIN
  INSERT INTO holdings (owner_id, product_id, purchase_id, received_date)
  VALUES (NEW.owner_id, NEW.product_id, NEW.id, NEW.received_date);
END;
