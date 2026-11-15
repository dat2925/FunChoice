// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import QuestionCard from '../src/QuestionCard'

afterEach(cleanup)

const question = { id: 'q', text: 'Chọn các số chẵn', answer: 'Hai và bốn là số chẵn.', options: ['2', '3', '4'], correctOptions: [0, 2] }

it.each([
  { options: [2, 0], expected: true, wrong: 0 },
  { options: [0], expected: false, wrong: 0 },
  { options: [0, 1, 2], expected: false, wrong: 1 },
])('auto-grades the selected options $options only after confirmation', ({ options, expected, wrong }) => {
  const onConfirm = vi.fn()
  render(<QuestionCard question={question} turn={1} gradeOnSelection actions={<button>Tiếp tục</button>} onConfirm={onConfirm}/>)
  const confirm = screen.getByRole<HTMLButtonElement>('button', { name: 'Xem kết quả' })
  const group = within(screen.getByRole('group', { name: 'Các phương án' }))
  const answers = group.getAllByRole<HTMLButtonElement>('button')
  expect(confirm.disabled).toBe(true)
  for (const index of options) fireEvent.click(answers[index])
  expect(confirm.disabled).toBe(false)
  expect(screen.queryByRole('status')).toBeNull()
  expect(onConfirm).not.toHaveBeenCalled()
  fireEvent.click(confirm)
  expect(screen.getByRole('status').textContent).toBe(expected ? 'Trả lời đúng!' : 'Trả lời sai.')
  expect(group.getAllByText('Đúng', { exact: true })).toHaveLength(2)
  expect(group.queryAllByText('Sai', { exact: true })).toHaveLength(wrong)
  expect(answers.every((answer) => answer.disabled)).toBe(true)
  expect(screen.getByText(question.answer)).toBeTruthy()
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(expected)
})

it('keeps manual answer reveal for non-graded questions', () => {
  render(<QuestionCard question={{ id: 'open', text: 'Giải thích vì sao.', answer: 'Đáp án mẫu.' }} turn={1} actions={null}/>)
  expect(screen.queryByRole('button', { name: 'Xem kết quả' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Hiện đáp án' }))
  expect(screen.getByText('Đáp án mẫu.')).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
})
