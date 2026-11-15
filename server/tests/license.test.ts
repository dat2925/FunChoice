import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import { createSigner, verifyKey } from '../src/license'

const machine = 'FC-' + 'A'.repeat(32)

function testKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    pkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    hex: publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'),
  }
}

test('FC-PRO1 is deterministic, bound to the machine and refuses a different signing key', async () => {
  const pair = testKeyPair()
  const issuer = await createSigner(pair.pkcs8, pair.hex)
  await assert.rejects(createSigner(testKeyPair().pkcs8, pair.hex), /does not match/)
  const finite = await issuer.sign(machine, 1893456000)
  assert.match(finite, /^FC-PRO1\.1893456000\.[A-Za-z0-9_-]{86}$/)
  assert.equal(finite, await issuer.sign(machine, 1893456000))
  assert.deepEqual(await verifyKey(finite, machine, issuer.publicKey), { expiresAt: 1893456000 })
  assert.equal(await verifyKey(finite, machine.replace(/A$/, 'B'), issuer.publicKey), undefined)
  assert.equal(await verifyKey(finite.replace('1893456000', '1893456100'), machine, issuer.publicKey), undefined)
  assert.deepEqual(await verifyKey(await issuer.sign(machine, null), machine, issuer.publicKey), { expiresAt: null })
})
