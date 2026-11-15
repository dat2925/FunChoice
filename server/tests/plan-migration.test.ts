import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

const migration = (file: string) => readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8')
const initial = migration('0001_payments.sql')
const sixPlans = migration('0002_pro_plan_months.sql')
const unix = (date: string) => Date.parse(date + 'T13:24:35Z') / 1000

function record(db: DatabaseSync, order: string, amount: number, date: string) {
  db.prepare('INSERT INTO payment_transactions VALUES (?, ?, ?, ?, ?)').run('payos', 'ref-' + order, order, amount, unix(date))
}

test('Additive migration preserves old prices, licenses, transactions and checkouts', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(initial)
    db.exec(`UPDATE plans SET amount = 42000, active = 1 WHERE id = 'pro-1y';
      INSERT INTO orders (id, order_code, recovery_hash, machine_code, plan_id, amount, years, provider,
        payment_link_id, checkout_url, created_at, expires_at) VALUES
      ('paid', 1, 'first-proof', 'first-machine', 'pro-1y', 42000, 1, 'payos', 'paid-link', 'paid-url', 0, 1800),
      ('pending', 2, 'second-proof', 'second-machine', 'pro-2y', 123000, 2, 'payos', 'open-link', 'open-url', 0, 1800);`)
    record(db, 'paid', 42000, '2024-02-29')
    const saved = ['licenses', 'payment_transactions', 'license_issuances'].map((table) => db.prepare(`SELECT * FROM ${table}`).all())
    db.exec(sixPlans)

    assert.deepEqual(['licenses', 'payment_transactions', 'license_issuances'].map((table) => db.prepare(`SELECT * FROM ${table}`).all()), saved)
    const plans = db.prepare('SELECT id, months, amount, active FROM plans ORDER BY months = 0, months').all()
    assert.deepEqual(plans.map(({ id, months, amount, active }) => [id, months, amount, active]), [
      ['pro-1m', 1, 0, 0], ['pro-3m', 3, 0, 0], ['pro-6m', 6, 0, 0],
      ['pro-1y', 12, 42000, 1], ['pro-2y', 24, 0, 0], ['pro-lifetime', 0, 0, 0],
    ])
    const pending = db.prepare("SELECT months, payment_link_id, checkout_url, recovery_hash, amount FROM orders WHERE id = 'pending'").get()
    assert.deepEqual(pending && { ...pending }, {
      months: null, payment_link_id: 'open-link', checkout_url: 'open-url', recovery_hash: 'second-proof', amount: 123000,
    })
    record(db, 'pending', 123000, '2024-02-29')
    assert.equal(db.prepare("SELECT expires_at FROM license_issuances WHERE order_id = 'pending'").get()?.expires_at, unix('2026-02-28'))
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})

test('Calendar expiry preserves time of day and clamps in regular and leap years', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(initial)
    db.exec(sixPlans)
    const cases = [
      ['pro-1m', '2023-01-31', '2023-02-28'], ['pro-1m', '2024-01-31', '2024-02-29'],
      ['pro-1m', '2023-02-28', '2023-03-28'], ['pro-1m', '2024-02-29', '2024-03-29'],
      ['pro-3m', '2023-11-30', '2024-02-29'], ['pro-6m', '2023-08-31', '2024-02-29'],
      ['pro-1y', '2024-02-29', '2025-02-28'], ['pro-2y', '2024-02-29', '2026-02-28'],
    ]
    for (const [index, [plan, anchor, expected]] of cases.entries()) {
      const order = 'test-' + index
      db.prepare(`INSERT INTO orders (id, order_code, recovery_hash, machine_code, plan_id, amount, years, months,
        provider, created_at, expires_at) SELECT ?, ?, 'proof', ?, id, 1, years, months, 'payos', 0, 1800
        FROM plans WHERE id = ?`).run(order, index + 1, order, plan)
      record(db, order, 1, anchor)
      assert.equal(db.prepare('SELECT expires_at FROM license_issuances WHERE order_id = ?').get(order)?.expires_at,
        unix(expected), `${plan}: ${anchor}`)
    }
  } finally { db.close() }
})
