import { optionLetters } from '../../../api'
import { answerPrefix, choiceAnswer, footerHeading, parseKeyEntries } from './answerParser'
import { readDocx, nextFrame, type DocumentLine, type DocumentToken } from './docxReader'
import type { DraftImage } from './images'

export interface WordDraft {
  id: string
  source?: number
  text: string
  kind: 'open' | 'choice'
  options: string[]
  correctOptions: number[]
  answer: string
  images: DraftImage[]
  warnings: string[]
  imageError: boolean
}

export function createDraft(text = '', source?: number): WordDraft {
  return { id: crypto.randomUUID(), source, text, kind: 'open', options: [], correctOptions: [], answer: '', images: [], warnings: [], imageError: false }
}

const labeledQuestion = /^(?:câu(?:\s+hỏi)?|question)\s*(\d{1,6})(?:\s*[.:：)）\-–]\s*|\s+|$)(.*)$/iu
const numberedQuestion = /^(\d{1,6})[.)]\s+(.*)$/u
const optionStart = /^\(?([A-H])[.)：:]\s*(.*)$/isu
const joinedLabels = /(?:\t+| {2,})(?=(?:\(?[A-H][.):：]|đáp\s*án\s*[:：]))/iu
const keyPrefix = /^(?:bảng\s+đáp\s*án|answer\s+key)\s*[:：]\s*/iu
const ambiguousImage = 'Ảnh nằm giữa hai câu hỏi. Hãy kiểm tra ảnh thuộc câu nào.'
const content = (tokens: DocumentToken[]) => tokens.map((token) => 'text' in token ? token.text : '').join('').trim()
const append = (value: string, line: string) => value ? value + '\n' + line : line

function attach(draft: WordDraft, tokens: DocumentToken[]) {
  for (const token of tokens) {
    if ('image' in token) draft.images.push({ ...token.image, id: crypto.randomUUID() })
    if ('warning' in token) {
      draft.warnings.push(token.warning)
      draft.imageError ||= !!token.imageError
    }
  }
}

export function parseQuestions(lines: DocumentLine[], fileWarnings: string[] = []) {
  const drafts: WordDraft[] = []
  const warnings = new Set(fileWarnings)
  const keys = new Map<number, Set<string>>()
  let current: WordDraft | undefined
  let section: 'text' | 'option' | 'answer' = 'text'
  let activeOption = 0
  let footer = false
  let blank = false
  let leading: DocumentToken[] = []
  let keyColumns: number[] = []
  const texts = lines.map(({ tokens }) => content(tokens))
  const questionStart = texts.some((line) => labeledQuestion.test(line) && !parseKeyEntries(line).length) ? labeledQuestion : numberedQuestion
  const after: string[] = []
  let following = ''
  for (let i = lines.length - 1; i >= 0; i--) {
    after[i] = following
    if (texts[i]) following = texts[i]
  }

  function addKey(number: number, answer: string) {
    const values = keys.get(number) ?? new Set()
    values.add(answer.toUpperCase().replace(/\s/g, ''))
    keys.set(number, values)
  }

  function start(text: string, number?: number) {
    if (drafts.length >= 500) throw new Error('Tài liệu vượt giới hạn 500 câu hỏi mỗi lần nhập.')
    current = createDraft(text, number)
    if (number === undefined) current.warnings.push('Không tìm thấy nhãn câu hỏi. Hãy kiểm tra hoặc tách nội dung.')
    drafts.push(current)
    section = 'text'
    activeOption = 0
    return current
  }

  for (const [index, { tokens }] of lines.entries()) {
    let line = texts[index]
    const extras = tokens.filter((token) => !('text' in token))
    if (!line && !extras.length) { blank = true; continue }
    const prefixed = keyPrefix.exec(line) ?? answerPrefix.exec(line)
    const entriesWithHeading = prefixed && parseKeyEntries(line.slice(prefixed[0].length))
    const nextLine = after[index]
    if (!footer && (entriesWithHeading?.length ||
      (footerHeading.test(line) && (/^bảng\s+đáp|^answer\s+key/iu.test(line) ||
        parseKeyEntries(nextLine).length || /^\d+(?:\t\d+)*$|^câu(?:\s*hỏi)?\s*$/iu.test(nextLine))))) {
      footer = true
      if (leading.length && current) attach(current, leading)
      leading = []
      if (entriesWithHeading?.length) for (const [number, answer] of entriesWithHeading) addKey(number, answer)
      line = ''
    }
    if (footer) {
      if (extras.length) {
        const draft = drafts.at(-1)?.source === undefined && current ? current : start('')
        attach(draft, extras)
        draft.warnings.push('Nội dung hoặc ảnh nằm trong phần bảng đáp án. Hãy kiểm tra vị trí.')
      }
      if (!line) continue
      const pairs = parseKeyEntries(line)
      const cells = line.split('\t').map((cell) => cell.trim()).filter(Boolean)
      if (pairs.length) for (const [number, answer] of pairs) addKey(number, answer)
      else if (cells.length >= 2 && cells.every((cell) => /^\d+$/.test(cell))) keyColumns = cells.map(Number)
      else if (keyColumns.length === cells.length && cells.every((cell) => /^[A-H]$/i.test(cell))) {
        cells.forEach((answer, i) => addKey(keyColumns[i], answer))
        keyColumns = []
      } else if (!/^(?:câu(?:\s*hỏi)?|đáp\s*án|stt)\s*[:：]?$/iu.test(line)) {
        warnings.add('Không đọc được một phần bảng đáp án. Dòng cần kiểm tra: ' + line.slice(0, 120))
      }
      continue
    }

    if (!line) {
      if (!current || (questionStart.test(nextLine) && (blank || section === 'answer'))) leading.push(...extras)
      else {
        attach(current, extras)
        if (questionStart.test(nextLine)) current.warnings.push(ambiguousImage)
      }
      continue
    }

    const heading = questionStart.exec(line)
    if (heading) {
      const previous = current
      const draft = start('', Number(heading[1]))
      if (leading.length && previous) draft.warnings.push(ambiguousImage)
      if (questionStart === numberedQuestion) draft.warnings.push('Câu được nhận diện từ dòng đánh số. Hãy kiểm tra ranh giới câu hỏi.')
      line = heading[2]
    }
    const draft = current ?? start('')
    if (leading.length) { attach(draft, leading); leading = [] }
    attach(draft, extras)
    for (const part of line.split(joinedLabels).map((entry) => entry.trim()).filter(Boolean)) {
      const option = optionStart.exec(part)
      const answer = answerPrefix.exec(part)
      if (answer || footerHeading.test(part)) {
        section = 'answer'
        draft.answer = append(draft.answer, answer ? part.slice(answer[0].length) : '')
      } else if (option && section !== 'answer') {
        draft.kind = 'choice'
        section = 'option'
        activeOption = optionLetters.indexOf(option[1].toUpperCase())
        while (draft.options.length <= activeOption) draft.options.push('')
        if (draft.options[activeOption]) draft.warnings.push(`Nhãn phương án ${option[1]} xuất hiện nhiều lần.`)
        draft.options[activeOption] = append(draft.options[activeOption], option[2])
      } else if (section === 'option') {
        draft.options[activeOption] = append(draft.options[activeOption], part)
      } else if (section === 'answer') {
        draft.answer = append(draft.answer, part)
      } else {
        draft.text = append(draft.text, part)
      }
    }
    blank = false
  }
  if (leading.length) attach(current ?? start(''), leading)
  if (keyColumns.length) warnings.add('Bảng đáp án có số câu chưa ghép được với dòng đáp án.')

  const counts = new Map<number, number>()
  for (const draft of drafts) {
    if (draft.source !== undefined) counts.set(draft.source, (counts.get(draft.source) ?? 0) + 1)
  }
  for (const draft of drafts) {
    const count = counts.get(draft.source ?? -1)
    const key = keys.get(draft.source ?? -1)
    const keyText = key?.size === 1 && count === 1 ? [...key][0] : undefined
    if (count && count > 1) draft.warnings.push('Số câu xuất hiện nhiều lần. Hãy kiểm tra đáp án.')
    if (key && key.size > 1) draft.warnings.push('Bảng đáp án có nhiều đáp án khác nhau cho câu này.')
    if (draft.kind === 'choice') {
      const local = choiceAnswer(draft.answer, draft.options)
      const keyed = keyText ? choiceAnswer(keyText, draft.options) : undefined
      if (keyText && !keyed) draft.warnings.push('Đáp án trong bảng không khớp các phương án.')
      if (local && keyed && local.indices.join() !== keyed.indices.join()) {
        draft.warnings.push('Đáp án dưới câu khác với bảng đáp án. Hãy chọn đáp án đúng.')
        draft.answer = local.explanation
      } else if (local) {
        draft.correctOptions = local.indices
        draft.answer = local.explanation
      } else if (draft.answer) {
        draft.warnings.push('Đáp án dưới câu chưa xác định được phương án đúng.')
        if (keyed) draft.correctOptions = keyed.indices
      } else if (keyed) draft.correctOptions = keyed.indices
    } else if (keyText) draft.warnings.push('Có đáp án trong bảng nhưng chưa nhận diện được các phương án.')
    draft.warnings = [...new Set(draft.warnings)]
  }
  for (const number of keys.keys()) if (!counts.has(number)) warnings.add(`Bảng đáp án nhắc đến câu số ${number} nhưng chưa tìm thấy câu hỏi.`)
  if (!drafts.length) warnings.add('Không đọc được nội dung câu hỏi. Hãy thử một tệp khác hoặc thêm câu thủ công.')
  return { drafts, warnings: [...warnings] }
}

export async function importWord(bytes: Uint8Array<ArrayBuffer>, progress: (message: string) => void) {
  const document = await readDocx(bytes, progress)
  progress('Đang nhận diện câu hỏi, đáp án và vị trí ảnh…')
  await nextFrame()
  return parseQuestions(document.lines, document.warnings)
}
