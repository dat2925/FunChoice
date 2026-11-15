import { Check, Eye, EyeOff, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { optionLetters, type Question } from './api'
import QuestionImages from './QuestionImages'

export function canGradeQuestion(question: Question) {
  return Boolean(question.options?.length && question.correctOptions?.length)
}

export default function QuestionCard({ question, turn, person, detail, className = '', actions, onConfirm }: {
  question: Question; turn: number; person?: string; detail?: string; className?: string
  actions: ReactNode; onConfirm?: (correct: boolean) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [verdict, setVerdict] = useState<boolean | null>(null)
  const correct = question.correctOptions ?? []
  const canGrade = canGradeQuestion(question)
  const confirmed = verdict !== null
  const answer = (confirmed || revealed) && question.answer

  function confirm() {
    if (confirmed || !selected.length) return
    const isCorrect = selected.length === correct.length && selected.every((option) => correct.includes(option))
    setVerdict(isCorrect)
    onConfirm?.(isCorrect)
  }

  return <section className={'question-card ' + className} aria-label={'Câu hỏi lượt ' + turn}>
    <div className="question-card-header">
      <span className="question-card-turn">Lượt {turn}</span>
      {person && <strong>{person}</strong>}
      {detail && <span className="question-card-detail">{detail}</span>}
    </div>
    <div className="question-card-body question-content">
      <h2>{question.text}</h2>
      <QuestionImages imageIds={question.imageIds} presentation/>
      {(!!question.options?.length || answer) && <div className="question-responses">
        {!!question.options?.length && <div className="question-options" role="group" aria-label="Các phương án">
          {question.options.map((option, index) => {
            const pressed = selected.includes(index)
            const result = confirmed ? (correct.includes(index) ? 'correct' : pressed ? 'incorrect' : '') : ''
            return <button key={index} type="button" className={'question-option ' + result}
              aria-pressed={pressed} disabled={confirmed || revealed}
              onClick={() => setSelected(pressed ? selected.filter((i) => i !== index) : correct.length > 1 ? [...selected, index] : [index])}>
              <span className="question-option-letter">{optionLetters[index]}</span>
              <span className="question-option-text">{option}</span>
              {result && <span className="question-option-result">{result === 'correct' ? <><Check size={15} aria-hidden="true"/> Đúng</> : <><X size={15} aria-hidden="true"/> Sai</>}</span>}
            </button>
          })}
        </div>}
        {answer && <div className="question-answer"><strong>Đáp án</strong><p>{answer}</p></div>}
      </div>}
    </div>
    <div className="question-card-actions">
      {confirmed && <p className={'question-feedback ' + (verdict ? 'correct' : 'incorrect')} role="status">
        {verdict ? <Check size={18} aria-hidden="true"/> : <X size={18} aria-hidden="true"/>}
        {verdict ? 'Trả lời đúng!' : 'Trả lời sai.'}
      </p>}
      {canGrade && !confirmed && <button className="button primary" type="button" disabled={!selected.length} onClick={confirm}>
        <Check size={22} aria-hidden="true"/> Xem kết quả
      </button>}
      {!canGrade && question.answer && <button className="button secondary" type="button" aria-expanded={revealed} onClick={() => setRevealed(!revealed)}>
        {revealed ? <EyeOff size={22} aria-hidden="true"/> : <Eye size={22} aria-hidden="true"/>}{revealed ? 'Ẩn đáp án' : 'Hiện đáp án'}
      </button>}
      <div className="question-next-actions">{actions}</div>
    </div>
  </section>
}
