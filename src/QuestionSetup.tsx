import { ArrowLeft, ArrowRight, Download, FileUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, optionLetters, type Classroom, type QuestionPlan } from './api'
import { errorText } from './Modal'
import { exportCsv, readQuestions } from './roster'

const pageSize = 12

export default function QuestionSetup({ classroom, count, changeCount, back, setup }: {
  classroom: Classroom; count: number; changeCount?: (count: number) => void; back: () => void; setup?: () => void
}) {
  const [plan, setPlan] = useState<QuestionPlan>()
  const [text, setText] = useState('')
  const [answer, setAnswer] = useState('')
  const [multipleChoice, setMultipleChoice] = useState(false)
  const [options, setOptions] = useState(['', '', '', ''])
  const [correct, setCorrect] = useState<number[]>([])
  const [editing, setEditing] = useState<string>()
  const [turnPage, setTurnPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    void api.questionPlan(classroom.id).then((value) => { if (active) setPlan(value) })
      .catch((cause) => { if (active) setError(errorText(cause)) })
    return () => { active = false }
  }, [classroom.id])

  async function save(next: QuestionPlan) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.saveQuestionPlan(classroom.id, next)
      setPlan(next)
      setNotice('Đã lưu câu hỏi cho ' + classroom.name + '.')
      return true
    } catch (cause) { setError(errorText(cause)); return false }
    finally { setBusy(false) }
  }

  function clearEditor() {
    setText(''); setAnswer(''); setEditing(undefined)
    setMultipleChoice(false); setOptions(['', '', '', '']); setCorrect([])
  }

  async function importFile(input: HTMLInputElement) {
    const selected = input.files?.[0]
    input.value = ''
    if (!selected || !plan) return
    setBusy(true)
    setError('')
    try { await save({ ...plan, bank: [...plan.bank, ...await readQuestions(selected)] }) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  const turnCount = Math.max(1, Math.floor(count), plan?.turns.length ?? 0)
  const first = turnPage * pageSize
  return <div className="subpage">
    <button className="text-button" onClick={back} disabled={busy}><ArrowLeft size={16}/> Chi tiết lớp</button>
    <div className="page-heading"><div><h1>Chuẩn bị câu hỏi</h1><p>{classroom.name}</p></div>
      {setup && <button className="button primary" onClick={setup} disabled={busy || !plan?.bank.length || !!text.trim()}>Cấu hình trò chơi <ArrowRight size={16}/></button>}
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <p className="muted" role="status">{notice}</p>}
    {plan && <div className="setup-grid question-setup">
      <section className="panel setup-panel">
        <h2>Ngân hàng câu hỏi</h2>
        <div className="toolbar-actions">
          <button className="button secondary" onClick={() => file.current?.click()} disabled={busy}><FileUp size={16}/> Nhập Excel / CSV</button>
          <input ref={file} type="file" accept=".xlsx,.csv" hidden onChange={(e) => void importFile(e.currentTarget)}/>
          <button className="button secondary" onClick={() => exportCsv('mau-cau-hoi.csv', [
            ['Câu hỏi', 'Đáp án', 'A', 'B', 'C', 'D', 'Đáp án đúng'],
            ['2 + 3 bằng bao nhiêu?', '', '4', '5', '6', '', 'B'],
            ['Hãy kể về một cuốn sách em thích.', '', '', '', '', '', ''],
          ])}><Download size={16}/> Tải tệp mẫu</button>
        </div>
        <form className="question-editor" onSubmit={async (e) => {
          e.preventDefault()
          if (!text.trim() || busy || (multipleChoice && options.some((option) => !option.trim()))) return
          const item = {
            id: editing ?? crypto.randomUUID(), text: text.trim(), answer: answer.trim() || null,
            options: multipleChoice ? options.map((option) => option.trim()) : [],
            correctOptions: multipleChoice ? correct : [],
          }
          if (await save({ ...plan, bank: editing ? plan.bank.map((q) => q.id === editing ? item : q) : [...plan.bank, item] })) clearEditor()
        }}>
          <label>Câu hỏi<textarea value={text} onChange={(e) => setText(e.target.value)} required maxLength={2000} rows={3}/></label>
          <label>Loại câu hỏi<select value={multipleChoice ? 'choice' : 'open'} onChange={(e) => setMultipleChoice(e.target.value === 'choice')}>
            <option value="open">Tự luận</option><option value="choice">Trắc nghiệm</option>
          </select></label>
          {multipleChoice && <>
            <label>Số phương án<select value={options.length} onChange={(e) => {
              const count = Number(e.target.value)
              setOptions(Array.from({ length: count }, (_, i) => options[i] ?? ''))
              setCorrect(correct.filter((index) => index < count))
            }}>{Array.from({ length: optionLetters.length - 1 }, (_, i) => <option key={i}>{i + 2}</option>)}</select></label>
            <p className="muted">Đánh dấu một hoặc nhiều phương án đúng nếu muốn công bố đáp án.</p>
            {options.map((option, index) => <div className="option-editor-row" key={index}>
              <label>Phương án {optionLetters[index]}<input required maxLength={500} value={option} onChange={(e) => setOptions(options.map((item, i) => i === index ? e.target.value : item))}/></label>
              <label className="switch-row"><span>{optionLetters[index]} đúng</span><input type="checkbox" checked={correct.includes(index)} onChange={(e) => setCorrect(e.target.checked ? [...correct, index] : correct.filter((i) => i !== index))}/></label>
            </div>)}
          </>}
          <label>Đáp án (không bắt buộc)<textarea value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={4000} rows={2}/></label>
          <div className="toolbar-actions">
            <button className="button primary" disabled={busy || !text.trim()}><Plus size={16}/> {editing ? 'Lưu sửa đổi' : 'Thêm câu hỏi'}</button>
            {editing && <button type="button" className="button secondary" disabled={busy} onClick={clearEditor}>Hủy sửa</button>}
          </div>
        </form>
        {plan.bank.length > 0 && <ul className="question-bank">{plan.bank.map((q) => <li key={q.id}>
          <div><button className="text-button" title="Sửa câu hỏi" disabled={busy} onClick={() => {
            setEditing(q.id); setText(q.text); setAnswer(q.answer ?? '')
            setMultipleChoice(!!q.options?.length)
            setOptions(q.options?.length ? q.options : ['', '', '', ''])
            setCorrect(q.correctOptions ?? [])
          }}>{q.text}</button>{q.options?.length ? <small>Trắc nghiệm · {q.options.length} phương án</small> : q.answer && <small>Có đáp án</small>}</div>
          <button className="icon-button delete" title="Xóa câu hỏi" aria-label={'Xóa câu hỏi ' + q.text} disabled={busy} onClick={async () => {
            if (await save({ bank: plan.bank.filter((item) => item.id !== q.id), turns: plan.turns.map((id) => id === q.id ? null : id) }) && editing === q.id) clearEditor()
          }}><Trash2 size={16}/></button>
        </li>)}</ul>}
      </section>
      <section className="panel setup-panel">
        <h2>Câu hỏi theo lượt</h2>
        {changeCount && <label>Số lượt dự kiến<input type="number" min={1} value={count || ''} onChange={(e) => {
          changeCount(Number(e.target.value))
          setTurnPage(0)
        }}/></label>}
        <p className="muted">Gán câu cụ thể hoặc để ngẫu nhiên. Các lượt vượt số lượt chơi hiện tại được giữ lại cho lần sau.</p>
        <div className="question-turns">
          {Array.from({ length: Math.min(pageSize, turnCount - first) }, (_, i) => {
            const turn = first + i
            return <label key={turn}>Lượt {turn + 1}
              <select aria-label={'Lượt ' + (turn + 1)} value={plan.turns[turn] ?? ''} disabled={busy || !plan.bank.length} onChange={(e) => {
                const turns = Array.from({ length: Math.max(plan.turns.length, turn + 1) }, (_, j) => plan.turns[j] ?? null)
                turns[turn] = e.target.value || null
                void save({ ...plan, turns })
              }}>
                <option value="">Ngẫu nhiên</option>
                {plan.bank.map((q) => <option key={q.id} value={q.id}>{q.text.slice(0, 125)}</option>)}
              </select>
            </label>
          })}
        </div>
        {turnCount > pageSize && <div className="toolbar-actions">
          <button className="button secondary" disabled={!turnPage} onClick={() => setTurnPage(turnPage - 1)}>Lượt trước</button>
          <button className="button secondary" disabled={first + pageSize >= turnCount} onClick={() => setTurnPage(turnPage + 1)}>Lượt sau</button>
        </div>}
      </section>
    </div>}
  </div>
}
