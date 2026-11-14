import Papa from 'papaparse'
import { optionLetters } from './api'
import type { Gender, Question, StudentInput } from './api'

export const normalized = (text: string) => text.trim().toLocaleLowerCase('vi').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/\s+/g, ' ')

async function readRows(file: File): Promise<string[][]> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Dung lượng tệp tối đa là 10 MB.')
  let rows: string[][]
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    rows = (await readSheet(await file.arrayBuffer(), 1, { parseNumber: (value) => value }))
      .map((row) => row.map((value) => value == null ? '' : String(value)))
  } else if (/\.csv$/i.test(file.name)) {
    const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' })
    if (parsed.errors.some((e) => e.type !== 'Delimiter')) throw new Error('Không đọc được cấu trúc tệp CSV.')
    rows = parsed.data
  } else throw new Error('Vui lòng chọn tệp .xlsx hoặc .csv.')
  return rows
}

export async function readQuestions(file: File): Promise<Question[]> {
  const [headers = [], ...data] = await readRows(file)
  const keys = headers.map(normalized)
  const question = keys.findIndex((key) => ['cau hoi', 'question'].includes(key))
  const answer = keys.findIndex((key) => ['dap an', 'cau tra loi', 'answer'].includes(key))
  const correctColumn = keys.findIndex((key) => ['dap an dung', 'correct answer', 'correct answers'].includes(key))
  const optionColumns = [...optionLetters].map((letter) => keys.findIndex((key) => key === letter.toLowerCase() || key === 'phuong an ' + letter.toLowerCase()))
  if (question < 0) throw new Error('Dòng đầu tiên cần có cột “Câu hỏi”.')
  const items = data.flatMap((row, index) => {
    if (!row.some((value) => value.trim())) return []
    const text = row[question]?.trim()
    const response = row[answer]?.trim()
    if (!text || [...text].length > 2000 || (response && [...response].length > 4000)) {
      throw new Error('Kiểm tra câu hỏi và đáp án ở dòng ' + (index + 2) + '.')
    }
    const options: string[] = []
    const byLetter = new Map<string, number>()
    optionColumns.forEach((column, i) => {
      const value = row[column]?.trim()
      if (value) { byLetter.set(optionLetters[i], options.length); options.push(value) }
    })
    const letters = (row[correctColumn] ?? '').trim().toUpperCase().split(/[\s,;/]+/).filter(Boolean)
    if (options.length === 1 || options.some((option) => [...option].length > 500) || letters.some((letter) => !byLetter.has(letter))) {
      throw new Error('Kiểm tra phương án và đáp án đúng ở dòng ' + (index + 2) + '.')
    }
    return [{ id: crypto.randomUUID(), text, answer: response || null, options,
      correctOptions: [...new Set(letters)].map((letter) => byLetter.get(letter)!) }]
  })
  if (!items.length) throw new Error('Tệp chưa có câu hỏi.')
  return items
}

export async function readRoster(file: File): Promise<StudentInput[]> {
  const rows = await readRows(file)
  const [headers = [], ...data] = rows
  const keys = headers.map(normalized)
  const name = keys.findIndex((key) => ['ho va ten', 'ho ten', 'full name', 'full_name', 'name', 'ten hoc sinh'].includes(key))
  const code = keys.findIndex((key) => ['ma hoc sinh', 'student code', 'student_code', 'ma hs'].includes(key))
  const genderColumn = keys.findIndex((key) => ['gioi tinh', 'gender', 'sex'].includes(key))
  const active = keys.findIndex((key) => ['trang thai', 'is_active', 'active'].includes(key))
  if (name < 0) throw new Error('Dòng đầu tiên cần có cột “Họ và tên”.')
  const roster: StudentInput[] = []
  data.forEach((row, i) => {
    if (!row.some((value) => value.trim())) return
    const fullName = row[name]?.trim()
    const studentCode = row[code]?.trim() || null
    if (!fullName || [...fullName].length > 120 || (studentCode && [...studentCode].length > 48)) {
      throw new Error('Kiểm tra họ tên hoặc mã học sinh ở dòng ' + (i + 2) + '.')
    }
    const status = normalized(row[active] ?? '')
    const genderValue = normalized(row[genderColumn] ?? '')
    const gender: Gender | null = ['nam', 'male', 'm'].includes(genderValue) ? 'male'
      : ['nu', 'female', 'f'].includes(genderValue) ? 'female' : null
    if (!gender && genderValue && !['chua nhap', 'chua chon', 'chua xac dinh'].includes(genderValue)) {
      throw new Error('Giới tính phải là Nam hoặc Nữ ở dòng ' + (i + 2) + '.')
    }
    roster.push({ fullName, studentCode, ...(gender ? { gender } : {}), isActive: !['0', 'false', 'tam dung', 'khong hoat dong'].includes(status) })
  })
  if (!roster.length) throw new Error('Tệp phải có ít nhất một học sinh.')
  return roster
}

export function exportCsv(filename: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob(['\ufeff', Papa.unparse(rows, { escapeFormulae: true })], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

