import { ArrowDown, ArrowUp, BookOpen, ClipboardList, Eye, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, optionLetters, type Classroom, type Exam, type Question, type School } from './api'
import Modal, { errorText } from './Modal'
import QuestionSetup from './QuestionSetup'
import QuestionImages from './QuestionImages'
import { normalized } from './roster'

function ExamPreview({ exam, close }: { exam: Exam; close: () => void }) {
  const [answers, showAnswers] = useState(false)
  return <Modal close={close} spec={{ title: exam.title, description: `${exam.questions.length} câu hỏi`, body: <div className="exam-preview">
    <label className="switch-row"><input type="checkbox" checked={answers} onChange={(event) => showAnswers(event.target.checked)}/> Hiện đáp án</label>
    <ol>{exam.questions.map((question) => <li key={question.id}>
      <strong>{question.text}</strong>
      <QuestionImages imageIds={question.imageIds}/>
      {!!question.options?.length && <ul>{question.options.map((option, index) => <li key={index} className={answers && question.correctOptions?.includes(index) ? 'exam-correct' : undefined}>
        {optionLetters[index]}. {option}{answers && question.correctOptions?.includes(index) && ' · Đúng'}
      </li>)}</ul>}
      {answers && question.answer && <p>{question.answer}</p>}
      {answers && !question.answer && !question.correctOptions?.length && <p className="muted">Chưa có đáp án.</p>}
    </li>)}</ol>
  </div> }}/>
}

function ExamWorkspace({ classroom }: { classroom: Classroom }) {
  const [exams, setExams] = useState<Exam[]>()
  const [bank, setBank] = useState<Question[]>([])
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<Question[]>([])
  const [editing, setEditing] = useState<string>()
  const [examFilter, setExamFilter] = useState('')
  const [questionFilter, setQuestionFilter] = useState('')
  const [preview, setPreview] = useState<Exam>()
  const [removing, setRemoving] = useState<Exam>()
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let current = true
    void Promise.all([api.exams(classroom.id), api.questionPlan(classroom.id)]).then(([papers, plan]) => {
      if (current) { setExams(papers); setBank(plan.bank); setLoadError('') }
    }).catch((cause) => { if (current) setLoadError(errorText(cause)) })
    return () => { current = false }
  }, [classroom.id, retry])

  function edit(exam?: Exam) {
    setEditing(exam?.id)
    setTitle(exam?.title ?? '')
    setSelected(exam?.questions ?? [])
    setQuestionFilter('')
    setNotice(''); setError('')
  }

  function move(index: number, direction: -1 | 1) {
    setSelected((current) => {
      const other = index + direction
      if (other < 0 || other >= current.length || !current[index]) return current
      const next = [...current]
      ;[next[index], next[other]] = [next[other], next[index]]
      return next
    })
  }

  async function save() {
    if (busy || !title.trim() || !selected.length) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await api.saveExam(classroom.id, title.trim(), selected.map((question) => question.id), editing)
      setExams((current) => [saved, ...(current ?? []).filter((exam) => exam.id !== saved.id)])
      edit(saved)
      setNotice('Đã lưu đề thi.')
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  if (loadError) return <div className="alert" role="alert">{loadError}<button className="text-button" onClick={() => { setLoadError(''); setRetry((attempt) => attempt + 1) }}>Thử lại</button></div>
  if (!exams) return <p role="status">Đang tải đề thi…</p>
  const visibleExams = exams.filter((exam) => normalized(exam.title).includes(normalized(examFilter)))
  const available = bank.filter((question) => normalized(question.text).includes(normalized(questionFilter)))

  return <div className="exam-workspace">
    <section className="panel setup-panel exam-list" aria-labelledby="exam-list-title">
      <header><h2 id="exam-list-title">Đề thi đã lưu</h2><button type="button" className="button soft" disabled={busy} onClick={() => edit()}><Plus size={16}/> Tạo đề mới</button></header>
      {!!exams.length && <label>Tìm đề thi<input type="search" value={examFilter} onChange={(event) => setExamFilter(event.target.value)}/></label>}
      {!visibleExams.length && <p className="muted">{exams.length ? 'Không tìm thấy đề phù hợp.' : 'Lớp này chưa có đề thi.'}</p>}
      <ul>{visibleExams.map((exam) => <li key={exam.id} className={exam.id === editing ? 'exam-list-active' : undefined}>
        <div><strong>{exam.title}</strong><small>{exam.questions.length} câu hỏi</small></div>
        <div className="item-actions">
          <button className="icon-button" title="Xem đề" aria-label={'Xem đề ' + exam.title} onClick={() => setPreview(exam)}><Eye size={17}/></button>
          <button className="icon-button" title="Sửa đề" aria-label={'Sửa đề ' + exam.title} disabled={busy} onClick={() => edit(exam)}><Pencil size={16}/></button>
          <button className="icon-button delete" title="Xóa đề" aria-label={'Xóa đề ' + exam.title} disabled={busy} onClick={() => setRemoving(exam)}><Trash2 size={16}/></button>
        </div>
      </li>)}</ul>
    </section>
    <form className="panel setup-panel exam-editor" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <h2>{editing ? 'Chỉnh sửa đề thi' : 'Tạo đề thi'}</h2>
      <label>Tên đề thi<input value={title} maxLength={120} required disabled={busy} onChange={(event) => setTitle(event.target.value)}/></label>
      <div className="exam-question-grid">
        <section aria-labelledby="exam-pick-title">
          <h3 id="exam-pick-title">Chọn từ ngân hàng</h3>
          {bank.length ? <><label>Tìm câu hỏi<input type="search" value={questionFilter} onChange={(event) => setQuestionFilter(event.target.value)}/></label>
            {!available.length && <p className="muted">Không tìm thấy câu hỏi phù hợp.</p>}
            <ul className="exam-picker">{available.map((question) => {
              const added = selected.some((item) => item.id === question.id)
              return <li key={question.id}><span>{question.text}</span><button type="button" className="icon-button" title={added ? 'Đã thêm' : 'Thêm vào đề'}
                aria-label={'Thêm câu ' + question.text} disabled={busy || added} onClick={() => setSelected((items) => [...items, question])}><Plus size={16}/></button></li>
            })}</ul></> : <p className="muted">Thêm câu hỏi trong thẻ Ngân hàng câu hỏi để dùng cho đề thi.</p>}
        </section>
        <section aria-labelledby="exam-order-title">
          <h3 id="exam-order-title">Câu trong đề ({selected.length})</h3>
          {!selected.length && <p className="muted">Chọn ít nhất một câu để lưu đề.</p>}
          <ol className="exam-picker exam-order">{selected.map((question, index) => <li key={question.id}>
            <span>{question.text}</span><div className="item-actions">
              <button type="button" className="icon-button" title="Lên trên" aria-label={'Đưa câu ' + (index + 1) + ' lên'} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15}/></button>
              <button type="button" className="icon-button" title="Xuống dưới" aria-label={'Đưa câu ' + (index + 1) + ' xuống'} disabled={busy || index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15}/></button>
              <button type="button" className="icon-button delete" title="Bỏ khỏi đề" aria-label={'Bỏ câu ' + (index + 1) + ' khỏi đề'} disabled={busy} onClick={() => setSelected((items) => items.filter((item) => item.id !== question.id))}><Trash2 size={15}/></button>
            </div>
          </li>)}</ol>
        </section>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {notice && <p className="muted" role="status">{notice}</p>}
      <button className="button primary" disabled={busy || !title.trim() || !selected.length}><Save size={17}/> {busy ? 'Đang lưu…' : 'Lưu đề thi'}</button>
    </form>
    {preview && <ExamPreview exam={preview} close={() => setPreview(undefined)}/>}
    {removing && <Modal close={() => setRemoving(undefined)} spec={{ title: 'Xóa đề thi?', description: `Đề “${removing.title}” sẽ bị xóa. Các câu trong ngân hàng vẫn dùng được.`, danger: true, submit: 'Xóa đề',
      onSave: async () => {
        await api.deleteExam(classroom.id, removing.id)
        setExams((current) => current?.filter((exam) => exam.id !== removing.id))
        if (editing === removing.id) edit()
      } }}/>}
  </div>
}

export default function ExamManager({ school, classroom }: { school: School | null; classroom: Classroom | null }) {
  const [tab, setTab] = useState<'exams' | 'bank'>('exams')
  const [schools, setSchools] = useState<School[]>()
  const [classes, setClasses] = useState<Classroom[]>()
  const [schoolId, setSchool] = useState(school?.id ?? '')
  const [classId, setClass] = useState(classroom?.id ?? '')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let current = true
    void api.schools().then((list) => {
      if (!current) return
      setSchools(list)
      setSchool((value) => list.some((entry) => entry.id === value) ? value : list[0]?.id ?? '')
    }).catch((cause) => { if (current) setError(errorText(cause)) })
    return () => { current = false }
  }, [retry])

  useEffect(() => {
    let current = true
    if (schoolId) void api.classrooms(schoolId).then((list) => {
      if (!current) return
      setClasses(list)
      setClass((value) => list.some((entry) => entry.id === value) ? value : list[0]?.id ?? '')
    }).catch((cause) => { if (current) setError(errorText(cause)) })
    return () => { current = false }
  }, [schoolId, retry])

  const selectedClass = classes?.find((entry) => entry.id === classId && entry.schoolId === schoolId)
  return <div className="subpage exam-manager">
    <div className="page-heading"><div><h1>Đề thi và câu hỏi</h1><p>Ngân hàng câu hỏi theo lớp dùng chung cho đề thi và trò chơi.</p></div></div>
    <div className="panel exam-scope">
      <label>Trường<select value={schoolId} disabled={!schools?.length} onChange={(event) => { setError(''); setClasses(undefined); setClass(''); setSchool(event.target.value) }}>
        {schools?.length ? schools.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>) : <option value="">{schools ? 'Chưa có trường' : 'Đang tải trường…'}</option>}
      </select></label>
      <label>Lớp<select value={classId} disabled={!classes?.length} onChange={(event) => setClass(event.target.value)}>
        {classes?.length ? classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>) : <option value="">{classes ? 'Chưa có lớp' : 'Chọn trường trước'}</option>}
      </select></label>
    </div>
    {error ? <div className="alert" role="alert">{error}<button className="text-button" onClick={() => { setError(''); setRetry((attempt) => attempt + 1) }}>Thử lại</button></div>
      : !schools || (schoolId && !classes) ? <p role="status">Đang tải trường và lớp…</p>
      : !selectedClass ? <p className="muted">Tạo trường và lớp để bắt đầu quản lý đề và câu hỏi.</p> : <>
        <nav className="exam-tabs" aria-label="Đề thi và ngân hàng câu hỏi">
          <button className={'button ' + (tab === 'exams' ? 'soft' : 'secondary')} aria-pressed={tab === 'exams'} onClick={() => setTab('exams')}><ClipboardList size={17}/> Đề thi</button>
          <button className={'button ' + (tab === 'bank' ? 'soft' : 'secondary')} aria-pressed={tab === 'bank'} onClick={() => setTab('bank')}><BookOpen size={17}/> Ngân hàng câu hỏi</button>
        </nav>
        {tab === 'exams' ? <ExamWorkspace key={selectedClass.id} classroom={selectedClass}/> : <QuestionSetup key={selectedClass.id} classroom={selectedClass} bankOnly/>}
      </>}
  </div>
}
