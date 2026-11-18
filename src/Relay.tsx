import { ArrowLeft, ArrowRight, BookOpen, Flag, Play, Shield, Star, Trophy, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Classroom, type Exam, type Question, type Student } from './api'
import { errorText } from './Modal'
import ExamSelect from './ExamSelect'
import QuestionOrderPicker from './QuestionOrderPicker'
import ProductBrand from './ProductBrand'
import QuestionCard, { canGradeQuestion } from './QuestionCard'
import RelaySettings, { defaultRelayConfig, relayTeams, shuffle, type RelayConfig } from './RelaySettings'
import './relay.css'

interface Team { name: string; members: Student[] }
interface Match { teams: Team[]; rounds: number; scores: number[]; turn: number; scored: boolean; questions: Question[] }

function newMatch(teams: Team[], rounds: number | null, questions: Question[]): Match {
  return {
    teams, rounds: rounds ?? Math.max(1, ...teams.map((team) => team.members.length)),
    scores: teams.map(() => 0), turn: 0, scored: false, questions,
  }
}

export default function Relay({ classroom, students, back, openQuestions, onMatchChange, prepared }: {
  classroom: Classroom; students: Student[]; back: () => void; openQuestions: () => void; onMatchChange: (active: boolean) => void
  prepared?: { config: RelayConfig; questions: Question[] }
}) {
  const [config, setConfig] = useState(defaultRelayConfig)
  const [bank, setBank] = useState<Question[]>()
  const [exams, setExams] = useState<Exam[]>([])
  const [examId, setExamId] = useState<string | null>(null)
  const [questionIds, setQuestionIds] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [match, setMatch] = useState(() => prepared
    ? newMatch(relayTeams(students, prepared.config), prepared.config.rounds, prepared.questions) : undefined)
  const [quitting, setQuitting] = useState(false)
  const maxTeams = Math.max(2, Math.min(students.length, 6))
  const configured = config.names.length <= maxTeams ? config : {
    ...config, names: config.names.slice(0, maxTeams),
    assignments: Object.fromEntries(Object.entries(config.assignments).filter(([, team]) => team < maxTeams)),
  }
  const teams = relayTeams(students, configured)
  const teamCount = teams.length
  const roundCount = config.rounds ?? Math.max(1, ...teams.map((team) => team.members.length))
  const available = examId ? exams.find((exam) => exam.id === examId)?.questions ?? [] : bank ?? []
  const selectedQuestions = questionIds === null ? available : questionIds.flatMap((id) => available.filter((q) => q.id === id))
  const canStart = students.length >= 2 && Number.isSafeInteger(roundCount * teamCount) && Number.isInteger(roundCount)
    && roundCount > 0 && teams.every((team) => team.name && team.members.length) && !!selectedQuestions.length
  const matchActive = !!match

  useEffect(() => {
    onMatchChange(matchActive)
    return () => onMatchChange(false)
  }, [matchActive, onMatchChange])

  useEffect(() => {
    if (prepared) return
    let current = true
    void Promise.all([api.questionPlan(classroom.id), api.exams(classroom.id)]).then(([plan, papers]) => { if (current) { setBank(plan.bank); setExams(papers) } })
      .catch((cause) => { if (current) setError(errorText(cause)) })
    return () => { current = false }
  }, [classroom.id, prepared])

  function start() {
    if (!canStart) return
    setMatch(newMatch(teams, roundCount, shuffle(selectedQuestions)))
  }

  function leaveMatch() {
    if (prepared) back()
    else { setMatch(undefined); setQuitting(false) }
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
    return <section className="relay-stage" data-duel={match.teams.length === 2} aria-label="Màn thi đấu tiếp sức">
      <header className="relay-header">
        <div className="relay-heading">
          <div className="relay-ribbon">
            <Trophy size={46} strokeWidth={2.4} aria-hidden="true"/>
            <h1>Tiếp sức đấu đội</h1>
          </div>
          <p>{classroom.name} <span aria-hidden="true">·</span> {finished ? 'Đã hoàn tất' : `Vòng ${round + 1}/${match.rounds}`}</p>
        </div>
        <div className="relay-scores" aria-label="Bảng điểm">{match.teams.map((entry, i) => <div key={i} className={'relay-score' + (!finished && teamIndex === i ? ' current' : '')}>
          <div className="relay-score-badge">
            <span className="relay-emblem" aria-hidden="true"><Shield size={44}/><Star size={21}/></span>
            <div className="relay-score-copy">
              <strong>{entry.name}</strong>
              <span aria-label={entry.name + ' được ' + match.scores[i] + ' điểm'}>Điểm <b>{match.scores[i]}</b></span>
            </div>
          </div>
          <progress aria-label={'Điểm của ' + entry.name} max={match.rounds} value={match.scores[i]}/>
        </div>)}</div>
      </header>
      {match.teams.length === 2 && <div className="relay-podiums" aria-hidden="true">
        {match.teams.map((entry, i) => <span key={i}>{entry.name}</span>)}
      </div>}
      {finished ? <article className="panel relay-turn">
        <Trophy size={58} aria-hidden="true"/><h2>{winners.length === 1 ? winners[0] + ' chiến thắng!' : 'Đồng hạng: ' + winners.join(', ')}</h2>
        <p>{winningScore} điểm · {match.rounds} vòng</p>
        <button className="button primary" onClick={leaveMatch}>{prepared ? 'Về cấu hình đã lưu' : 'Về cấu hình tiếp sức'}</button>
      </article> : quitting ? <article className="panel relay-turn">
        <h2>Dừng trận đang chơi?</h2><p>Điểm của trận này sẽ được đặt lại.</p>
        <div className="toolbar-actions"><button className="button secondary" onClick={() => setQuitting(false)}>Tiếp tục chơi</button>
          <button className="button primary" onClick={leaveMatch}>Dừng và về cấu hình</button></div>
      </article> : null}
      {!finished && <div className={'relay-question-wrap' + (question.imageIds?.length ? ' with-images' : '')} hidden={quitting}>
        <QuestionCard key={match.turn} question={question} turn={match.turn + 1} person={member.fullName}
          className="relay-question"
          gradeOnSelection
          turnLabel={<><BookOpen size={22} aria-hidden="true"/> Câu hỏi {match.turn + 1}/{total}</>}
          actionHeading={<div className="relay-turn-label"><p><Users size={20} aria-hidden="true"/> <span>Lượt chơi <strong>{team.name}</strong></span></p></div>}
          onConfirm={(correct) => score(correct ? 1 : 0, false)}
          actions={canGrade ? <button type="button" className={'button ' + (match.scored ? 'primary' : 'secondary')} onClick={() => score(0)}>
            Tiếp tục <ArrowRight size={20} aria-hidden="true"/>
          </button> : <>
          <button className="button secondary" onClick={() => score(0)}>Sai / Bỏ qua</button>
          <button className="button primary" onClick={() => score(1)}>Đúng · +1 điểm</button>
        </>}/>
      </div>}
      <footer className="relay-footer">
        <ProductBrand className="game-brand"/>
        {!finished && !quitting && <button type="button" className="button secondary" onClick={() => setQuitting(true)}><Flag size={17} aria-hidden="true"/> Dừng trận</button>}
      </footer>
    </section>
  }

  return <div className="subpage">
    <button className="text-button" onClick={back}><ArrowLeft size={16}/> Chọn trò chơi</button>
    <div className="page-heading"><div><h1>Tiếp sức đấu đội</h1><p>{classroom.name} · {students.length} học sinh đang hoạt động</p></div></div>
    {error && <div className="alert" role="alert">{error}</div>}
    <RelaySettings students={students} config={configured} change={setConfig} maxTeams={maxTeams}>
      <ExamSelect exams={exams} value={examId} disabled={!bank} change={(id) => { setExamId(id); setQuestionIds(null) }}/>
      <label>Câu hỏi sử dụng<select value={questionIds === null ? 'all' : 'selected'} disabled={!bank} onChange={(event) => setQuestionIds(event.target.value === 'all' ? null : [])}>
        <option value="all">Dùng toàn bộ câu hỏi trong nguồn đã chọn</option><option value="selected">Chọn từng câu hỏi</option>
      </select></label>
      {questionIds !== null && <QuestionOrderPicker questions={available} selected={questionIds} change={setQuestionIds}/> }
      <p className="hint">{selectedQuestions.length ? selectedQuestions.length + ' câu hỏi được xáo thứ tự khi bắt đầu. Câu hỏi được dùng lại khi đã hết danh sách đã chọn.' : bank || error ? 'Hãy thêm hoặc nhập câu hỏi để bắt đầu.' : 'Đang tải ngân hàng câu hỏi…'} <button className="text-button" onClick={openQuestions}>Chuẩn bị câu hỏi</button></p>
    </RelaySettings>
    <div className="start-strip"><span>{teams.some((team) => !team.members.length) ? 'Mỗi đội cần ít nhất một thành viên.' : roundCount + ' vòng · ' + roundCount * teamCount + ' lượt thi đấu'}</span>
      <button className="button primary big" onClick={start} disabled={!canStart}><Play size={18}/> Bắt đầu tiếp sức</button>
    </div>
  </div>
}
