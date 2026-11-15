import { Check, Eye, EyeOff, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { optionLetters, type Question } from './api'

export default function QuestionCard({ question, turn, person, detail, className = '', actions }: {
  question: Question; turn: number; person?: string; detail?: string; className?: string; actions: ReactNode
}) {
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const correct = question.correctOptions ?? []
  const hasAnswer = !!question.answer || correct.length > 0
  return <section className={'question-card ' + className} aria-label={'Câu hỏi lượt ' + turn}>
    <div className="question-card-header">
      <span className="question-card-turn">Lượt {turn}</span>
      {person && <strong>{person}</strong>}
      {detail && <span className="question-card-detail">{detail}</span>}
    </div>
    <div className="question-card-body">
      <h2>{question.text}</h2>
      {!!question.options?.length && <div className="question-options" role="group" aria-label="Các phương án">
        {question.options.map((option, index) => {
          const pressed = selected.includes(index)
          const result = revealed && correct.length ? correct.includes(index) ? 'correct' : pressed ? 'incorrect' : '' : ''
          return <button key={index} type="button" className={'question-option ' + result}
            aria-pressed={pressed} disabled={revealed}
            onClick={() => setSelected(pressed ? selected.filter((i) => i !== index) : correct.length > 1 ? [...selected, index] : [index])}>
            <span className="question-option-letter">{optionLetters[index]}</span>
            <span className="question-option-text">{option}</span>
            {result && <span className="question-option-result">{result === 'correct' ? <><Check size={15} aria-hidden="true"/> Đúng</> : <><X size={15} aria-hidden="true"/> Sai</>}</span>}
          </button>
        })}
      </div>}
      {revealed && question.answer && <div className="question-answer"><strong>Đáp án</strong><p>{question.answer}</p></div>}
    </div>
    <div className="question-card-actions">
      {hasAnswer && <button className="button secondary" type="button" aria-expanded={revealed} onClick={() => setRevealed(!revealed)}>
        {revealed ? <EyeOff size={17} aria-hidden="true"/> : <Eye size={17} aria-hidden="true"/>}{revealed ? 'Ẩn đáp án' : 'Hiện đáp án'}
      </button>}
      <div className="question-next-actions">{actions}</div>
    </div>
  </section>
}
