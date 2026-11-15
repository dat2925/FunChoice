import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export default function UpdatePanel({ blocked }: { blocked: boolean }) {
  const [version, setVersion] = useState('')
  const [available, setAvailable] = useState<Update>()
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [percent, setPercent] = useState<number>()
  const [message, setMessage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const latest = useRef<Update | undefined>(undefined)

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
  return <div className="update-panel">
    {version && <span>v{version}</span>}
    <button className={'button ' + (available ? 'soft' : 'secondary')} onClick={() => {
      dialog.current?.showModal()
      if (!available) void checkLatest(true)
    }}><Download size={15} aria-hidden="true"/>{available ? 'Có bản ' + available.version : 'Kiểm tra cập nhật'}</button>
    <dialog className="update-dialog panel" ref={dialog} aria-labelledby="update-title"
      onCancel={(event) => { if (installing) event.preventDefault() }}>
      <h2 id="update-title">{available ? 'FunChoice ' + available.version : 'Cập nhật FunChoice'}</h2>
      {available?.body && <p className="update-notes">{available.body}</p>}
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
  </div>
}
