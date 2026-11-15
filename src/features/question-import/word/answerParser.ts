import { optionLetters } from '../../../api'

export const answerPrefix = /^(?:đáp\s*án(?:\s*đúng)?|trả\s*lời|answer)\s*[:：\-]\s*/iu
export const footerHeading = /^(?:bảng\s+đáp\s*án|đáp\s*án|answer\s+key)\s*[:：]?\s*$/iu

export function parseKeyEntries(text: string): [number, string][] {
  const entry = /(?:^|[\s,;|])(?:câu\s*)?(\d{1,6})\s*(?:[.):=\-]\s*|[|]\s*|\s+)([A-H](?:\s*[/+]\s*[A-H])*)(?=$|[\s,;|])/giu
  if (text.replace(entry, '').replace(/[\s,;|]/g, '')) return []
  return [...text.matchAll(entry)].map((match) => [Number(match[1]), match[2]])
}

export function choiceAnswer(text: string, options: string[]) {
  const match = /^\(?([A-H](?:\s*[,;/+&]\s*[A-H])*)\)?\s*[.)]?\s*(?:[-–:]\s*(.+))?$/isu.exec(text.trim())
  if (!match) return undefined
  const indices = [...new Set([...match[1].toUpperCase().matchAll(/[A-H]/g)].map(([letter]) => optionLetters.indexOf(letter)))].sort()
  if (indices.some((index) => !options[index]?.trim())) return undefined
  return { indices, explanation: match[2]?.trim() ?? '' }
}
