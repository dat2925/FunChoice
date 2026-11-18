// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import KnightPlay from '../src/game/knight-rescue/KnightPlay'
import { knightApi } from '../src/game/knight-rescue/api'
import { createGame, defaultConfig, reduceGame, sampleQuestions } from '../src/game/knight-rescue/GameState'

vi.mock('../src/game/knight-rescue/KnightRescueScene', async () => {
  const { useEffect } = await import('react')
  return { default: ({ ready }: { ready: () => void }) => { useEffect(ready, [ready]); return <div>Phaser scene</div> } }
})
vi.mock('../src/game/knight-rescue/audio', () => ({ KnightAudio: class { start() {} music() {} stop() {} close() {} effect() {} } }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
function manualGame() {
  const s = reduceGame(createGame({ ...defaultConfig, waves: 3, chests: 0, boss: false, countdown: 0, sound: false, seconds: 0 }, sampleQuestions, [], false), { type: 'tick', ms: 5000 })
  s.encounters[0].question = { id: 'manual', text: 'Hãy nêu ý kiến của em.', answer: null }
  return s
}
it('requires explicit teacher grading when no answer is available', async () => {
  const save = vi.spyOn(knightApi, 'save').mockImplementation(async s => ({ ...s, revision: s.revision + 1 }))
  render(<KnightPlay initial={manualGame()} back={vi.fn()} replay={vi.fn()}/>)
  await screen.findByRole('heading', { name: 'Hãy nêu ý kiến của em.' })
  expect(screen.getByLabelText('3 mạng')).toBeTruthy()
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Giáo viên: Sai' }))
  await screen.findByLabelText('2 mạng')
  expect(save.mock.calls[0][0].answers).toHaveLength(1)
})
it('freezes on storage failure and retries the exact result without a second hit', async () => {
  const save = vi.spyOn(knightApi, 'save').mockRejectedValueOnce(new Error('Disk unavailable')).mockImplementation(async s => ({ ...s, revision: s.revision + 1 }))
  render(<KnightPlay initial={manualGame()} back={vi.fn()} replay={vi.fn()}/>)
  await screen.findByRole('heading', { name: 'Hãy nêu ý kiến của em.' })
  fireEvent.click(screen.getByRole('button', { name: 'Giáo viên: Sai' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('3 mạng')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Thử lưu lại' }))
  await screen.findByLabelText('2 mạng')
  expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0])
  expect(save.mock.calls[1][0].answers).toHaveLength(1)
})
it('queues clicks while a snapshot is being saved and applies the encounter once', async () => {
  const save = vi.spyOn(knightApi, 'save').mockImplementation(async s => { await new Promise(resolve => setTimeout(resolve, 60)); return { ...s, revision: s.revision + 1 } })
  render(<KnightPlay initial={manualGame()} back={vi.fn()} replay={vi.fn()}/>)
  const wrong = await screen.findByRole('button', { name: 'Giáo viên: Sai' })
  fireEvent.click(wrong); fireEvent.click(wrong)
  await screen.findByLabelText('2 mạng')
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect(save.mock.calls[0][0].answers).toHaveLength(1)
})
it('persists timeout verdict when the rendered question timer expires', async () => {
  const s = manualGame(); s.remainingMs = 40; s.health = 1
  const save = vi.spyOn(knightApi, 'save').mockImplementation(async state => ({ ...state, revision: state.revision + 1 }))
  render(<KnightPlay initial={s} back={vi.fn()} replay={vi.fn()}/>)
  await screen.findByLabelText('0 mạng')
  expect(save.mock.calls[0][0].answers[0]).toMatchObject({ correct: false, timeout: true })
})
