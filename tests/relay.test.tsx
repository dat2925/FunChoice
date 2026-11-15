// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api, type Student } from '../src/api'
import Relay from '../src/Relay'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('chấm điểm theo đội và chuyển lượt sang thành viên tiếp theo', async () => {
  vi.spyOn(api, 'questionPlan').mockResolvedValue({ turns: [], bank: [
    { id: 'q', text: 'Hai cộng hai bằng bao nhiêu?', answer: null, options: ['4', '5'], correctOptions: [0] },
  ] })
  const classroom = { id: 'class', schoolId: 'school', name: '5A', count: 4 }
  const students: Student[] = ['An', 'Bình', 'Chi', 'Dũng'].map((fullName, index) => ({
    id: String(index), classroomId: classroom.id, fullName, studentCode: null,
    characterVariant: 0, gender: null, isActive: true,
  }))
  const onMatchChange = vi.fn()
  render(<Relay classroom={classroom} students={students} back={vi.fn()} openQuestions={vi.fn()} onMatchChange={onMatchChange}/>)
  fireEvent.change(screen.getByLabelText('Đội của Dũng'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Số vòng'), { target: { value: '2' } })
  expect((screen.getByRole('button', { name: 'Bắt đầu tiếp sức' }) as HTMLButtonElement).disabled).toBe(true)
  await screen.findByText(/1 câu hỏi được xáo/)
  fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu tiếp sức' }))
  expect(onMatchChange).toHaveBeenLastCalledWith(true)
  const stage = within(screen.getByRole('region', { name: 'Màn thi đấu tiếp sức' }))
  expect(stage.getByText('An', { exact: true })).toBeTruthy()
  fireEvent.click(stage.getByRole('button', { name: /B\s*5/ }))
  fireEvent.click(stage.getByRole('button', { name: 'Dừng trận' }))
  fireEvent.click(stage.getByRole('button', { name: 'Tiếp tục chơi' }))
  expect(stage.getByRole('button', { name: /B\s*5/ }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(stage.getByRole('button', { name: 'Hiện đáp án' }))
  expect(within(stage.getByRole('group', { name: 'Các phương án' })).getByText('Đúng')).toBeTruthy()
  expect(within(stage.getByRole('group', { name: 'Các phương án' })).getByText('Sai')).toBeTruthy()
  fireEvent.click(stage.getByRole('button', { name: 'Đúng · +1 điểm' }))
  expect(stage.getByText('Bình', { exact: true })).toBeTruthy()
  expect(stage.queryByText('Đúng', { exact: true })).toBeNull()
  expect(stage.getByLabelText('Đội 1 được 1 điểm')).toBeTruthy()
  fireEvent.click(stage.getByRole('button', { name: 'Sai / Bỏ qua' }))
  expect(stage.getByText('Chi', { exact: true })).toBeTruthy()
  fireEvent.click(stage.getByRole('button', { name: 'Đúng · +1 điểm' }))
  expect(stage.getByText('Bình', { exact: true })).toBeTruthy()
  fireEvent.click(stage.getByRole('button', { name: 'Sai / Bỏ qua' }))
  expect(stage.getByRole('heading', { name: 'Đội 1 chiến thắng!' })).toBeTruthy()
  fireEvent.click(stage.getByRole('button', { name: 'Về cấu hình tiếp sức' }))
  expect(onMatchChange).toHaveBeenLastCalledWith(false)
})
