const encoder = new TextEncoder()

export const machinePattern = /^FC-[0-9A-F]{32}$/
export const orderPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const tokenPattern = /^[a-f0-9]{64}$/
export const productionPublicKey = '78f7ce2eff00971b2acf95281a80ae8314107e5deaed0f9c96c00f2d010644cf'

export type Grant = { expiresAt: number | null }

function fromBase64(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function importPublic(hex: string) {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('Invalid Ed25519 public key')
  const raw = Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16))
  return crypto.subtle.importKey('raw', raw, 'Ed25519', false, ['verify'])
}

export async function verifyKey(key: string, machine: string, publicKey: CryptoKey): Promise<Grant | undefined> {
  const match = /^FC-PRO1\.(forever|[0-9]{1,12})\.([A-Za-z0-9_-]{86})$/.exec(key)
  if (!match) return undefined
  const [, expiry, signature] = match
  if (expiry !== 'forever' && Number(expiry) > 253402300799) return undefined
  const message = encoder.encode('FunChoice:Pro:v1:' + machine + ':' + expiry)
  if (!await crypto.subtle.verify('Ed25519', publicKey, fromBase64(signature), message)) return undefined
  return { expiresAt: expiry === 'forever' ? null : Number(expiry) }
}

export async function createSigner(pkcs8: string, publicHex: string) {
  const publicKey = await importPublic(publicHex)
  const privateKey = await crypto.subtle.importKey('pkcs8', fromBase64(pkcs8), 'Ed25519', false, ['sign'])
  const probe = encoder.encode('FunChoice:issuer:key-check')
  if (!await crypto.subtle.verify('Ed25519', publicKey, await crypto.subtle.sign('Ed25519', privateKey, probe), probe)) {
    throw new Error('The issuer key does not match FunChoice')
  }
  return {
    publicKey,
    async sign(machine: string, expiresAt: number | null) {
      const expiry = expiresAt === null ? 'forever' : String(expiresAt)
      const message = encoder.encode('FunChoice:Pro:v1:' + machine + ':' + expiry)
      const signature = await crypto.subtle.sign('Ed25519', privateKey, message)
      return 'FC-PRO1.' + expiry + '.' + base64Url(new Uint8Array(signature))
    },
  }
}
