CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  years INTEGER NOT NULL CHECK(years IN (0, 1, 2)),
  amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
  CHECK(active = 0 OR amount > 0)
);
INSERT INTO plans (id, name, years) VALUES
  ('pro-1y', 'Pro 1 năm', 1), ('pro-2y', 'Pro 2 năm', 2), ('pro-lifetime', 'Pro vĩnh viễn', 0);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_code INTEGER NOT NULL UNIQUE,
  recovery_hash TEXT NOT NULL,
  machine_code TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  years INTEGER NOT NULL CHECK(years IN (0, 1, 2)),
  prior_expires_at INTEGER,
  provider TEXT NOT NULL CHECK(provider IN ('payos', 'mock')),
  payment_link_id TEXT,
  checkout_url TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE UNIQUE INDEX orders_provider_link ON orders(provider, payment_link_id) WHERE payment_link_id IS NOT NULL;

CREATE TABLE payment_transactions (
  provider TEXT NOT NULL,
  reference TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  paid_at INTEGER NOT NULL,
  PRIMARY KEY(provider, reference)
);

CREATE TABLE licenses (
  machine_code TEXT PRIMARY KEY,
  expires_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE license_issuances (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  machine_code TEXT NOT NULL REFERENCES licenses(machine_code),
  expires_at INTEGER,
  issued_at INTEGER NOT NULL
);

CREATE TABLE webhook_events (
  provider TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  order_code INTEGER NOT NULL,
  reference TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('matched','rejected','unknown','ignored')),
  received_at INTEGER NOT NULL,
  PRIMARY KEY(provider, fingerprint)
);

-- This trigger runs exactly once per accepted payment, in the same D1 transaction.
CREATE TRIGGER issue_paid_license AFTER INSERT ON payment_transactions
BEGIN
  INSERT INTO licenses (machine_code, expires_at, updated_at)
  SELECT machine_code, CASE WHEN years = 0 THEN NULL ELSE
    COALESCE(unixepoch(MAX(NEW.paid_at, COALESCE(prior_expires_at, 0)), 'unixepoch', printf('+%d years', years)), 253402300799)
    END, NEW.paid_at
  FROM orders WHERE id = NEW.order_id
  ON CONFLICT(machine_code) DO UPDATE SET
    expires_at = CASE
      WHEN licenses.expires_at IS NULL OR excluded.expires_at IS NULL THEN NULL
      ELSE (SELECT COALESCE(unixepoch(MAX(licenses.expires_at, NEW.paid_at, COALESCE(prior_expires_at, 0)),
        'unixepoch', printf('+%d years', years)), 253402300799) FROM orders WHERE id = NEW.order_id)
    END,
    updated_at = NEW.paid_at;

  INSERT INTO license_issuances (order_id, machine_code, expires_at, issued_at)
  SELECT NEW.order_id, licenses.machine_code, licenses.expires_at, NEW.paid_at
  FROM licenses JOIN orders ON orders.machine_code = licenses.machine_code WHERE orders.id = NEW.order_id;

  UPDATE orders SET paid_at = NEW.paid_at WHERE id = NEW.order_id;
END;
