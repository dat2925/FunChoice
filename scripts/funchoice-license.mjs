import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const directory = process.env.FUNCHOICE_ISSUER_DIR || join(homedir(), 'AppData', 'Local', 'FunChoiceIssuer')
const privatePath = join(directory, 'pro-signing-private.pem')
const publicPath = new URL('../src-tauri/pro-public.hex', import.meta.url)
const [command, input, expiry] = process.argv.slice(2)

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
  else if (command === 'issue') {
    const machine = (input ?? '').trim().toUpperCase()
    if (!/^FC-[0-9A-F]{32}$/.test(machine)) throw new Error('Hãy nhập mã máy FC- gồm 32 ký tự hex từ ứng dụng.')
    const key = createPrivateKey(readFileSync(privatePath))
    if (publicHex(key) !== readFileSync(publicPath, 'utf8').trim()) throw new Error('Khóa ký không khớp với bản FunChoice này.')
    let until = 'forever'
    if (expiry && expiry !== 'forever') {
      const utc = Date.parse(expiry + 'T00:00:00Z')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== expiry) {
        throw new Error('Ngày hết hạn phải có dạng YYYY-MM-DD.')
      }
      until = String(utc / 1000 + 17 * 3600)
      if (Number(until) <= Date.now() / 1000) throw new Error('Ngày hết hạn đã qua.')
    }
    console.log('FC-PRO1.' + until + '.' + sign(null, Buffer.from('FunChoice:Pro:v1:' + machine + ':' + until), key).toString('base64url'))
  } else if (command === 'local-code') {
    const { execFileSync } = await import('node:child_process')
    const value = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], { encoding: 'utf8' })
    const guid = value.match(/MachineGuid\s+REG_SZ\s+(\S+)/i)?.[1]
    if (!guid) throw new Error('Không đọc được mã máy Windows.')
    console.log('FC-' + createHash('sha256').update('FunChoice:device:v1:' + guid.toLowerCase()).digest('hex').slice(0, 32).toUpperCase())
  } else throw new Error('Cách dùng: init | issue FC-<mã máy> [forever | YYYY-MM-DD] | local-code')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
