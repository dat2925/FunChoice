import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LicenseInfo } from './api'
import Modal, { errorText } from './Modal'

interface Plan { id: string; name: string; amount: number; months?: number; years: number }
interface Receipt { id: string; token: string; planId?: string }
interface Order { status: 'pending' | 'paid' | 'expired'; checkoutUrl: string | null; amount: number }

const pendingKey = 'funchoice.pro.pending-order'
const recoveredKey = 'funchoice.pro.last-receipt'
const previousOrdersKey = 'funchoice.pro.previous-orders'
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
const lifetimeComparisonMonths = 24

function duration(months: number) {
  return months === 0 ? 'Không hết hạn' : `Thời hạn ${months} tháng`
}

function loadReceipt(key: string): Receipt | undefined {
  const value = localStorage.getItem(key)
  if (!value) return undefined
  try { return JSON.parse(value) as Receipt } catch { return undefined }
}

function loadPreviousOrders(): Receipt[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(previousOrdersKey) ?? '[]')
    return Array.isArray(values) ? values.filter((entry) => typeof entry?.id === 'string' && typeof entry.token === 'string') : []
  } catch { return [] }
}

function printable(receipt: Receipt) { return receipt.id + '.' + receipt.token }

function newReceipt(planId: string): Receipt {
  const random = crypto.getRandomValues(new Uint8Array(32))
  return { id: crypto.randomUUID(), token: Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join(''), planId }
}

export function proPurchaseAvailable() { return invoke<boolean>('pro_purchase_available') }

export default function ProPurchase({ open, close, activated, license }: {
  open: boolean; close: () => void; activated: (status: LicenseInfo) => void; license: LicenseInfo | null
}) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState(() => loadReceipt(pendingKey))
  const [last, setLast] = useState(() => loadReceipt(recoveredKey))
  const [previousOrders, setPreviousOrders] = useState(loadPreviousOrders)
  const [choosingPlan, setChoosingPlan] = useState(false)
  const [order, setOrder] = useState<Order>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [restoreCode, setRestoreCode] = useState('')
  const operation = useRef(false)
  const checking = useRef<string | null>(null)
  const current = useRef(receipt)

  const onActivated = useRef(activated)
  onActivated.current = activated

  const complete = useCallback((entry: Receipt, status: LicenseInfo) => {
    localStorage.setItem(recoveredKey, JSON.stringify(entry))
    setLast(entry)
    if (current.current?.id === entry.id) {
      localStorage.removeItem(pendingKey)
      current.current = undefined
      setReceipt(undefined)
      setOrder(undefined)
    }
    onActivated.current(status)
    setMessage('Đã kích hoạt FunChoice Pro.')
  }, [])

  const poll = useCallback(async () => {
    const entry = current.current
    if (!entry || operation.current || checking.current === entry.id) return
    checking.current = entry.id
    try {
      const result = await invoke<Order>('pro_order_status', { id: entry.id, token: entry.token })
      if (current.current?.id !== entry.id || operation.current) return
      setOrder(result)
      setError('')
      if (result.status === 'paid') {
        setChoosingPlan(false)
        operation.current = true
        setBusy(true)
        try { complete(entry, await invoke<LicenseInfo>('pro_claim', { id: entry.id, token: entry.token })) }
        finally { operation.current = false; setBusy(false) }
      }
    } catch {
      if (current.current?.id === entry.id && !operation.current) {
        setError('Chưa kiểm tra được đơn. Bạn có thể thử lại khi có mạng hoặc lấy lại liên kết thanh toán.')
      }
    } finally {
      if (checking.current === entry.id) checking.current = null
    }
  }, [complete])

  useEffect(() => {
    if (!receipt) return
    void poll()
    const timer = window.setInterval(() => void poll(), 5000)
    window.addEventListener('focus', poll)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', poll) }
  }, [receipt, poll])

  const loadPlans = useCallback(async () => {
    setLoading(true)
    try { setPlans((await invoke<{ plans: Plan[] }>('pro_plans')).plans); setError('') }
    catch (cause) { setError(errorText(cause)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (open) void loadPlans() }, [open, loadPlans])

  async function checkout(entry: Receipt, openBrowser: boolean) {
    if (operation.current || !entry.planId) return
    operation.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const previous = current.current
      if (previous && previous.id !== entry.id) {
        const history = [previous, ...previousOrders.filter((item) => item.id !== previous.id && item.id !== entry.id)]
        localStorage.setItem(previousOrdersKey, JSON.stringify(history))
        setPreviousOrders(history)
      }
      // Persist the receipt before any network call or browser hand-off.
      localStorage.setItem(pendingKey, JSON.stringify(entry))
      current.current = entry
      setReceipt(entry)
      if (previous?.id !== entry.id) setOrder(undefined)
      setChoosingPlan(false)
      const result = await invoke<Order>('pro_create_order', { id: entry.id, token: entry.token, planId: entry.planId })
      setOrder(result)
      if (result.status === 'paid') {
        complete(entry, await invoke<LicenseInfo>('pro_claim', { id: entry.id, token: entry.token }))
      } else if (result.checkoutUrl && openBrowser) {
        await invoke('pro_open_checkout', { url: result.checkoutUrl })
        setMessage('Hãy thanh toán trong trình duyệt rồi quay lại FunChoice.')
      }
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false); operation.current = false }
  }

  function choose(planId: string) {
    if (operation.current || order?.status === 'paid') return
    if (current.current?.planId === planId && order?.status !== 'expired') {
      setChoosingPlan(false)
      return
    }
    void checkout(newReceipt(planId), false)
  }

  async function recover() {
    if (operation.current) return
    const [id, token, extra] = restoreCode.trim().split('.')
    if (!id || !token || extra !== undefined) { setError('Nhập đầy đủ mã khôi phục của đơn đã thanh toán.'); return }
    operation.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try { complete({ id, token }, await invoke<LicenseInfo>('pro_recover', { id, token })) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false); operation.current = false }
  }

  async function copy(entry: Receipt) {
    try { await navigator.clipboard.writeText(printable(entry)); setMessage('Đã sao chép mã khôi phục.') }
    catch { setMessage('Chọn nội dung trong ô mã khôi phục để sao chép.') }
  }

  if (!open) return null
  const permanent = license?.pro && license.expiresAt === null
  const visibleReceipt = receipt ?? last
  const archived = previousOrders.filter((entry) => entry.id !== receipt?.id && entry.id !== last?.id)
  const currentPlan = plans.find((plan) => plan.id === receipt?.planId)
  const monthlyAmount = plans.find((plan) => plan.id === 'pro-1m')?.amount ?? 0
  return <Modal close={close} className="purchase-dialog" spec={{
    title: 'Nâng cấp Pro',
    description: 'Mỗi gói dùng trên một máy Windows. Sau khi kích hoạt, FunChoice Pro dùng được ngoại tuyến.',
    body: <div className="purchase-panel">
      {loading && <p className="muted" role="status">Đang tải gói Pro…</p>}
      {permanent ? <p className="hint">Máy này đã có Pro vĩnh viễn.</p> : (!receipt || choosingPlan) && <>
        {receipt && <div className="toolbar-actions">
          <button className="button secondary" type="button" onClick={() => setChoosingPlan(false)}>Quay lại đơn đang chọn</button>
          <span className="muted">Chọn gói mới để tạo đơn khác. Mã khôi phục của đơn trước sẽ được giữ lại.</span>
        </div>}
        {!!plans.length && <div className="purchase-plans">{plans.map((plan) => {
          const lifetime = plan.id === 'pro-lifetime'
          const featured = plan.id === 'pro-1y'
          const variant = lifetime ? ' purchase-plan-lifetime' : featured ? ' purchase-plan-featured' : ''
          const months = plan.months ?? plan.years * 12
          const monthlyTotal = monthlyAmount * (lifetime ? lifetimeComparisonMonths : months)
          const savings = monthlyTotal > plan.amount ? Math.round((monthlyTotal - plan.amount) / monthlyTotal * 100) : 0
          return <article className={'purchase-plan' + variant} key={plan.id}>
            <div className="purchase-plan-heading">
              <h3>{plan.name}</h3>
              {(featured || lifetime) && <span className="purchase-plan-badge">{lifetime ? 'Mua một lần' : 'Phổ biến'}</span>}
            </div>
            <p className="muted">{duration(months)}</p>
            <div className="purchase-plan-pricing">
              <strong className="purchase-plan-price">{money.format(plan.amount)}</strong>
              {savings > 0 && <p className="purchase-plan-savings">
                <strong>Tiết kiệm {savings}%</strong>
                <small>{lifetime ? `So với trả theo tháng trong ${lifetimeComparisonMonths} tháng` : 'So với trả theo tháng'}</small>
              </p>}
            </div>
            <button className={'button ' + (featured || lifetime ? 'primary' : 'secondary')} type="button"
              aria-label={`Mua ${plan.name}`} disabled={busy || !license?.machineCode}
              onClick={() => choose(plan.id)}>Mua</button>
          </article>
        })}</div>}
        {!loading && !plans.length && <>
          {!error && <p className="muted" role="status">Các gói Pro chưa mở bán.</p>}
          <button className="text-button" type="button" onClick={() => void loadPlans()}>Tải lại danh sách gói</button>
        </>}
      </>}
      {receipt && !choosingPlan && <div className="hint">
        {currentPlan && <p>{currentPlan.name}</p>}
        <strong>{order?.status === 'expired' ? 'Đơn đã hết hạn' : order?.status === 'paid' ? 'Đã thanh toán' : 'Đơn đang chờ xác nhận'}</strong>
        {order && <p>{money.format(order.amount)}</p>}
        <div className="toolbar-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => void poll()}>Kiểm tra đơn hàng</button>
          {order?.status !== 'paid' && order?.status !== 'expired' && <button className="button primary" type="button" disabled={busy} onClick={() => void checkout(receipt, true)}>Mở trang thanh toán</button>}
          {!permanent && order?.status !== 'paid' && <button className="button secondary" type="button" disabled={busy} onClick={() => setChoosingPlan(true)}>Chọn gói khác</button>}
        </div>
      </div>}
      {visibleReceipt && <div>
        <label>Mã khôi phục đơn hàng<input readOnly value={printable(visibleReceipt)} onFocus={(e) => e.currentTarget.select()}/></label>
        <button className="text-button" type="button" onClick={() => void copy(visibleReceipt)}>Sao chép mã khôi phục</button>
        <p className="muted">Giữ riêng mã này để lấy lại bản quyền trên cùng máy.</p>
      </div>}
      {!!archived.length && <details>
        <summary>Đơn trước</summary>
        {archived.map((entry) => <div key={entry.id}>
          <label>{plans.find((plan) => plan.id === entry.planId)?.name ?? 'Đơn Pro'}
            <input aria-label="Mã khôi phục đơn trước" readOnly value={printable(entry)} onFocus={(e) => e.currentTarget.select()}/>
          </label>
          <button className="text-button" type="button" onClick={() => void copy(entry)}>Sao chép mã đơn trước</button>
        </div>)}
      </details>}
      <details>
        <summary>Khôi phục bản quyền</summary>
        <label>Mã khôi phục<input value={restoreCode} onChange={(e) => setRestoreCode(e.target.value)} maxLength={101} autoComplete="off" spellCheck={false}/></label>
        <button className="button secondary" type="button" disabled={busy || !restoreCode.trim()} onClick={() => void recover()}>Khôi phục Pro</button>
      </details>
      {message && <p className="muted" role="status">{message}</p>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>,
  }}/>
}
