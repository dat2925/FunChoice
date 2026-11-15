import { APIError, InvalidSignatureError, PayOS, type Webhook } from '@payos/node'

export interface Env {
  DB: D1Database
  PAYMENT_PROVIDER: 'disabled' | 'mock' | 'payos'
  PUBLIC_BASE_URL: string
  LICENSE_PUBLIC_KEY_HEX: string
  LICENSE_SIGNING_PKCS8_B64?: string
  PAYOS_CLIENT_ID?: string
  PAYOS_API_KEY?: string
  PAYOS_CHECKSUM_KEY?: string
  MOCK_WEBHOOK_SECRET?: string
}

export type Payment = Pick<Webhook['data'], 'orderCode' | 'amount' | 'currency' | 'paymentLinkId' | 'reference' | 'code'>
export interface CheckoutOrder { id: string; order_code: number; amount: number; expires_at: number }
export interface Provider {
  create(order: CheckoutOrder): Promise<{ linkId: string; url: string }>
  verify(body: unknown): Promise<Payment | undefined>
}

export function localOrigin(value: string) {
  const url = new URL(value)
  return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
}

export async function mockSignature(payment: Payment, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  const fields = [payment.orderCode, payment.amount, payment.currency, payment.paymentLinkId, payment.reference, payment.code]
  return { key, bytes: encoder.encode(JSON.stringify(fields)) }
}

function checkoutUrl(value: string, linkId: string) {
  const url = new URL(value)
  if (url.origin !== 'https://pay.payos.vn' || url.pathname !== '/web/' + linkId) throw new Error('Invalid payOS checkout URL')
  return url.href
}

function checkoutFailure(error: unknown) {
  if (error instanceof APIError) {
    return { kind: error.name, status: error.status, code: /^[A-Za-z0-9_-]{1,16}$/.test(error.code ?? '') ? error.code : undefined }
  }
  return { kind: error instanceof InvalidSignatureError ? 'InvalidSignatureError' : 'UnexpectedResponse' }
}

export function paymentProvider(env: Env): Provider {
  const base = new URL(env.PUBLIC_BASE_URL)
  if (env.PAYMENT_PROVIDER === 'mock' && localOrigin(base.href) && env.MOCK_WEBHOOK_SECRET) {
    const secret = env.MOCK_WEBHOOK_SECRET
    return {
      async create(order) { return { linkId: order.id, url: new URL('/mock/checkout/' + order.id, base).href } },
      async verify(value) {
        const body = value as { data: Payment; signature: string }
        if (!body?.data || typeof body.signature !== 'string') return undefined
        const { key, bytes } = await mockSignature(body.data, secret)
        const signature = Uint8Array.from(atob(body.signature), (char) => char.charCodeAt(0))
        return await crypto.subtle.verify('HMAC', key, signature, bytes) ? body.data : undefined
      },
    }
  }
  if (env.PAYMENT_PROVIDER !== 'payos' || base.protocol !== 'https:' || !env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY) {
    throw new Error('Payments are not configured')
  }
  const client = new PayOS({
    clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY, checksumKey: env.PAYOS_CHECKSUM_KEY,
    baseURL: 'https://api-merchant.payos.vn', logLevel: 'off', timeout: 8000, maxRetries: 0,
    // The SDK calls its fetch option as a method. Workerd's native fetch requires the global receiver.
    fetch: (input, init) => globalThis.fetch(input, init),
  })
  return {
    async create(order) {
      const resultUrl = new URL('/checkout/result', base).href
      try {
        const link = await client.paymentRequests.create({
          orderCode: order.order_code, amount: order.amount, description: 'FC PRO',
          returnUrl: resultUrl, cancelUrl: resultUrl, expiredAt: order.expires_at,
        })
        if (link.orderCode !== order.order_code || link.amount !== order.amount || link.currency !== 'VND') {
          throw new Error('Inconsistent payOS order')
        }
        return { linkId: link.paymentLinkId, url: checkoutUrl(link.checkoutUrl, link.paymentLinkId) }
      } catch (createError) {
        // A timed-out request may already have created the payment link.
        try {
          const link = await client.paymentRequests.get(order.order_code)
          if (link.orderCode !== order.order_code || link.amount !== order.amount || !/^[a-f0-9]{32}$/i.test(link.id)) {
            throw new Error('Inconsistent payOS order')
          }
          return { linkId: link.id, url: checkoutUrl('https://pay.payos.vn/web/' + link.id, link.id) }
        } catch (lookupError) {
          console.warn('payOS checkout failed', { create: checkoutFailure(createError), lookup: checkoutFailure(lookupError) })
          throw createError
        }
      }
    },
    verify: async (body) => client.webhooks.verify(body as Webhook),
  }
}
