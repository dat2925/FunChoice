import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { createTestHarness } from 'wrangler'
import { paymentProvider, type Env } from '../src/provider'

test('payOS checkout calls Worker fetch with the global receiver and signs a short payment description', async (t) => {
  const checksum = 'fixture-checksum'
  const order = { id: 'fixture-order', order_code: 123456, amount: 19000, expires_at: 1800000000 }
  const paymentLinkId = 'a'.repeat(32)
  const checkoutUrl = 'https://pay.payos.vn/web/' + paymentLinkId
  const data = { orderCode: order.order_code, amount: order.amount, currency: 'VND', paymentLinkId, checkoutUrl }
  const sign = (fields: Record<string, string | number>) => createHmac('sha256', checksum)
    .update(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + '=' + value).join('&')).digest('hex')
  const transport = t.mock.method(globalThis, 'fetch', async function (this: typeof globalThis, input: unknown, init: RequestInit) {
    assert.equal(this, globalThis)
    assert.equal(input, 'https://api-merchant.payos.vn/v2/payment-requests')
    assert.equal(init.method, 'POST')
    const payload = JSON.parse(String(init.body))
    const { amount, orderCode, description, returnUrl, cancelUrl } = payload
    assert.equal(amount, order.amount)
    assert.equal(orderCode, order.order_code)
    assert.match(description, /^[A-Z0-9 ]{1,9}$/)
    assert.equal(payload.signature, sign({ amount, orderCode, description, returnUrl, cancelUrl }))
    return Response.json({ code: '00', data, signature: sign(data) })
  })
  const provider = paymentProvider({
    PAYMENT_PROVIDER: 'payos', PUBLIC_BASE_URL: 'https://checkout.example.test',
    PAYOS_CLIENT_ID: 'fixture-client', PAYOS_API_KEY: 'fixture-key', PAYOS_CHECKSUM_KEY: checksum,
  } as Env)
  assert.deepEqual(await provider.create(order), { linkId: paymentLinkId, url: checkoutUrl })
  assert.equal(transport.mock.callCount(), 1)
})

test('official payOS SDK verifies signed inner fields without using the network', async () => {
  const checksum = 'fixture-checksum'
  const provider = paymentProvider({
    PAYMENT_PROVIDER: 'payos', PUBLIC_BASE_URL: 'https://checkout.example.test',
    PAYOS_CLIENT_ID: 'fixture-client', PAYOS_API_KEY: 'fixture-key', PAYOS_CHECKSUM_KEY: checksum,
  } as Env)
  const data = {
    orderCode: 123456, amount: 120000, code: '00', desc: 'success', currency: 'VND',
    paymentLinkId: 'a'.repeat(32), reference: 'transfer-1', description: 'FunChoice Pro',
    accountNumber: '12345678', transactionDateTime: '2026-11-15 09:00:00',
  }
  const payload = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + '=' + value).join('&')
  const signature = createHmac('sha256', checksum).update(payload).digest('hex')
  assert.deepEqual(await provider.verify({ data, signature }), data)
  await assert.rejects(provider.verify({ data: { ...data, amount: 1 }, signature }))

  const harness = createTestHarness({ workers: [{
    configPath: './wrangler.jsonc',
    vars: { PAYMENT_PROVIDER: 'payos', PUBLIC_BASE_URL: 'https://checkout.example.test' },
    secrets: { PAYOS_CLIENT_ID: 'fixture-client', PAYOS_API_KEY: 'fixture-key', PAYOS_CHECKSUM_KEY: checksum },
  }] })
  try {
    await harness.listen()
    await harness.getWorker<Env>().applyD1Migrations('DB')
    const send = (amount: number) => harness.fetch('/v1/webhooks/payos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { ...data, amount }, signature }),
    })
    assert.equal((await send(1)).status, 400)
    assert.equal((await send(data.amount)).status, 200)
  } finally {
    await harness.close()
  }
})
