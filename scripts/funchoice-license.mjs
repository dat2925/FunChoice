import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const directory = process.env.FUNCHOICE_ISSUER_DIR || join(homedir(), 'AppData', 'Local', 'FunChoiceIssuer')
const privatePath = join(directory, 'pro-signing-private.pem')
const publicPath = new URL('../src-tauri/pro-public.hex', import.meta.url)
const [command] = process.argv.slice(2)

function publicHex(key) {
  const { x } = createPublicKey(key).export({ format: 'jwk' })
  return Buffer.from(x, 'base64url').toString('hex')
}
function initialize() {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (!existsSync(privatePath)) {
    if (existsSync(publicPath)) throw new Error('Cần khôi phục khóa ký gốc để tiếp tục cấp key cho bản FunChoice này.')
    const { privateKey } = generateKeyPairSync('ed25519')
    writeFileSync(privatePath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 })
    if (process.platform !== 'win32') chmodSync(privatePath, 0o600)
  }
  const key = createPrivateKey(readFileSync(privatePath))
  const published = publicHex(key)
  if (existsSync(publicPath) && readFileSync(publicPath, 'utf8').trim() !== published) {
    throw new Error('Khóa ký không khớp với khóa công khai của FunChoice.')
  }
  if (!existsSync(publicPath)) writeFileSync(publicPath, published + '\n', { flag: 'wx' })
  console.log('Khóa công khai đã sẵn sàng. Khóa ký riêng được lưu tại ' + privatePath)
}

try {
  if (command === 'init') initialize()
  else if (command === 'local-code') {
    const { execFileSync } = await import('node:child_process')
    const value = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], { encoding: 'utf8' })
    const guid = value.match(/MachineGuid\s+REG_SZ\s+(\S+)/i)?.[1]
    if (!guid) throw new Error('Không đọc được mã máy Windows.')
    console.log('FC-' + createHash('sha256').update('FunChoice:device:v1:' + guid.toLowerCase()).digest('hex').slice(0, 32).toUpperCase())
  } else throw new Error('Cách dùng: init | local-code. Dùng FunChoice-KeyMaker để cấp key.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
