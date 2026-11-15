import { Shuffle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Student } from './api'

export interface RelayConfig { names: string[]; assignments: Record<string, number>; rounds: number | null }
export const defaultRelayConfig: RelayConfig = { names: ['Đội 1', 'Đội 2'], assignments: {}, rounds: null }

export function relayTeams(students: Student[], config: RelayConfig) {
  return config.names.map((name, index) => ({
    name: name.trim(),
    members: students.filter((student, i) => (config.assignments[student.id] ?? i % config.names.length) === index),
  }))
}

export function shuffle<T>(items: T[]) {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default function RelaySettings({ students, config, change, maxTeams = 6, preparing = false, children }: {
  students: Student[]; config: RelayConfig; change: (config: RelayConfig) => void
  maxTeams?: number; preparing?: boolean; children?: ReactNode
}) {
  const teams = relayTeams(students, config)
  const teamCount = teams.length
  const automaticRounds = Math.max(1, ...teams.map((team) => team.members.length))
  return <div className="setup-grid">
    <section className="panel setup-panel">
      <h2>Luật thi đấu</h2>
      <div className="form-grid">
        <label>Số đội<select value={teamCount} onChange={(event) => change({
          ...config, names: Array.from({ length: Number(event.target.value) }, (_, i) => config.names[i] ?? 'Đội ' + (i + 1)), assignments: {},
        })}>
          {Array.from({ length: maxTeams - 1 }, (_, i) => <option key={i}>{i + 2}</option>)}
        </select></label>
        <label>Số vòng<input type="number" min={1} value={config.rounds ?? (preparing ? '' : automaticRounds)}
          placeholder={preparing ? 'Tự động' : undefined}
          onChange={(event) => change({ ...config, rounds: event.target.value === '' ? null : Number(event.target.value) })}/></label>
      </div>
      <p className="hint">{preparing ? 'Để trống số vòng để mỗi thành viên của đội đông nhất có một lượt.' : 'Mỗi vòng, các đội có một lượt. Mỗi lượt trả lời đúng được 1 điểm. Thành viên luân phiên theo danh sách đội.'}</p>
      {children}
      <div className="relay-team-names">{teams.map((team, i) => <label key={i}>Tên đội {i + 1}
        <input maxLength={60} required={preparing} value={config.names[i]}
          onChange={(event) => change({ ...config, names: config.names.map((name, j) => i === j ? event.target.value : name) })}/>
        <small>{team.members.length} thành viên</small>
      </label>)}</div>
    </section>
    <section className="panel setup-panel">
      <h2>Chia thành viên</h2>
      <button type="button" className="button secondary" disabled={!students.length} onClick={() => change({
        ...config, assignments: Object.fromEntries(shuffle(students).map((student, i) => [student.id, i % teamCount])),
      })}><Shuffle size={16}/> Chia đều ngẫu nhiên</button>
      {!students.length && <p className="muted">Học sinh sẽ được chia đều khi có danh sách lớp.</p>}
      <ul className="relay-members">{students.map((student, i) => <li key={student.id}>
        <label><span>{student.fullName}{student.studentCode && <small> · {student.studentCode}</small>}</span>
          <select aria-label={'Đội của ' + student.fullName + (student.studentCode ? ' · ' + student.studentCode : '')}
            value={config.assignments[student.id] ?? i % teamCount}
            onChange={(event) => change({ ...config, assignments: { ...config.assignments, [student.id]: Number(event.target.value) } })}>
            {teams.map((team, j) => <option key={j} value={j}>{team.name || 'Đội ' + (j + 1)}</option>)}
          </select>
        </label>
      </li>)}</ul>
    </section>
  </div>
}
