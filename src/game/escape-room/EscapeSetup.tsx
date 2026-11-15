import { ArrowLeft, ArrowRight, BookOpen, Clock3, DoorOpen, Play, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Classroom, type Question, type School } from '../../api'
import roomArt from '../../assets/escape-classroom.png'
import { errorText } from '../../Modal'
import { chapter, escapeApi, formatTime, isActive, type EscapeConfig, type EscapeSession } from './model'

const defaultConfig: EscapeConfig = { name: 'Bí mật phòng học cũ', limitMinutes: 10, sound: true, hints: true,
  wrongAnswer: 'retry', deskQuestionId: null, bookQuestionId: null }

export default function EscapeSetup({ school, classroom, back, open }: {
  school: School; classroom: Classroom; back: () => void
  open: (session: EscapeSession, selectedSchool: School, selectedClass: Classroom) => void
}) {
  const [selectedSchool, setSchool] = useState(school.id)
  const [selectedClass, setClass] = useState(classroom.id)
  const [schools, setSchools] = useState<School[]>([school])
  const [classes, setClasses] = useState<Classroom[]>([classroom])
  const [bank, setBank] = useState<Question[]>([])
  const [config, setConfig] = useState(defaultConfig)
  const [pending, setPending] = useState<EscapeSession>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    void api.schools().then((list) => { if (active) setSchools(list) })
      .catch((cause) => { if (active) setError(errorText(cause)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void api.classrooms(selectedSchool).then((list) => {
      if (!active) return
      setClasses(list)
      setClass((id) => list.some((entry) => entry.id === id) ? id : list[0]?.id ?? '')
    }).catch((cause) => { if (active) { setClasses([]); setClass(''); setError(errorText(cause)) } })
    return () => { active = false }
  }, [selectedSchool, retry])

  useEffect(() => {
    let active = true
    if (selectedClass) void Promise.all([api.questionPlan(selectedClass), escapeApi.list(selectedClass)])
      .then(([plan, sessions]) => {
        if (!active) return
        setBank(plan.bank)
        setPending(sessions.find(isActive))
        setLoading(false)
      }).catch((cause) => { if (active) { setLoadError(errorText(cause)); setLoading(false) } })
    return () => { active = false }
  }, [selectedClass, retry])

  function resetSelection() {
    setConfig((current) => ({ ...current, deskQuestionId: null, bookQuestionId: null }))
    setError(''); setLoadError(''); setBank([]); setPending(undefined); setLoading(true)
  }

  async function start(session?: EscapeSession) {
    if (busy || loading || loadError) return
    const home = schools.find((item) => item.id === selectedSchool)
    const room = classes.find((item) => item.id === selectedClass && item.schoolId === selectedSchool)
    if (!home || !room) { setError('Hãy chọn trường và lớp trước khi bắt đầu.'); return }
    setBusy(true); setError('')
    try { open(session ?? await escapeApi.start(room.id, config), home, room) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  return <div className="subpage escape-setup">
    <button type="button" className="text-button" onClick={back}><ArrowLeft size={16}/> Chọn trò chơi</button>
    <div className="page-heading"><div><h1>Căn phòng bí ẩn</h1><p>Cả lớp cùng giải đố · {chapter}</p></div></div>
    <div className="escape-setup-grid">
      <figure className="escape-cover panel"><img src={roomArt} alt="Phòng học cổ có bàn gỗ, tủ sách, đồng hồ, tranh, két sắt và cửa thoát hiểm"/>
        <figcaption><DoorOpen size={21}/> Khám phá căn phòng, giải mật mã và tìm đường thoát hiểm.</figcaption>
      </figure>
      <form className="panel setup-panel escape-setup-form" onSubmit={(event) => { event.preventDefault(); void start() }}>
        <h2>Thiết lập trò chơi</h2>
        <div className="form-grid">
          <label>Trường<select value={selectedSchool} disabled={busy} onChange={(event) => {
            resetSelection(); setClasses([]); setClass(''); setSchool(event.target.value)
          }}>{schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Lớp<select value={selectedClass} disabled={busy || !classes.length} onChange={(event) => {
            resetSelection(); setClass(event.target.value)
          }}>{classes.length ? classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">Chưa có lớp</option>}</select></label>
          <label>Tên phiên chơi<input value={config.name} required maxLength={80} onChange={(event) => setConfig({ ...config, name: event.target.value })}/></label>
          <label>Thời lượng<select value={config.limitMinutes ?? ''} onChange={(event) => setConfig({ ...config, limitMinutes: Number(event.target.value) || null })}>
            {[5, 10, 15, 20].map((time) => <option key={time} value={time}>{time} phút</option>)}<option value="">Không giới hạn</option>
          </select></label>
        </div>
        <div className="toolbar-actions">
          <label className="switch-row">Âm thanh<input type="checkbox" checked={config.sound} onChange={(event) => setConfig({ ...config, sound: event.target.checked })}/></label>
          <label className="switch-row">Gợi ý<input type="checkbox" checked={config.hints} onChange={(event) => setConfig({ ...config, hints: event.target.checked })}/></label>
        </div>
        <label>Khi trả lời sai<select value={config.wrongAnswer} onChange={(event) => setConfig({ ...config, wrongAnswer: event.target.value === 'timePenalty' ? 'timePenalty' : 'retry' })}>
          <option value="retry">Cho thử lại</option><option value="timePenalty">Cho thử lại và trừ 15 giây nếu có giới hạn</option>
        </select></label>
        <div className="escape-question-selection">
          <h3><BookOpen size={17}/> Câu hỏi trong phòng</h3>
          {!selectedClass && <p className="muted">Chọn trường có ít nhất một lớp để bắt đầu.</p>}
          {selectedClass && loading && <p role="status">Đang tải câu hỏi và tiến trình…</p>}
          {selectedClass && !loading && !bank.length && !loadError && <p className="muted">Lớp chưa có câu hỏi. Phòng sẽ dùng hai câu mẫu.</p>}
          {(['deskQuestionId', 'bookQuestionId'] as const).map((field) => <label key={field}>{field === 'deskQuestionId' ? 'Câu hỏi bàn học' : 'Câu hỏi tủ sách'}
            <select value={config[field] ?? ''} disabled={loading || busy} onChange={(event) => setConfig({ ...config, [field]: event.target.value || null })}>
              <option value="">Dùng câu hỏi mẫu</option>{bank.map((question) => <option key={question.id} value={question.id}>{question.text.slice(0, 120)}</option>)}
            </select></label>)}
        </div>
        {(error || loadError) && <div role="alert" className="alert">{loadError || error}{loadError && <button type="button" className="text-button" onClick={() => { resetSelection(); setRetry((value) => value + 1) }}>Thử lại</button>}</div>}
        {pending ? <div className="escape-pending hint"><Clock3 size={18}/><div><strong>Lớp có phiên đang dở</strong><p>{pending.config.name} · {pending.remainingMs === null ? 'Không giới hạn' : 'Còn ' + formatTime(pending.remainingMs)}</p></div>
          <button type="button" className="button primary" disabled={busy} onClick={() => void start(pending)}><RotateCcw size={16}/> Tiếp tục phiên chơi</button></div>
          : <button className="button primary" type="submit" disabled={busy || loading || !!loadError || !selectedClass || !config.name.trim()}><Play size={17}/> {busy ? 'Đang mở phòng…' : 'Bắt đầu khám phá'}<ArrowRight size={15}/></button>}
      </form>
    </div>
  </div>
}
