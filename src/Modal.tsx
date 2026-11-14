import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

export interface DialogSpec {
  title: string; description?: string; danger?: boolean; submit?: string
  body?: ReactNode; onSave?: (data: FormData) => Promise<void>
}

export function errorText(error: unknown) {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.'
}

export default function Modal({ spec, close }: { spec: DialogSpec; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!spec.onSave || locked.current) return
    const data = new FormData(event.currentTarget)
    locked.current = true
    setBusy(true)
    setError('')
    try { await spec.onSave(data); close() }
    catch (cause) { setError(errorText(cause)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); if (!locked.current) close() }}>
    <form onSubmit={save}>
      <div className="dialog-head"><h2 id="dialog-title">{spec.title}</h2><button type="button" className="icon-button" aria-label="Đóng" onClick={close} disabled={busy}><X size={20}/></button></div>
      {spec.description && <p className="dialog-description">{spec.description}</p>}
      {spec.body}
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={close} disabled={busy}>{spec.onSave ? 'Hủy' : 'Đóng'}</button>
        {spec.onSave && <button type="submit" className={'button ' + (spec.danger ? 'danger' : 'primary')} disabled={busy}>{busy ? 'Đang lưu…' : spec.submit ?? 'Lưu thay đổi'}</button>}
      </div>
    </form>
  </dialog>
}
