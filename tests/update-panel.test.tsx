// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater'
import UpdatePanel from '../src/UpdatePanel'

vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '1.2.21' }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }))

afterEach(cleanup)

it('hiện bản mới, chặn khi còn lượt chơi và thông báo lỗi cài đặt', async () => {
  const downloadAndInstall = vi.fn(async (progress: (event: DownloadEvent) => void) => {
    progress({ event: 'Started', data: { contentLength: 100 } })
    progress({ event: 'Progress', data: { chunkLength: 50 } })
    throw new Error('download failed')
  })
  vi.mocked(check).mockResolvedValue({
    version: '1.2.22',
    close: vi.fn(async () => undefined),
    downloadAndInstall,
  } as unknown as Awaited<ReturnType<typeof check>>)

  const { rerender } = render(<UpdatePanel blocked/>)
  const available = await screen.findByRole('button', { name: 'Có bản 1.2.22' })
  const dialog = document.querySelector('dialog')!
  dialog.showModal = () => { dialog.open = true }
  fireEvent.click(available)
  const install = screen.getByRole<HTMLButtonElement>('button', { name: 'Cập nhật ngay' })
  expect(install.disabled).toBe(true)
  expect(downloadAndInstall).not.toHaveBeenCalled()

  rerender(<UpdatePanel blocked={false}/>)
  fireEvent.click(install)
  await screen.findByText(/Không cài được bản cập nhật/)
  expect(downloadAndInstall).toHaveBeenCalledOnce()
  expect(install.disabled).toBe(false)
})
