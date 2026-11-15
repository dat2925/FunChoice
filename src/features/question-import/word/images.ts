const mib = 1024 * 1024
export const maxImageBytes = 5 * mib
export const maxImageBatch = 24 * mib

export interface DraftImage { id: string; name: string; blob: Blob }

export function imageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | undefined {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
}

function dimensions(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mime === 'image/png' && bytes.length >= 24 && view.getUint32(12) === 0x49484452) {
    return [view.getUint32(16), view.getUint32(20)]
  }
  if (mime === 'image/jpeg') {
    for (let offset = 2; offset + 4 < bytes.length && bytes[offset++] === 255;) {
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 7) {
        return [view.getUint16(offset + 5), view.getUint16(offset + 3)]
      }
      offset += size
    }
  }
  return [0, 0]
}

export async function readImage(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<DraftImage> {
  if (bytes.length > maxImageBytes) throw new Error('Ảnh vượt quá 5 MB.')
  const mime = imageMime(bytes)
  if (!mime) throw new Error('Chỉ hỗ trợ ảnh PNG và JPEG.')
  const [width, height] = dimensions(bytes, mime)
  if (!width || !height) throw new Error('Tệp ảnh không hợp lệ.')
  if (width * height > 24_000_000 || Math.max(width, height) > 8192) throw new Error('Kích thước điểm ảnh quá lớn.')
  const blob = new Blob([bytes], { type: mime })
  const bitmap = await createImageBitmap(blob).catch(() => { throw new Error('Tệp ảnh bị lỗi hoặc không giải mã được.') })
  bitmap.close()
  return { id: crypto.randomUUID(), name, blob }
}

export async function encodeImage(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  return btoa(chunks.join(''))
}
