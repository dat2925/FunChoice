import { ArrowLeft, ArrowRight, BookOpen, Clock3, DoorOpen, Play, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Classroom, type Exam, type Question, type School } from '../../api'
import roomArt from '../../assets/escape-classroom.png'
import { errorText } from '../../Modal'
import ExamSelect from '../../ExamSelect'
import EscapeRules from './EscapeRules'
import { stations, objects, roomWidth, roomHeight, chapter, defaultEscapeConfig, escapeApi, formatTime, isActive, type EscapeSession } from './model'

export default function EscapeSetup({ school, classroom, back, open }: {
  school: School; classroom: Classroom; back: () => void
  open: (session: EscapeSession, selectedSchool: School, selectedClass: Classroom) => void
}) {
  const [selectedSchool, setSchool] = useState(school.id)
  const [selectedClass, setClass] = useState(classroom.id)
  const [schools, setSchools] = useState<School[]>([school])
  const [classes, setClasses] = useState<Classroom[]>([classroom])
  const [bank, setBank] = useState<Question[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [config, setConfig] = useState(defaultEscapeConfig)
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
    if (selectedClass) void Promise.all([api.questionPlan(selectedClass), escapeApi.list(selectedClass), api.exams(selectedClass)])
      .then(([plan, sessions, papers]) => {
        if (!active) return
        setBank(plan.bank)
        setExams(papers)
        setPending(sessions.find(isActive))
        setLoading(false)
      }).catch((cause) => { if (active) { setLoadError(errorText(cause)); setLoading(false) } })
    return () => { active = false }
  }, [selectedClass, retry])

  function resetSelection() {
    setConfig((current) => ({ ...current, deskQuestionId: null, bookQuestionId: null, questionIds: [], examId: null }))
    setError(''); setLoadError(''); setBank([]); setExams([]); setPending(undefined); setLoading(true)
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

  const availableQuestions = config.examId ? exams.find((exam) => exam.id === config.examId)?.questions ?? [] : bank

  return <div className="subpage escape-setup">
    <button type="button" className="text-button" onClick={back}><ArrowLeft size={16}/> Chọn trò chơi</button>
    <div className="page-heading"><div><h1>Căn phòng bí ẩn</h1><p>Cả lớp cùng giải đố · {chapter}</p></div></div>
    <div className="escape-setup-grid">
      <figure className="escape-cover panel"><div className="escape-setup-map"><img src={roomArt} alt="Phòng học cổ có bàn gỗ, tủ sách, đồng hồ, tranh, két sắt và cửa thoát hiểm"/>
        {stations.slice(0, config.questionCount ?? 3).map((station, index) => {
          const [x, y, w, h] = objects[station].bounds
          return <button type="button" key={station} className="escape-object" aria-label={`${index + 1}. ${objects[station].label}`} title={objects[station].label} style={{ left: `${x / roomWidth * 100}%`, top: `${y / roomHeight * 100}%`, width: `${w / roomWidth * 100}%`, height: `${h / roomHeight * 100}%` }}
            onClick={() => document.getElementById(`escape-question-${station}`)?.focus()}><span>{index + 1}</span></button>
        })}</div>
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
        </div>
        <EscapeRules config={config} change={setConfig}/>
        <div className="escape-question-selection">
          <h3><BookOpen size={17}/> Câu hỏi trong phòng</h3>
          <p className="muted">Bấm vị trí trên ảnh để chọn câu hỏi cho chỗ đó. Mỗi câu đúng nhận một chữ số; thứ tự và giá trị manh mối đổi ngẫu nhiên mỗi lượt.</p>
          {!selectedClass && <p className="muted">Chọn trường có ít nhất một lớp để bắt đầu.</p>}
          {selectedClass && loading && <p role="status">Đang tải câu hỏi và tiến trình…</p>}
          {selectedClass && !loading && !config.examId && !bank.length && !loadError && <p className="muted">Lớp chưa có câu hỏi. Phòng sẽ dùng câu hỏi mẫu cho từng vị trí.</p>}
          <ExamSelect exams={exams} value={config.examId} disabled={loading || busy} change={(examId) => setConfig({
            ...config, examId, questionIds: [], deskQuestionId: null, bookQuestionId: null,
          })}/>
          {stations.slice(0, config.questionCount ?? 3).map((station, index) => <label key={station}>{index + 1}. Câu hỏi {objects[station].label.toLowerCase()}
            <select id={`escape-question-${station}`} value={config.questionIds?.[index] ?? ''} disabled={loading || busy} onChange={(event) => {
              const questionIds = [...(config.questionIds ?? [])]
              questionIds[index] = event.target.value || null
              setConfig({ ...config, questionIds })
            }}>
              <option value="">{config.examId ? 'Theo thứ tự trong đề' : 'Dùng câu hỏi mẫu'}</option>{availableQuestions.map((question) => <option key={question.id} value={question.id}>{question.text.slice(0, 120)}</option>)}
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
