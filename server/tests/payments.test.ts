import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createTestHarness } from 'wrangler'
import { createSigner, verifyKey } from '../src/license'
import { mockSignature, type Env, type Payment } from '../src/provider'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
const hex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
const mockSecret = 'temporary-test-only'
const server = createTestHarness({ workers: [{
  configPath: './wrangler.jsonc',
  vars: { PAYMENT_PROVIDER: 'mock', PUBLIC_BASE_URL: 'http://127.0.0.1:8787', LICENSE_PUBLIC_KEY_HEX: hex },
  secrets: { MOCK_WEBHOOK_SECRET: mockSecret, LICENSE_SIGNING_PKCS8_B64: pkcs8 },
}] })
const machine = 'FC-' + '9'.repeat(32)
const worker = server.getWorker<Env>()
let db: D1Database
type Receipt = { id: string; token: string; planId: string }
const catalog = [
  { id: 'pro-1m', name: 'Pro 1 tháng', months: 1, amount: 19000 },
  { id: 'pro-3m', name: 'Pro 3 tháng', months: 3, amount: 39000 },
  { id: 'pro-6m', name: 'Pro 6 tháng', months: 6, amount: 69000 },
  { id: 'pro-1y', name: 'Pro 1 năm', months: 12, amount: 100000 },
  { id: 'pro-2y', name: 'Pro 2 năm', months: 24, amount: 180000 },
  { id: 'pro-lifetime', name: 'Pro vĩnh viễn', months: 0, amount: 300000 },
]

before(async () => {
  await server.listen()
  await worker.applyD1Migrations('DB')
  db = (await worker.getEnv()).DB
  assert.deepEqual(await expectJson(await request('/v1/plans'), 200), { plans: [], currency: 'VND' })
  assert.equal((await create(receipt('pro-1m'))).status, 404)
  await db.batch(catalog.map(({ amount, id }) => db.prepare('UPDATE plans SET amount = ?, active = 1 WHERE id = ?').bind(amount, id)))
})
after(async () => server.close())

function request(path: string, method = 'GET', token?: string, data?: object) {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (data) headers['Content-Type'] = 'application/json'
  return server.fetch(path, { method, headers, body: data ? JSON.stringify(data) : undefined })
}

async function expectJson<T>(response: Awaited<ReturnType<typeof request>>, code: number): Promise<T> {
  if (response.status !== code) assert.equal(response.status, code, await response.text())
  return await response.json() as T
}

async function create(receipt: Receipt, code = machine, currentKey?: string) {
  return request('/v1/orders', 'POST', receipt.token, { id: receipt.id, planId: receipt.planId, machineCode: code, currentKey, amount: 1 })
}

function receipt(planId: string) { return { id: randomUUID(), token: randomBytes(32).toString('hex'), planId } }

async function payment(entry: Receipt, overrides: Partial<Payment> = {}): Promise<Payment> {
  const row = await db.prepare('SELECT order_code, amount, payment_link_id FROM orders WHERE id = ?')
    .bind(entry.id).first<{ order_code: number; amount: number; payment_link_id: string }>()
  assert.ok(row)
  return { orderCode: row.order_code, amount: row.amount, paymentLinkId: row.payment_link_id, code: '00',
    currency: 'VND', reference: 'ref-' + entry.id, ...overrides }
}

async function webhook(data: Payment, valid = true) {
  const { key, bytes } = await mockSignature(data, mockSecret)
  const signature = valid ? Buffer.from(await crypto.subtle.sign('HMAC', key, bytes)).toString('base64') : 'AAAA'
  return request('/v1/webhooks/payos', 'POST', undefined, { data, signature })
}

test('D1 checkout, signed webhook, replay, reconnect, renewal and lifetime upgrade', async () => {
  assert.equal((await create(receipt('pro-2m'))).status, 400)
  const { plans } = await expectJson<{ plans: (typeof catalog[number] & { years: number })[] }>(await request('/v1/plans'), 200)
  assert.deepEqual(plans.map(({ id, name, months, amount }) => ({ id, name, months, amount })), catalog)
  const first = receipt('pro-1y')
  const issuer = await createSigner(pkcs8, hex)
  const oldExpiry = 1932500000
  const prior = await issuer.sign(machine, oldExpiry)
  const initial = await expectJson<{ amount: number; checkoutUrl: string }>(await create(first, machine, prior), 200)
  assert.equal(initial.amount, 100000)
  assert.equal((await expectJson<{ checkoutUrl: string }>(await create(first), 200)).checkoutUrl, initial.checkoutUrl)
  assert.equal((await request('/v1/orders/' + first.id)).status, 404)
  assert.equal((await request('/v1/orders/' + first.id, 'GET', randomBytes(32).toString('hex'))).status, 404)
  assert.equal((await request('/checkout/result?status=PAID&orderId=' + first.id)).status, 200)
  assert.equal((await request('/v1/orders/' + first.id + '/key', 'POST', first.token)).status, 409)
  const charge = await payment(first)
  assert.equal((await webhook(charge, false)).status, 400)
  await db.prepare('UPDATE orders SET payment_link_id = NULL WHERE id = ?').bind(first.id).run()
  assert.equal((await webhook(charge)).status, 503)
  await db.prepare('UPDATE orders SET payment_link_id = ? WHERE id = ?').bind(charge.paymentLinkId, first.id).run()
  assert.equal((await webhook({ ...charge, amount: 1 })).status, 200)
  assert.equal((await webhook({ ...charge, paymentLinkId: 'wrong-link' })).status, 200)
  assert.equal((await request('/v1/orders/' + first.id + '/key', 'POST', first.token)).status, 409)

  const results = await Promise.all([webhook(charge), webhook(charge), webhook(charge)])
  assert.ok(results.every((response) => response.status === 200))
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM license_issuances').first<{ n: number }>())?.n, 1)
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE outcome = 'matched'").first<{ n: number }>())?.n, 1)
  assert.equal((await request('/v1/orders/' + first.id + '/key', 'POST')).status, 404)
  const firstKey = await expectJson<{ key: string; expiresAt: number }>(
    await request('/v1/orders/' + first.id + '/key', 'POST', first.token), 200)
  assert.ok(firstKey.expiresAt > oldExpiry)
  assert.deepEqual(await verifyKey(firstKey.key, machine, issuer.publicKey), { expiresAt: firstKey.expiresAt })
  assert.equal((await request('/v1/licenses/recover', 'POST', undefined, { orderId: first.id, machineCode: machine })).status, 404)
  assert.equal((await request('/v1/licenses/recover', 'POST', first.token, { orderId: first.id, machineCode: 'FC-' + '8'.repeat(32) })).status, 404)
  assert.deepEqual(await expectJson(await request('/v1/licenses/recover', 'POST', first.token, { orderId: first.id, machineCode: machine }), 200), firstKey)

  const renewal = receipt('pro-2y')
  const lifetime = receipt('pro-lifetime')
  assert.equal((await create(renewal)).status, 200)
  assert.equal((await create(lifetime)).status, 200)
  assert.equal((await webhook(await payment(renewal, { reference: charge.reference }))).status, 200)
  assert.equal((await request('/v1/orders/' + renewal.id + '/key', 'POST', renewal.token)).status, 409)
  assert.equal((await webhook(await payment(renewal))).status, 200)
  const extension = await expectJson<{ expiresAt: number }>(await request('/v1/orders/' + renewal.id + '/key', 'POST', renewal.token), 200)
  assert.equal(extension.expiresAt, addCalendarMonths(firstKey.expiresAt, 24))
  assert.equal((await webhook(await payment(lifetime))).status, 200)
  const recovered = await expectJson<{ key: string; expiresAt: null }>(
    await request('/v1/licenses/recover', 'POST', first.token, { orderId: first.id, machineCode: machine }), 200)
  assert.equal(recovered.expiresAt, null)
  assert.deepEqual(await verifyKey(recovered.key, machine, issuer.publicKey), { expiresAt: null })
  assert.equal((await create(receipt('pro-1y'))).status, 409)
})

function addCalendarMonths(timestamp: number, months: number) {
  const date = new Date(timestamp * 1000)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const end = new Date(date.getTime())
  end.setUTCMonth(end.getUTCMonth() + 1, 0)
  date.setUTCDate(Math.min(day, end.getUTCDate()))
  return date.getTime() / 1000
}

test('Monthly checkout snapshots price and duration, renews repeatedly and upgrades to lifetime', async () => {
  const owner = 'FC-' + '7'.repeat(32)
  const expired = Math.floor(Date.now() / 1000) - 86400
  const issuer = await createSigner(pkcs8, hex)
  const expiredKey = await issuer.sign(owner, expired)
  await db.prepare('INSERT INTO licenses VALUES (?, ?, ?)').bind(owner, expired, expired).run()
  let previous = 0
  for (const plan of catalog.filter(({ months }) => months <= 6 && months > 0)) {
    const entry = receipt(plan.id)
    const checkout = await expectJson<{ amount: number }>(await create(entry, owner, expiredKey), 200)
    assert.equal(checkout.amount, plan.amount)
    // Editing a catalogue entry cannot change the terms of an already created checkout.
    await db.prepare('UPDATE plans SET months = 24, amount = amount + 1, active = 0 WHERE id = ?').bind(plan.id).run()
    try {
      assert.equal((await create(entry, owner)).status, 200)
      const charge = await payment(entry)
      assert.equal((await webhook({ ...charge, amount: plan.amount + 1 })).status, 200)
      assert.equal((await request('/v1/orders/' + entry.id + '/key', 'POST', entry.token)).status, 409)
      assert.equal((await webhook(charge)).status, 200)
      assert.equal((await webhook(charge)).status, 200)
      const row = await db.prepare('SELECT paid_at, months FROM orders WHERE id = ?').bind(entry.id)
        .first<{ paid_at: number; months: number }>()
      assert.equal(row?.months, plan.months)
      const key = await expectJson<{ key: string; expiresAt: number }>(
        await request('/v1/orders/' + entry.id + '/key', 'POST', entry.token), 200)
      assert.equal(key.expiresAt, addCalendarMonths(Math.max(previous, row.paid_at), plan.months))
      assert.deepEqual(await verifyKey(key.key, owner, issuer.publicKey), { expiresAt: key.expiresAt })
      previous = key.expiresAt
    } finally {
      await db.prepare('UPDATE plans SET months = ?, amount = ?, active = 1 WHERE id = ?').bind(plan.months, plan.amount, plan.id).run()
    }
  }
  const pending = receipt('pro-1m')
  const lifetime = receipt('pro-lifetime')
  assert.equal((await create(pending, owner)).status, 200)
  assert.equal((await create(lifetime, owner)).status, 200)
  assert.equal((await webhook(await payment(lifetime))).status, 200)
  assert.equal((await create(receipt('pro-6m'), owner)).status, 409)
  assert.equal((await create(pending, owner)).status, 200)
  assert.equal((await webhook(await payment(pending))).status, 200)
  const grant = await expectJson<{ key: string; expiresAt: null }>(
    await request('/v1/orders/' + pending.id + '/key', 'POST', pending.token), 200)
  assert.equal(grant.expiresAt, null)
  assert.deepEqual(await verifyKey(grant.key, owner, issuer.publicKey), { expiresAt: null })
  const legacyPermanentKey = await issuer.sign('FC-' + '6'.repeat(32), null)
  assert.equal((await create(receipt('pro-3m'), 'FC-' + '6'.repeat(32), legacyPermanentKey)).status, 409)
})
