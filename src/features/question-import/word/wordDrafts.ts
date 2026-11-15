import type { ImportedQuestion, Question } from '../../../api'
import { normalized } from '../../../roster'
import { encodeImage, maxImageBatch } from './images'
import type { WordDraft } from './questionParser'

const length = (value: string) => [...value.trim()].length

export function draftError(draft: WordDraft) {
  if (!draft.text.trim()) return 'Hãy nhập nội dung câu hỏi.'
  if (length(draft.text) > 2000) return 'Câu hỏi vượt quá 2.000 ký tự.'
  if (length(draft.answer) > 4000) return 'Đáp án vượt quá 4.000 ký tự.'
  if (draft.kind === 'choice' && (draft.options.length < 2 || draft.options.length > 8 ||
      draft.options.some((option) => !option.trim() || length(option) > 500))) {
    return 'Cần 2–8 phương án, mỗi phương án từ 1 đến 500 ký tự.'
  }
  if (draft.images.length > 300) return 'Câu hỏi có quá 300 ảnh.'
  return ''
}

const comparable = (text: string) => normalized(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const terms = (text: string) => new Set(text.split(' '))

export function duplicateWarnings(drafts: WordDraft[], bank: Question[]) {
  const questions = [...bank, ...drafts].map((question) => {
    const text = comparable(question.text)
    return { id: question.id, text, words: terms(text) }
  })
  const result = new Map<string, string>()
  for (const draft of drafts) {
    const text = comparable(draft.text)
    if (!text) continue
    const words = terms(text)
    let similar = false
    for (const question of questions) {
      if (question.id === draft.id || !question.text) continue
      if (question.text === text) { result.set(draft.id, 'Trùng nội dung với câu khác trong ngân hàng hoặc lần nhập này.'); break }
      if (Math.min(words.size, question.words.size) < 5 || Math.min(text.length, question.text.length) < Math.max(text.length, question.text.length) * 0.75) continue
      let shared = 0
      for (const word of words) if (question.words.has(word)) shared++
      if (2 * shared / (words.size + question.words.size) >= 0.84) similar = true
    }
    if (similar && !result.has(draft.id)) result.set(draft.id, 'Nội dung gần giống một câu khác. Hãy kiểm tra trước khi lưu.')
  }
  return result
}

export async function buildWordImport(drafts: WordDraft[]) {
  const blobs = new Map<Blob, number>()
  const questions: ImportedQuestion[] = drafts.map((draft, i) => {
    const error = draftError(draft)
    if (error) throw new Error(`Câu ${i + 1}. ${error}`)
    return {
      text: draft.text.trim(),
      answer: draft.answer.trim() || null,
      options: draft.kind === 'choice' ? draft.options.map((option) => option.trim()) : [],
      correctOptions: draft.kind === 'choice' ? draft.correctOptions : [],
      images: draft.images.map(({ blob }) => {
        const index = blobs.get(blob) ?? blobs.size
        blobs.set(blob, index)
        return index
      }),
    }
  })
  const images = [...blobs.keys()]
  if (images.length > 300 || images.reduce((total, blob) => total + blob.size, 0) > maxImageBatch) {
    throw new Error('Tổng ảnh vượt 300 tệp hoặc 24 MB. Hãy bỏ bớt ảnh.')
  }
  return { questions, images: await Promise.all(images.map(encodeImage)) }
}
