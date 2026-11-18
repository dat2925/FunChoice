import { useEffect, useState } from 'react'
import { api, type Classroom, type Exam, type Question, type School } from '../../api'
import { errorText } from '../../Modal'
import { fullscreen } from '../../GameView'
import { createGame, defaultConfig, encounterKinds, sampleQuestions, validQuestion, type GameState, type KnightConfig } from './GameState'
import { knightApi } from './api'
import './knight.css'

export function KnightArt() {
  return <svg viewBox="0 0 480 230" role="img" aria-label="Hiệp sĩ đáng yêu và chú mèo trước lâu đài" className="knight-art">
    <rect width="480" height="230" rx="18" fill="#d7eee4"/><circle cx="370" cy="54" r="30" fill="#fff0b8"/>
    <path d="M0 180 80 75 180 180 260 90 400 190" fill="#9bc2b4"/><path d="M0 210Q120 140 250 190T480 180V230H0" fill="#72a89c"/>
    <g fill="#8187a7" stroke="#676988" strokeWidth="3"><path d="M320 180V90h100v90M300 180V60h40v120M400 180V60h40v120"/><path d="m292 60 28-38 28 38m44 0 28-38 28 38" fill="#665681"/></g>
    <path d="M120 143 92 198h60" fill="#e5718b"/><path d="M139 178v30m27-30v30" stroke="#465978" strokeWidth="17"/>
    <rect x="126" y="131" width="52" height="50" rx="12" fill="#adc7db" stroke="#4d6585" strokeWidth="3"/>
    <circle cx="152" cy="107" r="33" fill="#e8f1f9"/><path d="M133 105h44v17h-44z" fill="#45577b"/><path d="M151 73V55" stroke="#de6385" strokeWidth="13"/>
    <path d="m188 163 18-66m-31 47 34 8" stroke="#fff2bc" strokeWidth="9"/><ellipse cx="123" cy="157" rx="18" ry="24" fill="#758fc0" stroke="#ffe6a3" strokeWidth="4"/>
    <g fill="#ffc891"><ellipse cx="244" cy="184" rx="28" ry="20"/><circle cx="244" cy="163" r="25"/><path d="m221 149 2-25 20 20m5 0 19-20 2 27"/></g>
    <g fill="#40546d"><circle cx="234" cy="163" r="4"/><circle cx="254" cy="163" r="4"/></g><path d="m241 172 4 4 4-4" fill="#db7990"/>
    <g fill="#fff3bc"><path d="m70 70 4 10 11 4-11 4-4 10-4-10-11-4 11-4m210 23 3 8 8 3-8 3-3 8-3-8-8-3 8-3"/></g>
  </svg>
}
export default function KnightSetup({ school, classroom, back, open }: { school: School; classroom: Classroom; back: () => void; open: (s: GameState) => void }) {
  const [config, setConfig] = useState({ ...defaultConfig })
  const [bank, setBank] = useState<Question[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [source, setSource] = useState('bank')
  const [random, setRandom] = useState(true)
  const [assigned, setAssigned] = useState<string[]>([])
  const [history, setHistory] = useState<GameState[]>([])
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let live = true
    void Promise.all([api.questionPlan(classroom.id), api.exams(classroom.id), knightApi.list(classroom.id)]).then(([plan, papers, sessions]) => {
      if (live) { setBank(plan.bank); setExams(papers); setHistory(sessions); setLoaded(true); setError('') }
    }).catch(e => { if (live) setError(errorText(e)) })
    return () => { live = false }
  }, [classroom.id, reload])
  const kinds = encounterKinds(config)
  const questions = source === 'sample' ? sampleQuestions : source === 'bank' ? bank : exams.find(e => e.id === source)?.questions ?? []
  const valid = questions.filter(validQuestion)
  const pending = history.filter(s => !['failed', 'completed'].includes(s.phase))
  function change<K extends keyof KnightConfig>(key: K, value: KnightConfig[K]) { setConfig(c => ({ ...c, [key]: value })) }
  async function start() {
    setBusy(true); setError('')
    try {
      const s = createGame(config, questions, assigned.slice(0, kinds.length), random)
      s.classroomId = classroom.id; s.classroomName = classroom.name; s.schoolName = school.name
      const saved = await knightApi.save(s)
      if (config.fullscreen) await fullscreen().catch(() => undefined)
      open(saved)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const timer = (label: string, key: 'seconds' | 'bossSeconds') => <label>{label}<select value={config[key]} onChange={e => change(key, +e.target.value)}>{[10, 15, 20, 30, 45, 60, 0].map(n => <option key={n} value={n}>{n ? `${n} giây` : 'Không giới hạn'}</option>)}</select></label>
  const number = (label: string, key: 'waves' | 'lives' | 'chests' | 'bossQuestions', min: number, max: number) => <label>{label}<input type="number" min={min} max={max} value={config[key]} onChange={e => change(key, +e.target.value)}/></label>
  const toggle = (label: string, key: 'boss' | 'shields' | 'hard' | 'sound' | 'allowPause' | 'pauseGrading' | 'fullscreen' | 'repeat') => <label className="switch-row"><span>{label}</span><input type="checkbox" checked={config[key]} onChange={e => change(key, e.target.checked)}/></label>
  return <div className="subpage knight-setup">
    <button className="text-button" onClick={back}>← Chọn trò chơi</button>
    <div className="page-heading"><div><h1>Hiệp Sĩ Cứu Mèo</h1><p>{school.name} · {classroom.name} · Knight's Rescue</p></div></div>
    <div className="knight-setup-grid"><aside className="panel setup-panel"><KnightArt/><h2>Một hành trình bằng tri thức</h2><p>Vượt qua những thử thách kiến thức, chiến đấu với quái vật và giải cứu chú mèo đáng yêu!</p><p>Hiệp sĩ tự di chuyển. Cả lớp cùng trả lời; giáo viên chấm câu tự luận. Mỗi câu sai hoặc hết giờ mất 1 khiên hoặc 1 tim. Rương sai không mất mạng khi tắt thử thách khó.</p><p>Boss có {config.boss ? config.bossQuestions : 0} câu bổ sung. Hoàn thành đủ câu Boss và còn mạng sẽ nhận chìa khóa giải cứu mèo.</p>
      {!!pending.length && <><h3>Tiếp tục hành trình</h3>{pending.map(s => <button className="button secondary" key={s.id} onClick={() => open({ ...s, paused: true })}>Tiếp tục · {s.wavesDone}/{s.config.waves} đợt · {s.health} tim</button>)}</>}
    </aside><form className="panel setup-panel" onSubmit={e => { e.preventDefault(); if (!busy) void start() }}>
      <h2>Thiết lập hành trình</h2><fieldset disabled={busy} className="knight-fieldset"><div className="form-grid">
        {number('Số đợt tấn công', 'waves', 3, 30)}{timer('Thời gian trả lời', 'seconds')}{number('Mạng bắt đầu', 'lives', 1, 3)}
        {number('Số rương hồi máu (0 để tắt)', 'chests', 0, 5)}{toggle('Boss cuối', 'boss')}
        {config.boss && <>{number('Số câu Boss bổ sung', 'bossQuestions', 1, 5)}{timer('Thời gian câu Boss', 'bossSeconds')}</>}
        <label>Tốc độ di chuyển<select value={config.speed} onChange={e => change('speed', +e.target.value)}>{[.5, 1, 1.5, 2].map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Đếm ngược bắt đầu<select value={config.countdown} onChange={e => change('countdown', +e.target.value)}>{[0, 3, 5, 10].map(n => <option key={n} value={n}>{n} giây</option>)}</select></label>
        {toggle('Khiên bảo vệ (tối đa 3)', 'shields')}{toggle('Âm thanh', 'sound')}{toggle('Cho phép tạm dừng', 'allowPause')}{toggle('Dừng giờ khi giáo viên đánh giá', 'pauseGrading')}{toggle('Rương sai cũng mất mạng (thử thách khó)', 'hard')}{toggle('Chơi toàn màn hình', 'fullscreen')}
      </div><h3>Câu hỏi hành trình</h3><label>Nguồn câu hỏi<select value={source} onChange={e => { setSource(e.target.value); setAssigned([]) }}><option value="bank">Ngân hàng câu hỏi của lớp</option><option value="sample">Câu hỏi mẫu · Phép cộng</option>{exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
      <label className="switch-row"><span>Chọn ngẫu nhiên câu chưa gán</span><input type="checkbox" checked={random} onChange={e => setRandom(e.target.checked)}/></label>{toggle('Cho phép lặp câu khi không đủ', 'repeat')}
      <p className="hint">Số đợt tấn công: {config.waves} — Thời gian trả lời: {config.seconds ? config.seconds + ' giây' : 'Không giới hạn'} — Mạng: {config.lives}<br/>Tổng: {kinds.length} câu = {config.waves} đợt thường + {config.chests} rương + {config.boss ? config.bossQuestions : 0} Boss. Có {valid.length} câu hợp lệ.</p>
      {valid.length < kinds.length && !config.repeat && <p role="alert" className="alert">Chưa đủ câu hỏi. Bổ sung câu, chọn câu mẫu hoặc cho phép lặp.</p>}
      {valid.length !== questions.length && <p className="alert">Đã bỏ qua {questions.length - valid.length} câu sai định dạng.</p>}
      <details><summary>Chọn thủ công từng câu · thường / rương / Boss</summary><div className="knight-assign">{kinds.map((kind, i) => <label key={i}>{i + 1}. {kind === 'attack' ? 'Tấn công' : kind === 'chest' ? 'Rương thưởng' : 'Boss'}<select value={assigned[i] ?? ''} onChange={e => setAssigned(a => { const next = [...a]; next[i] = e.target.value; return next })}><option value="">Tự chọn câu chưa dùng</option>{valid.map(q => <option value={q.id} key={q.id}>{q.text.slice(0, 110)}</option>)}</select></label>)}</div></details>
      </fieldset>{error && <p className="alert" role="alert">{error} {!loaded && <button type="button" onClick={() => setReload(n => n + 1)}>Thử tải lại</button>}</p>}
      <button className="button primary" disabled={busy || !loaded || !valid.length || !config.repeat && valid.length < kinds.length}>{busy ? 'Đang lưu phiên…' : '⚔ Bắt đầu giải cứu'}</button>
    </form></div>
    {!!history.length && <section className="panel setup-panel"><h2>Lịch sử Hiệp Sĩ Cứu Mèo</h2>{history.filter(s => ['completed', 'failed'].includes(s.phase)).map(s => <div className="knight-history" key={s.id}><span>{new Date(s.startedAt).toLocaleString('vi-VN')} · {s.phase === 'completed' ? 'Giải cứu thành công' : 'Game Over'} · {s.score} điểm</span><button className="text-button" onClick={() => open(s)}>Xem kết quả</button></div>)}</section>}
  </div>
}
