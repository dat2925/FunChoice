import { ArrowLeft, DoorOpen, Pencil, Play, Plus, Save, Sparkles, Trash2, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, defaults, type Classroom, type Exam, type Question, type Student } from './api'
import Modal, { errorText } from './Modal'
import { gameNames, presetApi, type GamePreset, type PresetGame, type QuestionSource } from './presetApi'
import ExamSelect from './ExamSelect'
import QuestionOrderPicker from './QuestionOrderPicker'
import Setup from './Setup'
import RelaySettings, { defaultRelayConfig } from './RelaySettings'
import EscapeRules from './game/escape-room/EscapeRules'
import { defaultEscapeConfig } from './game/escape-room/model'

const icons = { meteor: Sparkles, relay: Users, escape: DoorOpen }

function initialGame(kind: PresetGame['kind']): PresetGame {
  if (kind === 'relay') return { kind, settings: defaultRelayConfig }
  if (kind === 'escape') return { kind, settings: defaultEscapeConfig }
  return { kind, settings: defaults }
}

function defaultSource(kind: PresetGame['kind']): QuestionSource['kind'] {
  return kind === 'relay' ? 'bank' : 'default'
}

function PresetEditor({ previous, classroom, students, pro, bank, exams, close, saved }: {
  previous?: GamePreset; classroom: Classroom; students: Student[]; pro: boolean; bank: Question[]; exams: Exam[]
  close: () => void; saved: (preset: GamePreset) => void
}) {
  const [title, setTitle] = useState(previous?.title ?? '')
  const [game, setGame] = useState<PresetGame>(previous?.game ?? initialGame('meteor'))
  const [source, setSource] = useState<QuestionSource['kind'] | 'keep'>(previous ? 'keep' : 'default')
  const [questionIds, setQuestionIds] = useState<string[]>([])
  const [examId, setExamId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const active = students.filter((student) => student.isActive)
  const exam = exams.find((entry) => entry.id === examId)
  const count = source === 'keep' ? previous?.questions.length ?? 0 : source === 'questions' ? questionIds.length
    : source === 'exam' ? questionIds.length : source === 'bank' ? bank.length : 0
  const Icon = icons[game.kind]
  const minimum = game.kind === 'escape' ? game.settings.questionCount ?? 3 : 1
  const hasRequiredQuestions = source === 'default' || (source === 'keep' && !count) || count >= minimum
  const available = examId ? exam?.questions ?? [] : bank

  async function save() {
    if (lock.current || !title.trim() || !hasRequiredQuestions) return
    const questionSource = source === 'keep' ? null : source === 'exam' ? { kind: source, examId, questionIds } as const
      : source === 'questions' ? { kind: source, questionIds, examId: examId || null } as const : { kind: source }
    setBusy(true)
    lock.current = true
    setError('')
    try { saved(await presetApi.save(classroom.id, { title, game, questionSource }, previous?.id)) }
    catch (cause) { setError(errorText(cause)) }
    finally { lock.current = false; setBusy(false) }
  }

  return <form className="preset-editor" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <fieldset disabled={busy} className="preset-editor-fields">
      <section className="panel setup-panel preset-basics">
        <h2><Icon size={20}/> {previous ? 'Sửa cấu hình' : 'Cấu hình mới'}</h2>
        <div className="form-grid">
          <label>Tên cấu hình<input required maxLength={80} autoFocus value={title} onChange={(event) => setTitle(event.target.value)}
            placeholder="Ví dụ Ôn Toán thứ Hai"/></label>
          <label>Trò chơi<select value={game.kind} onChange={(event) => {
            const kind = event.target.value as PresetGame['kind']
            setGame(initialGame(kind))
            if (source === 'keep' || source === 'default') setSource(defaultSource(kind))
          }}>{Object.entries(gameNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        </div>
        <label>Nguồn câu hỏi<select value={source} onChange={(event) => { setSource(event.target.value as typeof source); setExamId(''); setQuestionIds([]) }}>
          {previous?.game.kind === game.kind && <option value="keep">Giữ câu hỏi đã lưu</option>}
          {game.kind !== 'relay' && <option value="default">{game.kind === 'escape' ? 'Dùng câu hỏi mẫu' : 'Chỉ chọn học sinh'}</option>}
          <option value="questions">Chọn từng câu hỏi</option>
          <option value="exam">Chọn một đề thi đã lưu</option>
          <option value="bank">Dùng toàn bộ ngân hàng câu hỏi</option>
        </select></label>
        {source === 'keep' && <p className="muted">{previous?.sourceLabel}{count > 0 && ` · ${count} câu`}</p>}
        {source === 'exam' && <label>Đề thi<select value={examId} required onChange={(event) => { setExamId(event.target.value); setQuestionIds(exams.find((exam) => exam.id === event.target.value)?.questions.map((q) => q.id) ?? []) }}>
          <option value="">{exams.length ? 'Chọn một đề thi' : 'Lớp chưa có đề thi'}</option>
          {exams.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.questions.length} câu</option>)}
        </select></label>}
        {source === 'questions' && <ExamSelect exams={exams} value={examId} change={(id) => { setExamId(id ?? ''); setQuestionIds([]) }}/>}
        {(source === 'questions' || (source === 'exam' && exam)) && <QuestionOrderPicker questions={available} selected={questionIds} change={setQuestionIds}/>}
        {source !== 'default' && source !== 'keep' && <p className="muted">{count} câu. {game.kind === 'escape'
          ? 'Câu hỏi được gắn lần lượt vào các vị trí trong phòng, theo số câu đã chọn.'
          : 'Trò chơi dùng thứ tự đã lưu và quay lại câu đầu nếu còn lượt.'}</p>}
        {!hasRequiredQuestions && <p className="hint">Hãy chọn ít nhất {minimum} câu hỏi.</p>}
      </section>
      {game.kind === 'meteor' ? <Setup preparing active={active.length} total={students.length} pro={pro} settings={game.settings}
        setSettings={(value) => setGame({ ...game, settings: { ...game.settings, ...value } })}/>
        : game.kind === 'relay' ? <RelaySettings preparing students={active} config={game.settings} change={(settings) => setGame({ ...game, settings })}/>
          : <section className="panel setup-panel"><h2>Luật khám phá</h2>
            <EscapeRules config={game.settings} change={(settings) => setGame({ ...game, settings })}/>
          </section>}
      {error && <div role="alert" className="alert">{error}</div>}
      <div className="toolbar-actions">
        <button type="submit" className="button primary" disabled={!title.trim() || !hasRequiredQuestions}><Save size={17}/> {busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
        <button type="button" className="button secondary" onClick={close}>Hủy</button>
      </div>
    </fieldset>
  </form>
}

export default function GamePresets({ classroom, students, pro, back, start }: {
  classroom: Classroom; students: Student[]; pro: boolean; back: () => void; start: (preset: GamePreset) => Promise<void>
}) {
  const [data, setData] = useState<{ presets: GamePreset[]; bank: Question[]; exams: Exam[] }>()
  const [editor, setEditor] = useState<GamePreset | 'new'>()
  const [removing, setRemoving] = useState<GamePreset>()
  const [launching, setLaunching] = useState<string>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const lock = useRef(false)

  useEffect(() => {
    let current = true
    void Promise.all([presetApi.list(classroom.id), api.questionPlan(classroom.id), api.exams(classroom.id)])
      .then(([presets, plan, exams]) => { if (current) setData({ presets, bank: plan.bank, exams }) })
      .catch((cause) => { if (current) setError(errorText(cause)) })
    return () => { current = false }
  }, [classroom.id, retry])

  async function play(preset: GamePreset) {
    if (lock.current) return
    lock.current = true
    setLaunching(preset.id)
    setError('')
    try { await start(preset) }
    catch (cause) { setError(errorText(cause)) }
    finally { lock.current = false; setLaunching(undefined) }
  }

  return <div className="subpage game-presets">
    <button type="button" className="text-button" disabled={!!launching} onClick={back}><ArrowLeft size={16}/> Chi tiết lớp</button>
    <div className="page-heading"><div><h1>Cấu hình đã lưu</h1><p>{classroom.name}</p></div>
      {data && !editor && <button type="button" className="button primary" disabled={!!launching} onClick={() => { setError(''); setEditor('new') }}><Plus size={17}/> Tạo cấu hình</button>}
    </div>
    {error && <div role="alert" className="alert">{error} {!data && <button type="button" className="text-button" onClick={() => { setError(''); setRetry((value) => value + 1) }}>Thử lại</button>}</div>}
    {!data && !error && <p role="status" className="muted">Đang tải cấu hình của lớp…</p>}
    {data && editor && <PresetEditor previous={editor === 'new' ? undefined : editor} classroom={classroom} students={students}
      pro={pro} bank={data.bank} exams={data.exams} close={() => setEditor(undefined)} saved={(preset) => {
        setData({ ...data, presets: [preset, ...data.presets.filter((item) => item.id !== preset.id)] })
        setEditor(undefined)
      }}/>}
    {data && !editor && (data.presets.length ? <div className="preset-list">{data.presets.map((preset) => {
      const Icon = icons[preset.game.kind]
      return <article className="panel preset-card" key={preset.id}>
        <span className="school-icon tone-0"><Icon size={22} aria-hidden="true"/></span>
        <div className="preset-card-copy">
          <h2>{preset.title}</h2>
          <p>{gameNames[preset.game.kind]} · {preset.sourceLabel}{preset.questions.length > 0 && ` · ${preset.questions.length} câu`}</p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="button primary" disabled={!!launching} onClick={() => void play(preset)}>
            <Play size={17}/> {launching === preset.id ? 'Đang mở…' : 'Chơi ngay'}
          </button>
          <button type="button" className="icon-button" aria-label={'Sửa ' + preset.title} disabled={!!launching} onClick={() => { setError(''); setEditor(preset) }}><Pencil size={16}/></button>
          <button type="button" className="icon-button delete" aria-label={'Xóa ' + preset.title} disabled={!!launching} onClick={() => setRemoving(preset)}><Trash2 size={16}/></button>
        </div>
      </article>
    })}</div> : <section className="panel setup-panel"><h2>Lớp này chưa có cấu hình</h2>
      <p className="muted">Tạo một cấu hình để lưu trò chơi và câu hỏi cho tiết học.</p>
    </section>)}
    {removing && <Modal close={() => setRemoving(undefined)} spec={{
      title: 'Xóa cấu hình đã lưu?', description: removing.title, submit: 'Xóa cấu hình', danger: true,
      onSave: async () => {
        await presetApi.remove(classroom.id, removing.id)
        setData((current) => current && { ...current, presets: current.presets.filter((item) => item.id !== removing.id) })
      },
    }}/>}
  </div>
}
