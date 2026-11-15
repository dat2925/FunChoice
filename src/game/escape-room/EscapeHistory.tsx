import { DoorOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { errorText } from '../../Modal'
import { escapeApi, formatTime, isActive, type EscapeSession } from './model'

const statusLabels = { completed: 'Thoát phòng', failed: 'Hết giờ', abandoned: 'Đã bỏ phiên', not_started: 'Chưa bắt đầu', paused: 'Tạm dừng', playing: 'Đang chơi' }

export default function EscapeHistory({ search, open }: { search: string; open: (session: EscapeSession) => void }) {
  const [sessions, setSessions] = useState<EscapeSession[]>()
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void escapeApi.list().then((list) => { if (active) setSessions(list) })
      .catch((cause) => { if (active) setError(errorText(cause)) })
    return () => { active = false }
  }, [])
  const filtered = sessions?.filter((session) => [session.config.name, session.schoolName, session.classroomName]
    .some((text) => text.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))))
  return <section className="escape-history" aria-label="Lịch sử Căn phòng bí ẩn">
    <h2>Căn phòng bí ẩn</h2>
    {error ? <p className="alert" role="alert">{error}</p> : !filtered ? <p role="status">Đang tải lịch sử…</p> : !filtered.length ? <p className="muted">Chưa có phiên phù hợp.</p> : filtered.map((session) => <article key={session.id} className="panel history-row">
      <span className="school-icon tone-1"><DoorOpen size={22}/></span>
      <div><h3>{session.config.name}</h3><p>{session.classroomName} · {session.schoolName} · {statusLabels[session.status]} · {formatTime(session.elapsedMs)}</p></div>
      <button className="button secondary" onClick={() => open(session)}>{isActive(session) ? 'Tiếp tục phiên chơi' : 'Xem kết quả'}</button>
    </article>)}
  </section>
}
