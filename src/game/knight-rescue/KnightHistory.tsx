import { useEffect, useState } from 'react'
import { errorText } from '../../Modal'
import { normalized } from '../../roster'
import { knightApi } from './api'
import type { GameState } from './GameState'

export default function KnightHistory({ search, open }: { search: string; open: (state: GameState) => void }) {
  const [sessions, setSessions] = useState<GameState[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void knightApi.list().then(s => { if (live) setSessions(s) }).catch(e => { if (live) setError(errorText(e)) })
    return () => { live = false }
  }, [])
  return <section><h2>Hiệp Sĩ Cứu Mèo</h2>{error && <p className="alert" role="alert">{error}</p>}{sessions.filter(s => normalized(s.schoolName + ' ' + s.classroomName).includes(normalized(search))).map(s => <article key={s.id} className="panel history-row"><div><strong>{s.schoolName} · {s.classroomName}</strong><p>{new Date(s.startedAt).toLocaleString('vi-VN')} · {s.wavesDone}/{s.config.waves} đợt · {s.health} tim · {s.score} điểm</p><small>{s.phase === 'completed' ? 'Giải cứu thành công' : s.phase === 'failed' ? 'Game Over' : 'Đang dở'}</small></div><button className="button secondary" onClick={() => open({ ...s, paused: !['completed', 'failed'].includes(s.phase) })}>{['completed', 'failed'].includes(s.phase) ? 'Xem kết quả' : 'Tiếp tục'}</button></article>)}</section>
}
