// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import EscapeSetup from '../src/game/escape-room/EscapeSetup'
import EscapePlay from '../src/game/escape-room/EscapePlay'
import { defaultEscapeConfig, escapeApi, objects, stations, type EscapeSession } from '../src/game/escape-room/model'

vi.mock('../src/game/escape-room/audio', () => ({ createRoomAudio: () => ({ play: vi.fn(), close: vi.fn() }) }))
vi.mock('../src/game/escape-room/RoomScene', async () => {
  const { useEffect } = await import('react')
  return { default: ({ ready }: { ready: () => void }) => { useEffect(ready, [ready]); return null } }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const school = { id: 'school', name: 'Hoa Sen', count: 1, theme: 'city' as const }
const classroom = { id: 'class', schoolId: school.id, name: '5A', count: 1 }
const questions = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, text: `Câu hỏi riêng ${i + 1}`, answer: 'Đáp án', options: ['A', 'B'], correctOptions: [1] }))
function session(): EscapeSession {
  return { id: 'room', classroomId: 'class', schoolName: 'Hoa Sen', classroomName: '5A', config: { ...defaultEscapeConfig, questionCount: 10, sound: false },
    startedAt: '', status: 'playing', revision: 0, remainingMs: null, elapsedMs: 0, questions,
    clueValues: [0, 9, 8, 7, 6, 5, 4, 3, 2, 1], clueOrder: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], inventory: [], hintsUsed: 0, answers: [], correct: 0, wrong: 0 }
}
it('cho chọn 3–10 vị trí, bấm ảnh để chọn câu hỏi và giữ gán câu hỏi khi đổi số lượng', async () => {
  vi.spyOn(api, 'schools').mockResolvedValue([school])
  vi.spyOn(api, 'classrooms').mockResolvedValue([classroom])
  vi.spyOn(api, 'questionPlan').mockResolvedValue({ bank: questions, turns: [] })
  vi.spyOn(escapeApi, 'list').mockResolvedValue([])
  const start = vi.spyOn(escapeApi, 'start').mockResolvedValue(session())
  render(<EscapeSetup school={school} classroom={classroom} back={vi.fn()} open={vi.fn()}/>)
  await screen.findAllByRole('option', { name: questions[0].text })
  for (let count = 3; count <= 10; count++) {
    fireEvent.change(screen.getByLabelText('Số câu hỏi'), { target: { value: String(count) } })
    expect(document.querySelectorAll('.escape-setup-map button')).toHaveLength(count)
    expect(document.querySelectorAll('.escape-question-selection select')).toHaveLength(count)
  }
  fireEvent.click(screen.getByRole('button', { name: '10. Tấm thảm' }))
  const rugQuestion = screen.getByLabelText('10. Câu hỏi tấm thảm')
  expect(document.activeElement).toBe(rugQuestion)
  fireEvent.change(rugQuestion, { target: { value: 'q9' } })
  fireEvent.change(screen.getByLabelText('Số câu hỏi'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Số câu hỏi'), { target: { value: '10' } })
  expect((screen.getByLabelText('10. Câu hỏi tấm thảm') as HTMLSelectElement).value).toBe('q9')
  fireEvent.click(screen.getByRole('button', { name: /Bắt đầu khám phá/ }))
  expect(start).toHaveBeenCalledWith('class', expect.objectContaining({ questionCount: 10, questionIds: expect.arrayContaining(['q9']) }))
})
it('mở câu hỏi riêng tại mọi vị trí, gồm đồng hồ và các vị trí mới', async () => {
  render(<EscapePlay initial={session()} back={vi.fn()} replay={vi.fn()}/> )
  await screen.findByRole('button', { name: 'Đồng hồ' })
  for (let index = 0; index < 10; index++) {
    fireEvent.click(screen.getByRole('button', { name: objects[stations[index]].label }))
    if (stations[index] === 'book') fireEvent.click(screen.getByRole('button', { name: /Mở cuốn sách/ }))
    expect(screen.getByRole('heading', { name: questions[index].text })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }))
  }
})
it('nhập được mật mã 10 số, giữ số 0 ở đầu và gửi đủ độ dài', async () => {
  const room = session()
  room.inventory = stations.map((station) => objects[station].item!)
  const action = vi.spyOn(escapeApi, 'action').mockResolvedValue({ session: room, feedback: 'wrongCode' })
  render(<EscapePlay initial={room} back={vi.fn()} replay={vi.fn()}/> )
  fireEvent.click(await screen.findByRole('button', { name: 'Két sắt' }))
  const detail = within(screen.getByRole('region', { name: 'Chi tiết khám phá' }))
  const open = detail.getByRole('button', { name: 'Mở két' }) as HTMLButtonElement
  fireEvent.change(detail.getByLabelText('Mật mã két'), { target: { value: '012345678' } })
  expect(open.disabled).toBe(true)
  fireEvent.change(detail.getByLabelText('Mật mã két'), { target: { value: '0123456789' } })
  expect(open.disabled).toBe(false)
  fireEvent.click(open)
  await screen.findByText('Mật mã chưa đúng. Kiểm tra lại thứ tự các mảnh giấy.')
  expect(action).toHaveBeenCalledWith(room, expect.any(Number), { type: 'safe', code: '0123456789' })
})
