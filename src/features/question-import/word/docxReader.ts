import { openDocxArchive } from './docxArchive'
import { maxImageBatch, maxImageBytes, readImage, type DraftImage } from './images'

const mib = 1024 * 1024
export const maxDocxBytes = 25 * mib
const documentPart = 'word/document.xml'
const relationshipsPart = 'word/_rels/document.xml.rels'
const wordNamespaces = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
])
const relationshipNamespaces = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships',
]

export type DocumentToken = { text: string } | { image: DraftImage } | { warning: string; imageError?: boolean }
export interface DocumentLine { tokens: DocumentToken[] }

export const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function readXml(bytes: Uint8Array | undefined) {
  if (!bytes?.length) throw new Error('Thiếu thành phần XML của tài liệu Word.')
  const raw = new TextDecoder(bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le'
    : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8', { fatal: true }).decode(bytes)
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error('Tài liệu Word chứa khai báo XML không được hỗ trợ.')
  const xml = new DOMParser().parseFromString(raw, 'application/xml')
  if (xml.getElementsByTagNameNS('*', 'parsererror').length) throw new Error('Không đọc được XML trong tài liệu Word.')
  return xml
}

const relationshipId = (element: Element, name: string) =>
  relationshipNamespaces.map((ns) => element.getAttributeNS(ns, name)).find(Boolean) ?? undefined

function packagePath(target: string) {
  const path = decodeURIComponent(target)
  if (/[:\\?#]/.test(path)) return
  const parts = path.startsWith('/') ? [] : ['word']
  for (const part of path.split('/')) {
    if (part === '..') {
      if (!parts.length) return
      parts.pop()
    } else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

export async function readDocx(bytes: Uint8Array<ArrayBuffer>, progress: (message: string) => void = () => {}) {
  if (!bytes.length || bytes.length > maxDocxBytes) throw new Error('Tệp Word phải có dung lượng từ 1 byte đến 25 MB.')
  progress('Đang giải nén tài liệu Word…')
  await nextFrame()
  const archive = openDocxArchive(bytes)
  function xmlPart(path: string) {
    const entry = archive.entries.get(path)
    return entry && readXml(archive.read(entry, 4 * mib))
  }
  const xml = xmlPart(documentPart)
  if (!xml) throw new Error('Thiếu phần nội dung chính của tài liệu Word.')
  const root = xml.documentElement
  const body = Array.from(root.children).find((node) => node.namespaceURI === root.namespaceURI && node.localName === 'body')
  if (!wordNamespaces.has(root.namespaceURI ?? '') || root.localName !== 'document' || !body) {
    throw new Error('Không đọc được phần nội dung của tài liệu Word.')
  }
  let relations: Document | undefined
  const warnings = new Set<string>()
  try { relations = xmlPart(relationshipsPart) }
  catch { warnings.add('Không đọc được danh sách liên kết ảnh trong tài liệu Word.') }
  const refs = new Map(Array.from(relations?.getElementsByTagNameNS('*', 'Relationship') ?? [], (node) => [node.getAttribute('Id'), node]))
  const used = new Set<string>()
  const imageCache = new Map<string, Promise<DocumentToken>>()
  let imageBytes = 0
  let imageRefs = 0
  async function extract(id: string | undefined): Promise<DocumentToken> {
    if (++imageRefs > 300) return { warning: 'Tài liệu vượt giới hạn 300 lượt chèn ảnh.', imageError: true }
    const relation = id && refs.get(id)
    if (!relation || !relation.getAttribute('Type')?.endsWith('/image')) {
      return { warning: 'Không tìm thấy ảnh nhúng được tham chiếu.', imageError: true }
    }
    if (relation.getAttribute('TargetMode')?.toLowerCase() === 'external') {
      return { warning: 'Ảnh dùng liên kết ngoài, không thể nhập ngoại tuyến.', imageError: true }
    }
    let path: string | undefined
    try { path = packagePath(relation.getAttribute('Target') ?? '') } catch { /* invalid target */ }
    if (!path) return { warning: 'Đường dẫn ảnh trong Word không hợp lệ.', imageError: true }
    used.add(path)
    const name = path.split('/').at(-1) ?? path
    let pending = imageCache.get(path)
    if (!pending) {
      pending = (async () => {
        const entry = archive.entries.get(path)
        if (!entry) return { warning: `Không tìm thấy tệp ảnh ${name} trong tài liệu.`, imageError: true }
        if (entry.size > maxImageBytes) return { warning: `Không nhập ảnh ${name} vì dung lượng vượt 5 MB.`, imageError: true }
        if (imageBytes + entry.size > maxImageBatch) return { warning: `Không nhập ảnh ${name} vì tổng dung lượng ảnh vượt 24 MB.`, imageError: true }
        imageBytes += entry.size
        try {
          const image = await readImage(archive.read(entry, maxImageBytes), name)
          return { image }
        } catch (cause) {
          return { warning: `Không đọc được ảnh ${name}. ${cause instanceof Error ? cause.message : ''}`, imageError: true }
        }
      })()
      imageCache.set(path, pending)
    }
    return pending
  }

  const lines: DocumentLine[] = []
  let processed = 0
  async function walk(node: Element, tokens?: DocumentToken[], depth = 0): Promise<void> {
    if (++processed > 100_000 || depth > 80 || lines.length >= 12_000) throw new Error('Cấu trúc tài liệu vượt giới hạn xử lý.')
    const name = node.localName
    const isWord = wordNamespaces.has(node.namespaceURI ?? '')
    if (name === 'AlternateContent') {
      const choices = Array.from(node.children)
      const chosen = choices.find((part) => part.localName === 'Choice' && part.getElementsByTagNameNS('*', 'blip').length)
        ?? choices.find((part) => part.localName === 'Fallback')
      if (chosen) await walk(chosen, tokens, depth + 1)
      else if (tokens) tokens.push({ warning: 'Có đối tượng Word không đọc được.', imageError: true })
      else lines.push({ tokens: [{ warning: 'Có đối tượng Word không đọc được.', imageError: true }] })
      return
    }
    if (isWord && name === 'p' && !tokens) {
      const paragraph: DocumentToken[] = []
      for (const child of node.children) await walk(child, paragraph, depth + 1)
      let line: DocumentToken[] = []
      for (const token of paragraph) {
        if ('text' in token && token.text === '\n') { lines.push({ tokens: line }); line = [] }
        else line.push(token)
      }
      lines.push({ tokens: line })
      if (lines.length % 100 === 0) await nextFrame()
      return
    }
    if (isWord && name === 'tr' && !tokens) {
      const start = lines.length
      for (const child of node.children) await walk(child, undefined, depth + 1)
      const row = lines.slice(start)
      const cells = Array.from(node.children).filter((child) => child.localName === 'tc')
      if (cells.length > 1 && row.length === cells.length && row.every(({ tokens }) => tokens.every((token) => 'text' in token))) {
        const text = row.map(({ tokens }) => tokens.map((token) => 'text' in token ? token.text : '').join('').trim())
        // Keep simple answer-key rows together. Other cells retain their line boundaries.
        const values = text.filter((value) => !/^(?:câu(?:\s*hỏi)?|đáp\s*án|stt)$/iu.test(value) && value)
        if (values.length && values.every((value) => /^(?:\d+|[A-H])$/i.test(value))) {
          lines.splice(start, row.length, { tokens: [{ text: values.join('\t') }] })
        }
      }
      return
    }
    if (isWord && ['del', 'moveFrom', 'instrText'].includes(name)) return
    if (name === 'oMath' || name === 'oMathPara') {
      const token = { warning: 'Công thức cần kiểm tra thủ công' }
      if (tokens) tokens.push({ text: '[Công thức]' }, token)
      else lines.push({ tokens: [{ text: '[Công thức]' }, token] })
      return
    }
    if (isWord && ['drawing', 'pict', 'object'].includes(name)) {
      const images = Array.from(node.getElementsByTagNameNS('*', '*')).filter((child) => ['blip', 'imagedata'].includes(child.localName))
      const target = tokens ?? []
      if (images.length && name !== 'object') {
        for (const image of images) target.push(await extract(relationshipId(image, 'embed') ?? relationshipId(image, 'id') ?? relationshipId(image, 'link')))
      } else target.push({ warning: 'Không đọc được ảnh hoặc đối tượng Word được nhúng.', imageError: true })
      if (!tokens) lines.push({ tokens: target })
      return
    }
    if (isWord && name === 'altChunk') {
      warnings.add('Có phần nội dung Word được chèn từ tệp khác. Hãy kiểm tra thủ công.')
      return
    }
    if (isWord && name === 'numPr') warnings.add('Tài liệu có danh sách đánh số tự động. Hãy kiểm tra thứ tự và nhãn câu hỏi, phương án.')
    if (isWord && ['gridSpan', 'vMerge'].includes(name)) warnings.add('Có ô bảng được gộp. Hãy kiểm tra thứ tự nội dung và đáp án trong bảng.')
    if (tokens && isWord && name === 't') { tokens.push({ text: node.textContent ?? '' }); return }
    if (tokens && isWord && ['br', 'cr', 'tab'].includes(name)) {
      tokens.push({ text: name === 'tab' ? '\t' : '\n' })
      return
    }
    for (const child of node.children) await walk(child, tokens, depth + 1)
  }
  progress('Đang đọc văn bản, bảng và ảnh nhúng…')
  await nextFrame()
  await walk(body)
  const unused = [...archive.entries.keys()].filter((path) => path.startsWith('word/media/') && !path.endsWith('/') && !used.has(path)).length
  if (unused) warnings.add(`Có ${unused} tệp ảnh không được tham chiếu trong nội dung chính của tài liệu. Hãy kiểm tra ảnh ở đầu trang, chân trang hoặc phần khác.`)
  return { lines, warnings: [...warnings] }
}
