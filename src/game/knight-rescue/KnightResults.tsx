import { useState } from 'react'
import type { GameState } from './GameState'

export default function KnightResults({ state, back, replay }: { state: GameState; back: () => void; replay: () => void }) {
  const [details, setDetails] = useState(false)
  const correct = state.answers.filter(a => a.correct).length
  const timeouts = state.answers.filter(a => a.timeout).length
  return <section className="panel knight-result"><h1>{state.phase === 'completed' ? 'GIẢI CỨU THÀNH CÔNG!' : 'GAME OVER'}</h1><p>{state.phase === 'completed' ? 'Chú mèo đã trở về trong vòng tay hiệp sĩ!' : 'Chú mèo vẫn chờ trong lâu đài. Hãy thử lại nhé!'}</p>
    <div className="knight-stats">{[['Mạng còn lại', state.health], ['Trả lời đúng', correct], ['Trả lời sai', state.answers.length - correct - timeouts], ['Hết thời gian', timeouts], ['Đợt đã vượt qua', `${state.wavesDone}/${state.config.waves}`], ['Combo cao nhất', state.bestCombo], ['Thời gian', `${Math.floor(state.elapsedMs / 60000)} phút ${Math.floor(state.elapsedMs / 1000) % 60} giây`], ['Tổng điểm', state.score]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
    <div className="result-actions"><button className="button primary" onClick={replay}>{state.phase === 'failed' ? 'Thử lại' : 'Chơi lại'}</button><button className="button secondary" onClick={() => setDetails(!details)}>Xem kết quả</button><button className="button secondary" onClick={back}>Về danh sách trò chơi</button></div>
    {details && <ol className="knight-answer-list">{state.answers.map(a => <li key={a.index}><strong>{a.kind === 'boss' ? 'Boss' : a.kind === 'chest' ? 'Rương' : 'Đợt thường'} · {a.timeout ? 'Hết giờ' : a.correct ? 'Đúng' : 'Sai'}</strong><p>{state.encounters[a.index].question.text}</p></li>)}</ol>}
  </section>
}
