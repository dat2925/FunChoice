// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, type Question, type Student } from '../src/api'
import { presetApi } from '../src/presetApi'
import QuestionSetup from '../src/QuestionSetup'
import EscapeSetup from '../src/game/escape-room/EscapeSetup'
import { escapeApi, type EscapeSession } from '../src/game/escape-room/model'
import Relay from '../src/Relay'
import GamePresets from '../src/GamePresets'

const school = { id: 'school', name: 'Hoa Sen', count: 1, theme: 'city' as const }
const classroom = { id: 'class', schoolId: school.id, name: '5A', count: 2 }
const bank: Question[] = ['Ngoài đề', 'Câu Toán đã sửa', 'Câu Tiếng Việt'].map((text, i) => ({ id: `q${i}`, text, answer: null }))
const papers = [
  { id: 'math', title: 'Đề Toán', updatedAt: '', questions: [{ id: 'q1', text: 'Câu Toán trong đề', answer: null }, { id: 'saved', text: 'Câu chỉ còn trong đề', answer: null }] },
  { id: 'literature', title: 'Đề Tiếng Việt', updatedAt: '', questions: [bank[2]] },
]
const students: Student[] = ['An', 'Bình'].map((fullName, i) => ({ id: String(i), classroomId: classroom.id, fullName, studentCode: null, gender: null, characterVariant: 0, isActive: true }))
beforeEach(() => {
  vi.spyOn(api, 'questionPlan').mockResolvedValue({ bank, turns: ['q0'] })
  vi.spyOn(api, 'exams').mockResolvedValue(papers)
  vi.spyOn(api, 'saveQuestionPlan').mockResolvedValue()
  vi.spyOn(api, 'schools').mockResolvedValue([school])
  vi.spyOn(api, 'classrooms').mockResolvedValue([classroom])
  vi.spyOn(escapeApi, 'list').mockResolvedValue([])
  vi.spyOn(presetApi, 'list').mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('gán lượt chỉ từ đề đã chọn và xóa gán cũ khi đổi đề', async () => {
  render(<QuestionSetup classroom={classroom} count={2}/>)
  const exam = await screen.findByLabelText('Đề thi')
  fireEvent.change(exam, { target: { value: 'math' } })
  await waitFor(() => expect((screen.getByLabelText('Lượt 1') as HTMLSelectElement).value).toBe(''))
  const turn = within(screen.getByLabelText('Lượt 1'))
  expect(turn.queryByRole('option', { name: 'Ngoài đề' })).toBeNull()
  expect(turn.getByRole('option', { name: 'Câu chỉ còn trong đề' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Lượt 1'), { target: { value: 'saved' } })
  await waitFor(() => expect(api.saveQuestionPlan).toHaveBeenLastCalledWith('class', expect.objectContaining({ examId: 'math', turns: ['saved'] })))
  await waitFor(() => expect((screen.getByLabelText('Đề thi') as HTMLSelectElement).disabled).toBe(false))
  fireEvent.change(exam, { target: { value: 'literature' } })
  await waitFor(() => expect(within(screen.getByLabelText('Lượt 1')).queryByRole('option', { name: 'Câu chỉ còn trong đề' })).toBeNull())
  expect(api.saveQuestionPlan).toHaveBeenLastCalledWith('class', expect.objectContaining({ examId: 'literature', turns: [] }))
  expect(within(screen.getByLabelText('Lượt 1')).getByRole('option', { name: 'Câu Tiếng Việt' })).toBeTruthy()
})

it('chọn đề rồi gán câu hỏi từng vị trí phòng, đổi đề xóa gán cũ', async () => {
  vi.spyOn(escapeApi, 'start').mockResolvedValue({} as EscapeSession)
  render(<EscapeSetup school={school} classroom={classroom} back={vi.fn()} open={vi.fn()}/>)
  fireEvent.change(await screen.findByLabelText('Đề thi'), { target: { value: 'math' } })
  const desk = screen.getByLabelText('1. Câu hỏi bàn học')
  expect(within(desk).queryByRole('option', { name: 'Ngoài đề' })).toBeNull()
  expect(within(desk).getByRole('option', { name: 'Câu chỉ còn trong đề' })).toBeTruthy()
  fireEvent.change(desk, { target: { value: 'saved' } })
  fireEvent.click(screen.getByRole('button', { name: /Bắt đầu khám phá/ }))
  await waitFor(() => expect(escapeApi.start).toHaveBeenCalledWith('class', expect.objectContaining({ examId: 'math', questionIds: ['saved'] })))
  await waitFor(() => expect((screen.getByLabelText('Đề thi') as HTMLSelectElement).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Đề thi'), { target: { value: 'literature' } })
  expect((desk as HTMLSelectElement).value).toBe('')
  expect(within(desk).getByRole('option', { name: 'Câu Tiếng Việt' })).toBeTruthy()
})

it('tiếp sức chỉ chơi các câu đã chọn trong đề', async () => {
  render(<Relay classroom={classroom} students={students} back={vi.fn()} openQuestions={vi.fn()} onMatchChange={vi.fn()}/>)
  await screen.findByRole('option', { name: 'Đề Toán · 2 câu' })
  fireEvent.change(screen.getByLabelText('Đề thi'), { target: { value: 'math' } })
  fireEvent.change(screen.getByLabelText('Câu hỏi sử dụng'), { target: { value: 'selected' } })
  expect(within(screen.getByLabelText('Thêm câu hỏi')).queryByRole('option', { name: 'Ngoài đề' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Thêm câu hỏi'), { target: { value: 'saved' } })
  fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu tiếp sức' }))
  expect(screen.getByRole('heading', { name: 'Câu chỉ còn trong đề' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sai / Bỏ qua' }))
  expect(screen.getByRole('heading', { name: 'Câu chỉ còn trong đề' })).toBeTruthy()
})

it('cấu hình lưu giữ lựa chọn và thứ tự các câu thuộc đề', async () => {
  const save = vi.spyOn(presetApi, 'save').mockResolvedValue({ id: 'p', title: 'Ôn Toán', game: { kind: 'relay', settings: { names: ['A', 'B'], assignments: {}, rounds: 1 } }, sourceLabel: 'Đề Toán', questions: [papers[0].questions[1]] })
  render(<GamePresets classroom={classroom} students={students} pro back={vi.fn()} start={vi.fn()}/>)
  fireEvent.click(await screen.findByRole('button', { name: 'Tạo cấu hình' }))
  fireEvent.change(screen.getByLabelText('Tên cấu hình'), { target: { value: 'Ôn Toán' } })
  fireEvent.change(screen.getByLabelText('Nguồn câu hỏi'), { target: { value: 'exam' } })
  fireEvent.change(screen.getByLabelText('Đề thi'), { target: { value: 'math' } })
  fireEvent.click(screen.getByRole('button', { name: 'Đưa câu 2 lên' }))
  fireEvent.click(screen.getByRole('button', { name: 'Bỏ câu 2' }))
  expect(within(screen.getByLabelText('Thêm câu hỏi')).queryByRole('option', { name: 'Ngoài đề' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('class', expect.objectContaining({ questionSource: { kind: 'exam', examId: 'math', questionIds: ['saved'] } }), undefined))
})
