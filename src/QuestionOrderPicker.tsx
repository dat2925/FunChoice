import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { Question } from './api'

export default function QuestionOrderPicker({ questions, selected, change, disabled = false }: {
  questions: Question[]; selected: string[]; change: (ids: string[]) => void; disabled?: boolean
}) {
  const byId = new Map(questions.map((question) => [question.id, question]))
  function move(index: number, next: number) {
    const ids = [...selected]
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    change(ids)
  }
  return <>
    <label>Thêm câu hỏi<select value="" disabled={disabled} onChange={(event) => {
      const id = event.target.value
      if (id && !selected.includes(id)) change([...selected, id])
    }}>
      <option value="">{questions.length ? 'Chọn câu hỏi để thêm' : 'Nguồn đã chọn chưa có câu hỏi'}</option>
      {questions.filter((question) => !selected.includes(question.id)).map((question) => <option key={question.id} value={question.id}>{question.text.slice(0, 140)}</option>)}
    </select></label>
    {!!selected.length && <ol className="preset-questions">{selected.map((id, index) => <li key={id}>
      <span>{byId.get(id)?.text ?? 'Câu hỏi không còn trong nguồn đã chọn'}</span>
      <div className="item-actions">
        <button type="button" className="icon-button" aria-label={`Đưa câu ${index + 1} lên`} disabled={disabled || index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16}/></button>
        <button type="button" className="icon-button" aria-label={`Đưa câu ${index + 1} xuống`} disabled={disabled || index === selected.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16}/></button>
        <button type="button" className="icon-button delete" aria-label={`Bỏ câu ${index + 1}`} disabled={disabled} onClick={() => change(selected.filter((value) => value !== id))}><Trash2 size={16}/></button>
      </div>
    </li>)}</ol>}
  </>
}
