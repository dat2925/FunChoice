import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const noticeKeyPrefix = 'funchoice.update.notified.'

export default function UpdatePanel({ blocked, slot }: { blocked: boolean; slot: HTMLDivElement | null }) {
  const [version, setVersion] = useState('')
  const [available, setAvailable] = useState<Update>()
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [percent, setPercent] = useState<number>()
  const [message, setMessage] = useState('')
  const [noticeVersion, setNoticeVersion] = useState<string>()
  const dialog = useRef<HTMLDialogElement>(null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const latest = useRef<Update | undefined>(undefined)
  const notified = useRef(new Set<string>())

  function announce(updateVersion: string) {
    if (notified.current.has(updateVersion)) return
    notified.current.add(updateVersion)
    try {
      const key = noticeKeyPrefix + updateVersion
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch { /* Keep the in-memory record if storage is unavailable. */ }
    if (!dialog.current?.open) setNoticeVersion(updateVersion)
  }

  async function checkLatest(manual: boolean) {
    if (inFlight.current) return
    inFlight.current = true
    setChecking(true)
    setMessage('')
    try {
      const next = await check({ timeout: 12_000 })
      if (!mounted.current) {
        void next?.close().catch(() => undefined)
        return
      }
      void latest.current?.close().catch(() => undefined)
      latest.current = next ?? undefined
      setAvailable(latest.current)
      if (next) announce(next.version)
      else setNoticeVersion(undefined)
      if (!next && manual) setMessage('Bạn đang dùng phiên bản mới nhất.')
    } catch {
      if (manual) setMessage('Không kiểm tra được bản mới. Hãy kiểm tra kết nối mạng và thử lại.')
    } finally {
      setChecking(false)
      inFlight.current = false
    }
  }

  useEffect(() => {
    if (!isTauri()) return
    mounted.current = true
    void getVersion().then(setVersion).catch(() => undefined)
    void checkLatest(false)
    const timer = window.setInterval(() => { if (!dialog.current?.open) void checkLatest(false) }, 60 * 60 * 1000)
    return () => {
      mounted.current = false
      window.clearInterval(timer)
      void latest.current?.close().catch(() => undefined)
      latest.current = undefined
    }
  }, [])

  async function install() {
    if (blocked || !available || inFlight.current) return
    inFlight.current = true
    setInstalling(true)
    setPercent(undefined)
    setMessage('Đang tải bản cập nhật…')
    let total: number | undefined
    let downloaded = 0
    try {
      await available.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength
        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          if (total) setPercent(Math.min(100, Math.floor(downloaded * 100 / total)))
        }
        if (event.event === 'Finished') {
          setPercent(undefined)
          setMessage('Đang xác minh và cài đặt. FunChoice sẽ đóng để cập nhật.')
        }
      })
    } catch {
      setInstalling(false)
      setMessage('Không cài được bản cập nhật. Hãy thử lại hoặc tải bộ cài từ trang FunChoice.')
    } finally {
      inFlight.current = false
    }
  }

  if (!isTauri()) return null
  const releaseNotes = available?.body?.trim()
  const noteLines = releaseNotes?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const bulletNotes = noteLines?.every((line) => /^[-*] +\S/.test(line)) ? noteLines : undefined
  return <>
    {slot && createPortal(<div className="update-panel">
      {version && <span>v{version}</span>}
      <button className={'button ' + (available ? 'soft' : 'secondary')} onClick={() => {
        setNoticeVersion(undefined)
        dialog.current?.showModal()
        if (!available) void checkLatest(true)
      }}><Download size={15} aria-hidden="true"/>{available ? 'Có bản ' + available.version : 'Kiểm tra cập nhật'}</button>
    </div>, slot)}
    {available && noticeVersion === available.version && <aside className="update-notice" aria-label="Thông báo cập nhật">
      <Download size={20} aria-hidden="true"/>
      <div className="update-notice-content">
        <p role="status"><strong>FunChoice có bản cập nhật mới</strong><br/>Phiên bản {available.version} đã sẵn sàng.</p>
        {blocked && <p className="muted">Hoàn tất lượt chơi hoặc thao tác đang mở để cập nhật.</p>}
        <div className="toolbar-actions">
          <button className="button primary" disabled={blocked || checking || installing} onClick={() => {
            setNoticeVersion(undefined)
            dialog.current?.showModal()
            void install()
          }}>Cập nhật ngay</button>
          <button className="button secondary" onClick={() => setNoticeVersion(undefined)}>Để sau</button>
        </div>
      </div>
    </aside>}
    <dialog className="update-dialog panel" ref={dialog} aria-labelledby="update-title"
      onCancel={(event) => { if (installing) event.preventDefault() }}>
      <h2 id="update-title">{available ? 'FunChoice ' + available.version : 'Cập nhật FunChoice'}</h2>
      {releaseNotes && <section className="update-notes" aria-labelledby="update-notes-title">
        <h3 id="update-notes-title">Có gì mới</h3>
        {bulletNotes ? <ul>{bulletNotes.map((line, index) => <li key={index}>{line.replace(/^[-*] +/, '')}</li>)}</ul>
          : <p>{releaseNotes}</p>}
      </section>}
      {blocked && available && !installing && <p className="hint">Hãy hoàn tất lượt chơi hoặc thao tác đang mở trước khi cập nhật.</p>}
      {checking && <p className="muted" role="status">Đang kiểm tra bản cập nhật…</p>}
      {message && <p className="muted" role="status">{message}{percent !== undefined ? ' ' + percent + '%' : ''}</p>}
      {installing && <progress value={percent} max={100} aria-label="Tiến độ cập nhật"/>}
      <div className="toolbar-actions">
        <button className="button secondary" disabled={installing} onClick={() => dialog.current?.close()}>{available ? 'Để sau' : 'Đóng'}</button>
        {available ? <button className="button primary" disabled={blocked || checking || installing} onClick={() => void install()}>Cập nhật ngay</button>
          : <button className="button primary" disabled={checking} onClick={() => void checkLatest(true)}>Kiểm tra lại</button>}
      </div>
    </dialog>
  </>
}
