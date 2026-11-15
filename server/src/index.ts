import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createSigner, digest, machinePattern, orderPattern, productionPublicKey, tokenPattern, verifyKey } from './license'
import { localOrigin, mockSignature, paymentProvider, type Env, type Payment } from './provider'

const planIds = ['pro-1m', 'pro-3m', 'pro-6m', 'pro-1y', 'pro-2y', 'pro-lifetime']
type Plan = { id: string; name: string; years: number; months: number; amount: number }
type Order = {
  id: string; order_code: number; recovery_hash: string; machine_code: string
  plan_id: string; amount: number; provider: 'payos' | 'mock'; payment_link_id: string | null
  checkout_url: string | null; expires_at: number; paid_at: number | null
}

const app = new Hono<{ Bindings: Env }>()
const now = () => Math.floor(Date.now() / 1000)
const route = '/v1'
const signerCache = new WeakMap<Env, ReturnType<typeof createSigner>>()

async function signer(env: Env) {
  if (!env.LICENSE_SIGNING_PKCS8_B64 || (env.PAYMENT_PROVIDER === 'payos' && env.LICENSE_PUBLIC_KEY_HEX !== productionPublicKey)) {
    throw new Error('License signing is not configured')
  }
  let candidate = signerCache.get(env)
  if (!candidate) {
    candidate = createSigner(env.LICENSE_SIGNING_PKCS8_B64, env.LICENSE_PUBLIC_KEY_HEX)
    signerCache.set(env, candidate)
  }
  return candidate
}

function parseBearer(value: string | undefined) {
  const token = value?.startsWith('Bearer ') ? value.slice(7) : ''
  return tokenPattern.test(token) ? token : undefined
}

async function authorized(env: Env, id: string, token: string | undefined) {
  if (!orderPattern.test(id) || !token) return null
  return env.DB.prepare('SELECT * FROM orders WHERE id = ? AND recovery_hash = ?')
    .bind(id, await digest(token)).first<Order>()
}

function status(order: Order) {
  return {
    id: order.id, planId: order.plan_id, amount: order.amount, expiresAt: order.expires_at,
    status: order.paid_at !== null ? 'paid' : order.expires_at <= now() ? 'expired' : 'pending',
    checkoutUrl: order.paid_at !== null || order.expires_at <= now() ? null : order.checkout_url,
  }
}

async function claim(env: Env, order: Order) {
  const grant = await env.DB.prepare(
    `SELECT l.expires_at FROM license_issuances i JOIN licenses l ON l.machine_code = i.machine_code
      WHERE i.order_id = ? AND i.machine_code = ?`,
  ).bind(order.id, order.machine_code).first<{ expires_at: number | null }>()
  if (!grant || (grant.expires_at !== null && grant.expires_at <= now())) return null
  return {
    expiresAt: grant.expires_at, key: await (await signer(env)).sign(order.machine_code, grant.expires_at),
  }
}

function randomOrderCode() {
  return crypto.getRandomValues(new Uint32Array(2)).reduce((code, word, index) =>
    code + (index === 0 ? word * 1024 : word % 1024), 1)
}

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Content-Security-Policy', "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
  await next()
})
app.use('/v1/*', bodyLimit({ maxSize: 24 * 1024 }))
app.onError((_error, c) => c.json({ error: 'Dịch vụ Pro tạm thời không khả dụng. Vui lòng thử lại.' }, 503))

app.get(route + '/plans', async (c) => {
  if (c.env.PAYMENT_PROVIDER === 'disabled') return c.json({ plans: [] })
  const result = await c.env.DB.prepare(
    `SELECT id, name, years, months, amount FROM plans
     WHERE active = 1 AND months IS NOT NULL AND id IN (?, ?, ?, ?, ?, ?) ORDER BY months = 0, months`,
  ).bind(...planIds).all<Plan>()
  return c.json({ plans: result.results, currency: 'VND' })
})

app.post(route + '/orders', async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null
  const token = parseBearer(c.req.header('Authorization'))
  if (!body || typeof body.id !== 'string' || !orderPattern.test(body.id) || !token
    || typeof body.machineCode !== 'string' || !machinePattern.test(body.machineCode)
    || typeof body.planId !== 'string' || !planIds.includes(body.planId)
    || (body.currentKey != null && (typeof body.currentKey !== 'string' || body.currentKey.length > 120))) {
    return c.json({ error: 'Thông tin đơn hàng không hợp lệ.' }, 400)
  }
  const env = c.env
  const provider = paymentProvider(env)
  const issuer = await signer(env)
  const { id, machineCode, planId } = body
  let order = await authorized(env, id, token)
  if (!order) {
    const plan = await env.DB.prepare('SELECT id, name, years, months, amount FROM plans WHERE id = ? AND active = 1 AND months IS NOT NULL')
      .bind(planId).first<Plan>()
    if (!plan) return c.json({ error: 'Gói Pro này chưa mở bán.' }, 404)
    const prior = typeof body.currentKey === 'string' ? await verifyKey(body.currentKey, machineCode, issuer.publicKey) : undefined
    if (typeof body.currentKey === 'string' && !prior) return c.json({ error: 'Key hiện tại không khớp với mã máy.' }, 400)
    if (prior?.expiresAt === null) return c.json({ error: 'Máy này đã có Pro vĩnh viễn.' }, 409)
    const created = now()
    await env.DB.prepare(
      `INSERT INTO orders (id, order_code, recovery_hash, machine_code, plan_id, amount, years, months,
        prior_expires_at, provider, created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE machine_code = ? AND expires_at IS NULL)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(id, randomOrderCode(), await digest(token), machineCode, planId, plan.amount, plan.years, plan.months,
      prior?.expiresAt ?? null, env.PAYMENT_PROVIDER, created, created + 30 * 60, machineCode).run()
    order = await authorized(env, id, token)
    if (!order && await env.DB.prepare('SELECT 1 FROM licenses WHERE machine_code = ? AND expires_at IS NULL').bind(machineCode).first()) {
      return c.json({ error: 'Máy này đã có Pro vĩnh viễn.' }, 409)
    }
  }
  if (!order) return c.json({ error: 'Không tìm thấy đơn hàng.' }, 404)
  if (order.plan_id !== planId || order.machine_code !== machineCode || order.provider !== env.PAYMENT_PROVIDER) {
    return c.json({ error: 'Thông tin không khớp với đơn đã tạo.' }, 409)
  }
  if (!order.checkout_url && order.paid_at === null && order.expires_at > now()) {
    const checkout = await provider.create(order)
    await env.DB.prepare(
      `UPDATE orders SET payment_link_id = ?, checkout_url = ?
       WHERE id = ? AND (payment_link_id IS NULL OR payment_link_id = ?)`,
    ).bind(checkout.linkId, checkout.url, id, checkout.linkId).run()
    order = (await authorized(env, id, token))!
  }
  return c.json(status(order))
})

app.get(route + '/orders/:id', async (c) => {
  const order = await authorized(c.env, c.req.param('id') ?? '', parseBearer(c.req.header('Authorization')))
  return order ? c.json(status(order)) : c.json({ error: 'Không tìm thấy đơn hàng.' }, 404)
})

app.post(route + '/orders/:id/key', async (c) => {
  const order = await authorized(c.env, c.req.param('id') ?? '', parseBearer(c.req.header('Authorization')))
  if (!order) return c.json({ error: 'Không tìm thấy đơn hàng.' }, 404)
  const license = await claim(c.env, order)
  return license ? c.json(license) : c.json({ error: 'Chưa có bản quyền còn hiệu lực cho đơn này.' }, 409)
})

app.post(route + '/licenses/recover', async (c) => {
  const body = await c.req.json().catch(() => null) as { orderId?: unknown; machineCode?: unknown } | null
  const order = typeof body?.orderId === 'string'
    ? await authorized(c.env, body.orderId, parseBearer(c.req.header('Authorization'))) : null
  if (!order || body?.machineCode !== order.machine_code) return c.json({ error: 'Mã khôi phục không hợp lệ cho máy này.' }, 404)
  const license = await claim(c.env, order)
  return license ? c.json(license) : c.json({ error: 'Chưa có bản quyền còn hiệu lực cho đơn này.' }, 409)
})

function validPayment(data: Payment | undefined): data is Payment {
  return !!data && Number.isSafeInteger(data.orderCode) && data.orderCode > 0
    && Number.isSafeInteger(data.amount) && data.amount > 0
    && typeof data.currency === 'string' && typeof data.code === 'string'
    && typeof data.reference === 'string' && data.reference.length > 0 && data.reference.length <= 128
    && typeof data.paymentLinkId === 'string' && data.paymentLinkId.length > 0 && data.paymentLinkId.length <= 128
}

async function recordPayment(env: Env, payment: Payment) {
  const { orderCode, reference, currency, amount, paymentLinkId, code } = payment
  const order = await env.DB.prepare('SELECT * FROM orders WHERE order_code = ? AND provider = ?')
    .bind(orderCode, env.PAYMENT_PROVIDER).first<Order>()
  const received = now()
  const amountMatches = order && currency === 'VND' && amount === order.amount
  if (code === '00' && amountMatches && !order.payment_link_id) {
    // Ask payOS to retry if the server has not yet saved the link it created.
    throw new Error('Checkout link has not been recorded')
  }
  const matched = amountMatches && paymentLinkId === order.payment_link_id
  const outcome = code !== '00' ? 'ignored' : !order ? 'unknown' : matched ? 'matched' : 'rejected'
  const fingerprint = await digest(JSON.stringify([orderCode, reference, currency, amount, paymentLinkId, code]))
  const statements = [
    env.DB.prepare('INSERT OR IGNORE INTO webhook_events VALUES (?, ?, ?, ?, ?, ?)')
      .bind(env.PAYMENT_PROVIDER, fingerprint, orderCode, reference, outcome, received),
  ]
  if (code === '00' && matched) {
    await signer(env)
    statements.push(env.DB.prepare(
      `INSERT OR IGNORE INTO payment_transactions (provider, reference, order_id, amount, paid_at)
       SELECT provider, ?, id, amount, ? FROM orders
       WHERE id = ? AND paid_at IS NULL AND amount = ? AND payment_link_id = ?`,
    ).bind(reference, received, order.id, amount, paymentLinkId))
  }
  await env.DB.batch(statements)
}

app.post(route + '/webhooks/payos', async (c) => {
  const provider = paymentProvider(c.env)
  const body: unknown = await c.req.json().catch(() => null)
  const payment = await provider.verify(body).catch(() => undefined)
  if (!validPayment(payment)) return c.json({ error: 'Webhook không hợp lệ.' }, 400)
  await recordPayment(c.env, payment)
  return c.json({ ok: true })
})

app.get('/checkout/result', (c) => c.text('Quay lại FunChoice để kiểm tra trạng thái thanh toán.'))

app.on(['GET', 'POST'], '/mock/checkout/:id', async (c) => {
  const env = c.env
  if (env.PAYMENT_PROVIDER !== 'mock' || !localOrigin(env.PUBLIC_BASE_URL) || !localOrigin(c.req.url) || !env.MOCK_WEBHOOK_SECRET) {
    return c.notFound()
  }
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND provider = 'mock' AND checkout_url IS NOT NULL")
    .bind(c.req.param('id')).first<Order>()
  if (!order) return c.notFound()
  if (c.req.method === 'GET') {
    return c.html('<html lang="vi"><meta charset="utf-8"><title>FunChoice · Thanh toán thử</title><h1>Thanh toán thử FunChoice</h1><p>Mô phỏng đơn ' +
      order.amount + ' đồng.</p><form method="post"><button>Xác nhận thanh toán giả lập</button></form></html>')
  }
  if (order.expires_at <= now()) return c.text('Đơn thử đã hết hạn.', 409)
  const data: Payment = { code: '00', currency: 'VND', amount: order.amount, orderCode: order.order_code,
    reference: 'mock:' + order.id, paymentLinkId: order.payment_link_id! }
  const { key, bytes } = await mockSignature(data, env.MOCK_WEBHOOK_SECRET)
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes))))
  const received = await paymentProvider(env).verify({ data, signature })
  if (!validPayment(received)) return c.text('Không xác minh được thanh toán thử.', 400)
  await recordPayment(env, received)
  return c.redirect('/checkout/result', 303)
})

export default app
