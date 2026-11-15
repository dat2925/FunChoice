// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import UpdatePanel from '../src/UpdatePanel'

vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '1.2.21' }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }))

function TestApp({ blocked = false, showSidebar = true }: { blocked?: boolean; showSidebar?: boolean }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  return <>{showSidebar && <div ref={setSlot}/>}<UpdatePanel blocked={blocked} slot={slot}/></>
}

function update(version: string, downloadAndInstall: Update['downloadAndInstall'] = vi.fn(async () => undefined)) {
  return { version, close: vi.fn(async () => undefined), downloadAndInstall } as unknown as Update
}

beforeEach(() => { localStorage.clear(); vi.mocked(check).mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('hiện bản mới, chặn khi còn lượt chơi và thông báo lỗi cài đặt', async () => {
  const downloadAndInstall = vi.fn(async (progress: (event: DownloadEvent) => void) => {
    progress({ event: 'Started', data: { contentLength: 100 } })
    progress({ event: 'Progress', data: { chunkLength: 50 } })
    throw new Error('download failed')
  })
  vi.mocked(check).mockResolvedValue(update('1.2.22', downloadAndInstall))

  const { rerender } = render(<TestApp blocked/>)
  const available = await screen.findByRole('button', { name: 'Có bản 1.2.22' })
  const toast = screen.getByRole('complementary', { name: 'Thông báo cập nhật' })
  expect(within(toast).getByRole<HTMLButtonElement>('button', { name: 'Cập nhật ngay' }).disabled).toBe(true)
  const dialog = document.querySelector('dialog')!
  dialog.showModal = () => { dialog.open = true }
  fireEvent.click(available)
  const install = screen.getByRole<HTMLButtonElement>('button', { name: 'Cập nhật ngay' })
  expect(install.disabled).toBe(true)
  expect(downloadAndInstall).not.toHaveBeenCalled()

  rerender(<TestApp/>)
  fireEvent.click(install)
  await screen.findByText(/Không cài được bản cập nhật/)
  expect(downloadAndInstall).toHaveBeenCalledOnce()
  expect(install.disabled).toBe(false)
})

it('remembers dismissal across app launches and announces a newer version', async () => {
  vi.mocked(check).mockResolvedValueOnce(update('1.2.22')).mockResolvedValueOnce(update('1.2.22'))
    .mockResolvedValueOnce(update('1.2.23'))

  const first = render(<TestApp/>)
  const notice = await screen.findByRole('complementary', { name: 'Thông báo cập nhật' })
  fireEvent.click(within(notice).getByRole('button', { name: 'Để sau' }))
  expect(screen.queryByRole('complementary', { name: 'Thông báo cập nhật' })).toBeNull()
  first.unmount()

  const second = render(<TestApp/>)
  await screen.findByRole('button', { name: 'Có bản 1.2.22' })
  expect(screen.queryByRole('complementary', { name: 'Thông báo cập nhật' })).toBeNull()
  second.unmount()

  render(<TestApp/>)
  expect(await screen.findByText('Phiên bản 1.2.23 đã sẵn sàng.')).toBeTruthy()
})

it('announces an update detected during play and installs from the notice after play ends', async () => {
  vi.useFakeTimers()
  const downloadAndInstall = vi.fn(async () => { throw new Error('test installation failure') })
  vi.mocked(check).mockResolvedValueOnce(null).mockResolvedValueOnce(update('1.2.23', downloadAndInstall))
  const { rerender } = render(<TestApp blocked showSidebar={false}/>)
  await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000) })
  const notice = screen.getByRole('complementary', { name: 'Thông báo cập nhật' })
  const button = within(notice).getByRole<HTMLButtonElement>('button', { name: 'Cập nhật ngay' })
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(downloadAndInstall).not.toHaveBeenCalled()

  rerender(<TestApp/>)
  expect(button.disabled).toBe(false)
  const dialog = document.querySelector('dialog')!
  dialog.showModal = () => { dialog.open = true }
  await act(async () => { fireEvent.click(button) })
  expect(downloadAndInstall).toHaveBeenCalledOnce()
  expect(dialog.open).toBe(true)
  expect(screen.queryByRole('complementary', { name: 'Thông báo cập nhật' })).toBeNull()
})
