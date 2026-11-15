import { Inflate } from 'fflate'

interface Entry { name: string; size: number; packed: number; offset: number; method: number; crc: number; flags: number }

const invalidZip = () => new Error('Cấu trúc ZIP của tệp Word bị lỗi hoặc không được hỗ trợ.')
const crcTable = Array.from({ length: 256 }, (_, byte) => {
  let value = byte
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value
})

export function openDocxArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (offset: number) => view.getUint16(offset, true)
  const u32 = (offset: number) => view.getUint32(offset, true)
  let end = bytes.length - 22
  const earliest = Math.max(0, end - 65535)
  for (; end >= earliest; end--) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break
  }
  if (end < earliest || u16(end + 4) || u16(end + 6)) throw invalidZip()
  const count = u16(end + 10)
  const directory = u32(end + 16)
  if (count !== u16(end + 8) || !count || count > 4000 || directory + u32(end + 12) !== end) throw invalidZip()
  const entries = new Map<string, Entry>()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let cursor = directory
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw invalidZip()
    const nameEnd = cursor + 46 + u16(cursor + 28)
    const next = nameEnd + u16(cursor + 30) + u16(cursor + 32)
    if (next > end || u16(cursor + 34)) throw invalidZip()
    const name = decoder.decode(bytes.subarray(cursor + 46, nameEnd))
    if (!name || entries.has(name)) throw invalidZip()
    entries.set(name, { name, size: u32(cursor + 24), packed: u32(cursor + 20), offset: u32(cursor + 42),
      method: u16(cursor + 10), crc: u32(cursor + 16), flags: u16(cursor + 8) })
    cursor = next
  }
  if (cursor !== end) throw invalidZip()

  function read(entry: Entry, maximum: number) {
    const { offset, packed, size, method, flags } = entry
    if (size > maximum || packed > maximum + 65536 || offset + 30 > directory || flags & 1 ||
        u32(offset) !== 0x04034b50 || u16(offset + 8) !== method || u16(offset + 6) & 1) throw invalidZip()
    const nameEnd = offset + 30 + u16(offset + 26)
    const start = nameEnd + u16(offset + 28)
    if (start + packed > directory || decoder.decode(bytes.subarray(offset + 30, nameEnd)) !== entry.name) throw invalidZip()
    const compressed = bytes.subarray(start, start + packed)
    const output = new Uint8Array(size)
    let written = 0
    let crc = 0xffffffff
    const receive = (chunk: Uint8Array) => {
      if (written + chunk.length > size) throw invalidZip()
      output.set(chunk, written)
      written += chunk.length
      for (const byte of chunk) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]
    }
    if (method === 0) receive(compressed)
    else if (method === 8 && packed) {
      const inflate = new Inflate(receive)
      for (let index = 0; index < packed; index += 4096) {
        const next = Math.min(index + 4096, packed)
        inflate.push(compressed.subarray(index, next), next === packed)
      }
    } else throw invalidZip()
    if (written !== size || ((crc ^ -1) >>> 0) !== entry.crc) throw invalidZip()
    return output
  }

  return { entries, read }
}
