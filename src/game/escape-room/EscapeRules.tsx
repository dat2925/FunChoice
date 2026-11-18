import type { EscapeConfig } from './model'

export default function EscapeRules({ config, change }: { config: EscapeConfig; change: (config: EscapeConfig) => void }) {
  return <>
    <label>Số câu hỏi<select value={config.questionCount ?? 3} onChange={(event) => change({ ...config, questionCount: Number(event.target.value) })}>
      {Array.from({ length: 8 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n} câu · {n} vị trí</option>)}
    </select></label>
    <label>Thời lượng<select value={config.limitMinutes ?? ''} onChange={(event) => change({ ...config, limitMinutes: Number(event.target.value) || null })}>
      {[5, 10, 15, 20].map((time) => <option key={time} value={time}>{time} phút</option>)}<option value="">Không giới hạn</option>
    </select></label>
    <div className="toolbar-actions">
      <label className="switch-row">Âm thanh<input type="checkbox" checked={config.sound} onChange={(event) => change({ ...config, sound: event.target.checked })}/></label>
      <label className="switch-row">Gợi ý<input type="checkbox" checked={config.hints} onChange={(event) => change({ ...config, hints: event.target.checked })}/></label>
    </div>
    <label>Khi trả lời sai<select value={config.wrongAnswer} onChange={(event) => change({ ...config, wrongAnswer: event.target.value === 'timePenalty' ? 'timePenalty' : 'retry' })}>
      <option value="retry">Cho thử lại</option><option value="timePenalty">Cho thử lại và trừ 15 giây nếu có giới hạn</option>
    </select></label>
  </>
}
