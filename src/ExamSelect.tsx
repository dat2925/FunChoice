import type { Exam } from './api'

export default function ExamSelect({ exams, value, change, disabled = false }: {
  exams: Exam[]; value?: string | null; change: (id: string | null) => void; disabled?: boolean
}) {
  return <label>Đề thi<select value={value ?? ''} disabled={disabled} onChange={(event) => change(event.target.value || null)}>
    <option value="">Ngân hàng câu hỏi (không chọn đề)</option>
    {value && !exams.some((exam) => exam.id === value) && <option value={value} disabled>Đề đã bị xóa — hãy chọn lại</option>}
    {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title} · {exam.questions.length} câu</option>)}
  </select></label>
}
