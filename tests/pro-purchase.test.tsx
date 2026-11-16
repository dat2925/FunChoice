// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import ProPurchase from '../src/ProPurchase'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const license = { pro: false, expiresAt: null, machineCode: 'FC-' + 'A'.repeat(32), needsMachineKey: false, freeClasses: 2, freeStudents: 30 }
const plans = [
  { id: 'pro-1m', name: 'Pro 1 tháng', months: 1, years: 0, amount: 19000 },
  { id: 'pro-3m', name: 'Pro 3 tháng', months: 3, years: 0, amount: 49000 },
  { id: 'pro-6m', name: 'Pro 6 tháng', months: 6, years: 0, amount: 99000 },
  { id: 'pro-1y', name: 'Pro 1 năm', months: 12, years: 1, amount: 149000 },
  { id: 'pro-2y', name: 'Pro 2 năm', months: 24, years: 2, amount: 199000 },
  { id: 'pro-lifetime', name: 'Pro vĩnh viễn', months: 0, years: 0, amount: 249000 },
]

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } },
  })
})
beforeEach(() => {
  vi.mocked(invoke).mockReset()
  localStorage.clear()
})
afterEach(cleanup)

it('shows the six plans in API order and buys using only the selected plan ID and order credentials', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'pro_plans') return { plans }
    return { status: 'pending', amount: plans[0].amount }
  })
  render(<ProPurchase open license={license} close={vi.fn()} activated={vi.fn()}/>)
  const cards = await screen.findAllByRole('article')
  expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(plans.map((plan) => plan.name))
  const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
  for (const [index, plan] of plans.entries()) {
    expect(within(cards[index]).getByText(currency.format(plan.amount).replace(/\s/g, ' '))).toBeTruthy()
    expect(within(cards[index]).getByText(plan.months ? `Thời hạn ${plan.months} tháng` : 'Không hết hạn')).toBeTruthy()
  }
  expect(within(cards[3]).getByText('Phổ biến')).toBeTruthy()
  expect(within(cards[5]).getByText('Mua một lần')).toBeTruthy()
  expect(within(cards[0]).queryByText(/Tiết kiệm/)).toBeNull()
  for (const [index, savings] of [14, 13, 35, 56, 45].entries()) {
    expect(within(cards[index + 1]).getByText(`Tiết kiệm ${savings}%`)).toBeTruthy()
  }
  expect(within(cards[5]).getByText('So với trả theo tháng trong 24 tháng')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Mua Pro 1 tháng' }))
  expect(vi.mocked(invoke)).toHaveBeenCalledWith('pro_create_order', {
    id: expect.any(String), token: expect.any(String), planId: 'pro-1m',
  })
  await screen.findByText('Đơn đang chờ xác nhận')
})

it('hides savings without an available monthly price or when the package costs more', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({ plans: plans.slice(1) })
    .mockResolvedValueOnce({ plans: [plans[0], { ...plans[1], amount: 59000 }] })
  const props = { license, close: vi.fn(), activated: vi.fn() }
  const { rerender } = render(<ProPurchase {...props} open/>)
  expect(await screen.findAllByRole('article')).toHaveLength(5)
  expect(screen.queryByText(/Tiết kiệm/)).toBeNull()

  rerender(<ProPurchase {...props} open={false}/>)
  rerender(<ProPurchase {...props} open/>)
  await screen.findByRole('button', { name: 'Mua Pro 1 tháng' })
  expect(screen.queryByText(/Tiết kiệm/)).toBeNull()
})

it('shows the empty catalogue without linking to manual activation', async () => {
  vi.mocked(invoke).mockResolvedValue({ plans: [] })
  render(<ProPurchase open license={license} close={vi.fn()} activated={vi.fn()}/>)
  expect(await screen.findByText('Các gói Pro chưa mở bán.')).toBeTruthy()
  expect(screen.queryAllByRole('article')).toHaveLength(0)
  expect(screen.queryByRole('button', { name: /Nhập key/i })).toBeNull()
})

it('claims a paid order persisted by the previous desktop version', async () => {
  const receipt = { id: 'old-order', token: 'old-token', planId: 'pro-1y' }
  localStorage.setItem('funchoice.pro.pending-order', JSON.stringify(receipt))
  const renewed = { ...license, pro: true, expiresAt: 1932500000 }
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'pro_plans') return { plans: [] }
    if (command === 'pro_order_status') return { status: 'paid', amount: 90000 }
    return renewed
  })
  const activated = vi.fn()
  render(<ProPurchase open license={license} close={vi.fn()} activated={activated}/>)
  expect(await screen.findByText('Đã kích hoạt FunChoice Pro.')).toBeTruthy()
  expect(vi.mocked(invoke)).toHaveBeenCalledWith('pro_claim', { id: receipt.id, token: receipt.token })
  expect(activated).toHaveBeenCalledWith(renewed)
  expect(localStorage.getItem('funchoice.pro.pending-order')).toBeNull()
  expect(localStorage.getItem('funchoice.pro.last-receipt')).toBe(JSON.stringify(receipt))
})

it('can switch plans with an order already pending and recover the previous order', async () => {
  const original = { id: 'old-order', token: 'old-token', planId: 'pro-1m' }
  localStorage.setItem('funchoice.pro.pending-order', JSON.stringify(original))
  let resolveOldStatus!: (result: { status: 'paid'; amount: number }) => void
  const oldStatus = new Promise<{ status: 'paid'; amount: number }>((resolve) => { resolveOldStatus = resolve })
  const renewed = { ...license, pro: true, expiresAt: 1932500000 }
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'pro_plans') return { plans }
    if (command === 'pro_order_status' && args && 'id' in args && args.id === original.id) return oldStatus
    if (command === 'pro_recover') return renewed
    return { status: 'pending', amount: plans[1].amount }
  })
  const activated = vi.fn()
  const props = { open: true, license, close: vi.fn(), activated }
  const { unmount } = render(<ProPurchase {...props}/>)

  fireEvent.click(screen.getByRole('button', { name: 'Chọn gói khác' }))
  await screen.findByRole('button', { name: 'Mua Pro 3 tháng' })
  fireEvent.click(screen.getByRole('button', { name: 'Quay lại đơn đang chọn' }))
  expect(localStorage.getItem('funchoice.pro.pending-order')).toBe(JSON.stringify(original))
  expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('pro_create_order', expect.anything())

  fireEvent.click(screen.getByRole('button', { name: 'Chọn gói khác' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mua Pro 1 tháng' }))
  expect(screen.getByText('Đơn đang chờ xác nhận')).toBeTruthy()
  expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('pro_create_order', expect.anything())

  fireEvent.click(screen.getByRole('button', { name: 'Chọn gói khác' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mua Pro 3 tháng' }))
  await screen.findByText('Pro 3 tháng')
  expect(vi.mocked(invoke)).toHaveBeenCalledWith('pro_create_order', {
    id: expect.any(String), token: expect.any(String), planId: 'pro-3m',
  })
  await act(async () => resolveOldStatus({ status: 'paid', amount: plans[0].amount }))
  expect(vi.mocked(invoke)).not.toHaveBeenCalledWith('pro_claim', expect.anything())
  expect(localStorage.getItem('funchoice.pro.previous-orders')).toBe(JSON.stringify([original]))

  unmount()
  render(<ProPurchase {...props}/>)
  await screen.findByText('Pro 3 tháng')
  fireEvent.click(screen.getByText('Đơn trước'))
  expect(screen.getByLabelText<HTMLInputElement>('Mã khôi phục đơn trước').value).toBe('old-order.old-token')
  fireEvent.click(screen.getByText('Khôi phục bản quyền'))
  fireEvent.change(screen.getByLabelText('Mã khôi phục', { exact: true }), { target: { value: 'old-order.old-token' } })
  fireEvent.click(screen.getByRole('button', { name: 'Khôi phục Pro' }))
  await screen.findByText('Đã kích hoạt FunChoice Pro.')
  expect(vi.mocked(invoke)).toHaveBeenCalledWith('pro_recover', { id: original.id, token: original.token })
  expect(activated).toHaveBeenCalledWith(renewed)
})
