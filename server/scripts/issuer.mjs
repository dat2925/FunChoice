import { createPrivateKey, createPublicKey } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const [command, path] = process.argv.slice(2)
if (!path || !['verify', 'upload-secret'].includes(command)) {
  throw new Error('Usage: node scripts/issuer.mjs verify|upload-secret <existing-ed25519-pem>')
}
const expected = (await readFile(new URL('../../src-tauri/pro-public.hex', import.meta.url), 'ascii')).trim()
const key = createPrivateKey(await readFile(path))
const derived = createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
if (key.asymmetricKeyType !== 'ed25519' || derived !== expected) throw new Error('The issuer key does not match FunChoice desktop.')

if (command === 'upload-secret') {
  const wrangler = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)
  const { fileURLToPath } = await import('node:url')
  const result = spawnSync(process.execPath, [fileURLToPath(wrangler), 'secret', 'put', 'LICENSE_SIGNING_PKCS8_B64'], {
    input: key.export({ type: 'pkcs8', format: 'der' }).toString('base64') + '\n',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: new URL('..', import.meta.url),
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} else {
  console.log('Existing Ed25519 issuer matches the FunChoice desktop public key.')
}
