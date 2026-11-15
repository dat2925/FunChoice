import { writeFile, readFile } from 'node:fs/promises'
import { generateKeyPairSync, randomBytes } from 'node:crypto'

const path = new URL('../.dev.vars', import.meta.url)
try {
  const existing = await readFile(path, 'utf8')
  if (!/^PAYMENT_PROVIDER=mock$/m.test(existing)) throw new Error('.dev.vars is not a mock configuration')
  console.log(existing.split(/\r?\n/).find((line) => line.startsWith('LICENSE_PUBLIC_KEY_HEX=')))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  const rawPublic = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
  await writeFile(path, [
    'PAYMENT_PROVIDER=mock',
    'PUBLIC_BASE_URL=http://127.0.0.1:8787',
    'MOCK_WEBHOOK_SECRET=' + randomBytes(32).toString('hex'),
    'LICENSE_PUBLIC_KEY_HEX=' + rawPublic,
    'LICENSE_SIGNING_PKCS8_B64=' + pkcs8,
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 })
  console.log('LICENSE_PUBLIC_KEY_HEX=' + rawPublic)
}
