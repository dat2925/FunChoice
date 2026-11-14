// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Setup from '../src/Setup'
import { defaults } from '../src/api'

afterEach(cleanup)

describe('cấu hình lượt chơi', () => {
  it('chặn lớp trống hoặc số lượt lớn hơn số học sinh hoạt động', () => {
    const start = vi.fn()
    const props = { pro: true, total: 3, school: 'Hoa Sen', classroom: '5A', settings: defaults, setSettings: vi.fn(), start, back: vi.fn(), busy: false }
    const { rerender } = render(<Setup {...props} active={0}/>)
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'BẮT ĐẦU TRÒ CHƠI' })
    expect(button.disabled).toBe(true)
    rerender(<Setup {...props} active={2} settings={{ ...defaults, count: 3 }}/>)
    expect(button.disabled).toBe(true)
    rerender(<Setup {...props} active={2}/>)
    fireEvent.click(button)
    expect(start).toHaveBeenCalledOnce()
  })
})
