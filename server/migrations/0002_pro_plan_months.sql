-- Keep years readable and writable by the previous Worker during rollout.
ALTER TABLE plans ADD COLUMN months INTEGER
  CHECK(months IN (0, 1, 3, 6, 12, 24));
ALTER TABLE orders ADD COLUMN months INTEGER
  CHECK(months IN (0, 1, 3, 6, 12, 24));

UPDATE plans SET months = years * 12;
INSERT INTO plans (id, name, years, months) VALUES
  ('pro-1m', 'Pro 1 tháng', 0, 1),
  ('pro-3m', 'Pro 3 tháng', 0, 3),
  ('pro-6m', 'Pro 6 tháng', 0, 6);

DROP TRIGGER issue_paid_license;
CREATE TRIGGER issue_paid_license AFTER INSERT ON payment_transactions
BEGIN
  INSERT INTO licenses (machine_code, expires_at, updated_at)
  SELECT machine_code,
    CASE
      WHEN term = 0 OR permanent THEN NULL
      ELSE COALESCE(
        unixepoch(base, 'unixepoch', printf('+%d months', term), 'floor'),
        CASE WHEN base >= unixepoch('9998-01-01') THEN 253402300799
          ELSE RAISE(ABORT, 'Cannot calculate Pro expiration') END
      )
    END,
    NEW.paid_at
  FROM (
    SELECT o.machine_code,
      COALESCE(o.months, o.years * 12) AS term,
      l.machine_code IS NOT NULL AND l.expires_at IS NULL AS permanent,
      MAX(NEW.paid_at, COALESCE(o.prior_expires_at, 0), COALESCE(l.expires_at, 0)) AS base
    FROM orders o LEFT JOIN licenses l ON l.machine_code = o.machine_code
    WHERE o.id = NEW.order_id
  ) WHERE 1
  ON CONFLICT(machine_code) DO UPDATE SET
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  INSERT INTO license_issuances (order_id, machine_code, expires_at, issued_at)
  SELECT NEW.order_id, l.machine_code, l.expires_at, NEW.paid_at
  FROM licenses l JOIN orders o ON o.machine_code = l.machine_code WHERE o.id = NEW.order_id;

  UPDATE orders SET paid_at = NEW.paid_at WHERE id = NEW.order_id;
END;
