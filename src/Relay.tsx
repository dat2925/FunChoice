import { ArrowLeft, Play, Shuffle, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Classroom, type Question, type Student } from './api'
import { errorText } from './Modal'
import ProductBrand from './ProductBrand'
import QuestionCard, { canGradeQuestion } from './QuestionCard'

interface Team { name: string; members: Student[] }
interface Match { teams: Team[]; rounds: number; scores: number[]; turn: number; scored: boolean; questions: Question[] }

function shuffle<T>(items: T[]) {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default function Relay({ classroom, students, back, openQuestions, onMatchChange }: {
  classroom: Classroom; students: Student[]; back: () => void; openQuestions: () => void; onMatchChange: (active: boolean) => void
}) {
  const [names, setNames] = useState(['Đội 1', 'Đội 2'])
  const [assignments, setAssignments] = useState<Record<string, number>>({})
  const [rounds, setRounds] = useState<number>()
  const [bank, setBank] = useState<Question[]>()
  const [error, setError] = useState('')
  const [match, setMatch] = useState<Match>()
  const [quitting, setQuitting] = useState(false)
  const teamCount = Math.min(names.length, Math.max(students.length, 2))
  const teams = names.slice(0, teamCount).map((name, index) => ({
    name: name.trim(),
    members: students.filter((student, i) => (assignments[student.id] ?? i % teamCount) === index),
  }))
  const roundCount = rounds ?? Math.max(1, ...teams.map((team) => team.members.length))
  const canStart = students.length >= 2 && Number.isSafeInteger(roundCount * teamCount) && Number.isInteger(roundCount)
    && roundCount > 0 && teams.every((team) => team.name && team.members.length) && !!bank?.length
  const matchActive = !!match

  useEffect(() => {
    onMatchChange(matchActive)
    return () => onMatchChange(false)
  }, [matchActive, onMatchChange])

  useEffect(() => {
    let current = true
    void api.questionPlan(classroom.id).then((plan) => { if (current) setBank(plan.bank) })
      .catch((cause) => { if (current) setError(errorText(cause)) })
    return () => { current = false }
  }, [classroom.id])

  function start() {
    if (!canStart || !bank) return
    setMatch({ teams, rounds: roundCount, scores: teams.map(() => 0), turn: 0, scored: false, questions: shuffle(bank) })
  }

  function score(points: number, advance = true) {
    if (!match) return
    const turn = match.turn
    setMatch((current) => {
      if (!current || current.turn !== turn || turn >= current.rounds * current.teams.length || (current.scored && !advance)) return current
      const team = turn % current.teams.length
      const scores = current.scored ? current.scores : current.scores.map((value, index) => index === team ? value + points : value)
      return { ...current, turn: advance ? turn + 1 : turn, scored: !advance, scores }
    })
  }

  if (match) {
    const total = match.rounds * match.teams.length
    const finished = match.turn >= total
    const teamIndex = match.turn % match.teams.length
    const round = Math.floor(match.turn / match.teams.length)
    const team = match.teams[teamIndex]
    const member = team.members[round % team.members.length]
    const winningScore = Math.max(...match.scores)
    const winners = match.teams.filter((_, i) => match.scores[i] === winningScore).map((entry) => entry.name)
    const question = match.questions[match.turn % match.questions.length]
    const canGrade = canGradeQuestion(question)
    return <section className="relay-stage" aria-label="Màn thi đấu tiếp sức">
      <header className="relay-header"><div><h1>Tiếp sức đấu đội</h1><p>{classroom.name}</p></div>
        {!finished && <button className="button play-button" onClick={() => setQuitting(true)}>Dừng trận</button>}
      </header>
      <div className="relay-scores">{match.teams.map((entry, i) => <div key={i} className={'relay-score ' + (!finished && teamIndex === i ? 'current' : '')}>
        <strong>{entry.name}</strong><span aria-label={entry.name + ' được ' + match.scores[i] + ' điểm'}>{match.scores[i]}</span>
      </div>)}</div>
      {finished ? <article className="panel relay-turn">
        <Trophy size={36}/><h2>{winners.length === 1 ? winners[0] + ' chiến thắng!' : 'Đồng hạng: ' + winners.join(', ')}</h2>
        <p>{winningScore} điểm · {match.rounds} vòng</p>
        <button className="button primary" onClick={() => setMatch(undefined)}>Về cấu hình tiếp sức</button>
      </article> : quitting ? <article className="panel relay-turn">
        <h2>Dừng trận đang chơi?</h2><p>Điểm của trận này sẽ được đặt lại.</p>
        <div className="toolbar-actions"><button className="button secondary" onClick={() => setQuitting(false)}>Tiếp tục chơi</button>
          <button className="button primary" onClick={() => { setMatch(undefined); setQuitting(false) }}>Dừng và về cấu hình</button></div>
      </article> : null}
      {!finished && <div className="relay-question-wrap" hidden={quitting}>
        <QuestionCard key={match.turn} question={question} turn={match.turn + 1} person={member.fullName}
          detail={team.name + ' · Vòng ' + (round + 1) + '/' + match.rounds}
          onConfirm={(correct) => score(correct ? 1 : 0, false)}
          actions={canGrade ? <button className={'button ' + (match.scored ? 'primary' : 'secondary')} onClick={() => score(0)}>
            Tiếp tục
          </button> : <>
          <button className="button secondary" onClick={() => score(0)}>Sai / Bỏ qua</button>
          <button className="button primary" onClick={() => score(1)}>Đúng · +1 điểm</button>
        </>}/>
      </div>}
      <ProductBrand className="game-brand"/>
    </section>
  }

  return <div className="subpage">
    <button className="text-button" onClick={back}><ArrowLeft size={16}/> Chọn trò chơi</button>
    <div className="page-heading"><div><h1>Tiếp sức đấu đội</h1><p>{classroom.name} · {students.length} học sinh đang hoạt động</p></div></div>
    {error && <div className="alert" role="alert">{error}</div>}
    <div className="setup-grid">
      <section className="panel setup-panel">
        <h2>Luật thi đấu</h2>
        <div className="form-grid">
          <label>Số đội<select value={teamCount} onChange={(e) => {
            const count = Number(e.target.value)
            setNames(Array.from({ length: count }, (_, i) => names[i] ?? 'Đội ' + (i + 1)))
            setAssignments({})
          }}>
            {Array.from({ length: Math.max(1, Math.min(students.length, 6) - 1) }, (_, i) => <option key={i}>{i + 2}</option>)}
          </select></label>
          <label>Số vòng<input type="number" min={1} value={roundCount} onChange={(e) => setRounds(e.target.value === '' ? undefined : Number(e.target.value))}/></label>
        </div>
        <p className="hint">Mỗi vòng, các đội có một lượt. Mỗi lượt trả lời đúng được 1 điểm. Thành viên luân phiên theo danh sách đội.</p>
        <p className="hint">{bank?.length ? bank.length + ' câu hỏi được xáo thứ tự khi bắt đầu. Câu hỏi được dùng lại khi đã hết ngân hàng.' : bank || error ? 'Hãy thêm hoặc nhập câu hỏi để bắt đầu.' : 'Đang tải ngân hàng câu hỏi…'} <button className="text-button" onClick={openQuestions}>Chuẩn bị câu hỏi</button></p>
        <div className="relay-team-names">{teams.map((team, i) => <label key={i}>Tên đội {i + 1}
          <input maxLength={60} value={names[i]} onChange={(e) => setNames(names.map((name, j) => j === i ? e.target.value : name))}/>
          <small>{team.members.length} thành viên</small>
        </label>)}</div>
      </section>
      <section className="panel setup-panel">
        <h2>Chia thành viên</h2>
        <button className="button secondary" onClick={() => setAssignments(Object.fromEntries(shuffle(students).map((student, i) => [student.id, i % teamCount])))}><Shuffle size={16}/> Chia đều ngẫu nhiên</button>
        <ul className="relay-members">{students.map((student, i) => <li key={student.id}>
          <label><span>{student.fullName}{student.studentCode && <small> · {student.studentCode}</small>}</span>
            <select aria-label={'Đội của ' + student.fullName + (student.studentCode ? ' · ' + student.studentCode : '')}
              value={assignments[student.id] ?? i % teamCount} onChange={(e) => setAssignments({ ...assignments, [student.id]: Number(e.target.value) })}>
              {teams.map((team, j) => <option key={j} value={j}>{team.name || 'Đội ' + (j + 1)}</option>)}
            </select>
          </label>
        </li>)}</ul>
      </section>
    </div>
    <div className="start-strip"><span>{teams.some((team) => !team.members.length) ? 'Mỗi đội cần ít nhất một thành viên.' : roundCount + ' vòng · ' + roundCount * teamCount + ' lượt thi đấu'}</span>
      <button className="button primary big" onClick={start} disabled={!canStart}><Play size={18}/> Bắt đầu tiếp sức</button>
    </div>
  </div>
}
