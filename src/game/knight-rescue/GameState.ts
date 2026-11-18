import type { Question } from '../../api'

export interface KnightConfig {
  waves: number; seconds: number; lives: number; boss: boolean; bossQuestions: number; bossSeconds: number
  chests: number; shields: boolean; hard: boolean; sound: boolean; speed: number; countdown: number
  allowPause: boolean; pauseGrading: boolean; fullscreen: boolean; repeat: boolean
}
export const defaultConfig: KnightConfig = { waves: 10, seconds: 30, lives: 3, boss: true, bossQuestions: 3,
  bossSeconds: 45, chests: 2, shields: true, hard: false, sound: true, speed: 1, countdown: 3,
  allowPause: true, pauseGrading: true, fullscreen: false, repeat: false }
export type EncounterKind = 'attack' | 'chest' | 'boss'
export interface Encounter { kind: EncounterKind; question: Question }
export type Phase = 'travel' | 'question' | 'feedback' | 'rescue' | 'completed' | 'failed'
export interface Answer { index: number; questionId: string; kind: EncounterKind; correct: boolean; timeout: boolean; elapsedMs: number }
export interface GameState {
  id: string; classroomId: string; schoolName: string; classroomName: string; startedAt: string; revision: number
  config: KnightConfig; encounters: Encounter[]; index: number; phase: Phase; paused: boolean
  health: number; shields: number; combo: number; bestCombo: number; score: number; wavesDone: number
  elapsedMs: number; remainingMs: number | null; phaseMs: number; grading: boolean; answers: Answer[]; message: string
}
export const MAX_SHIELDS = 3
export function validQuestion(q: Question) {
  return !!q.id && !!q.text.trim() && (!q.options?.length || (q.options.length <= 8 && q.options.every(o => !!o.trim()))) &&
    (!q.correctOptions?.length || (!!q.options?.length && new Set(q.correctOptions).size === q.correctOptions.length && q.correctOptions.every(i => Number.isInteger(i) && i >= 0 && i < q.options!.length)))
}
export function encounterKinds(c: KnightConfig): EncounterKind[] {
  const result: EncounterKind[] = []
  let chest = 0
  for (let wave = 1; wave <= c.waves; wave++) {
    result.push('attack')
    while (chest < c.chests && Math.ceil((chest + 1) * c.waves / (c.chests + 1)) === wave) { result.push('chest'); chest++ }
  }
  if (c.boss) result.push(...Array<EncounterKind>(c.bossQuestions).fill('boss'))
  return result
}
export function validateConfig(c: KnightConfig) {
  if (!Number.isInteger(c.waves) || c.waves < 3 || c.waves > 30 || !Number.isInteger(c.lives) || c.lives < 1 || c.lives > 3 ||
    !Number.isInteger(c.chests) || c.chests < 0 || c.chests > 5 || !Number.isInteger(c.bossQuestions) || c.bossQuestions < 1 || c.bossQuestions > 5 ||
    ![0, 10, 15, 20, 30, 45, 60].includes(c.seconds) || ![0, 10, 15, 20, 30, 45, 60].includes(c.bossSeconds) ||
    ![0.5, 1, 1.5, 2].includes(c.speed) || ![0, 3, 5, 10].includes(c.countdown)) throw new Error('Cấu hình trò chơi không hợp lệ.')
}
export function createGame(config: KnightConfig, bank: Question[], assigned: string[], random = true): GameState {
  validateConfig(config)
  const pool = [...new Map(bank.filter(validQuestion).map(q => [q.id, q])).values()]
  const kinds = encounterKinds(config)
  if (!pool.length) throw new Error('Chưa có câu hỏi hợp lệ. Hãy chọn ngân hàng hoặc câu hỏi mẫu.')
  if (!config.repeat && pool.length < kinds.length) throw new Error(`Cần ${kinds.length} câu hỏi, hiện có ${pool.length}. Hãy bổ sung hoặc cho phép lặp.`)
  const reserved = assigned.filter(Boolean)
  if (reserved.some(id => !pool.some(q => q.id === id))) throw new Error('Câu được chọn không còn trong bộ câu hỏi.')
  if (!config.repeat && new Set(reserved).size !== reserved.length) throw new Error('Có câu hỏi được gán nhiều lần. Hãy đổi câu hoặc cho phép lặp.')
  const unused = pool.filter(q => config.repeat || !reserved.includes(q.id))
  if (random) for (let i = unused.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [unused[i], unused[j]] = [unused[j], unused[i]] }
  let cursor = 0
  const encounters = kinds.map((kind, i) => ({ kind, question: structuredClone(assigned[i] ? pool.find(q => q.id === assigned[i])! : unused[cursor++ % unused.length]) }))
  return { id: crypto.randomUUID(), classroomId: '', schoolName: '', classroomName: '', startedAt: new Date().toISOString(), revision: 0,
    config: { ...config }, encounters, index: 0, phase: 'travel', paused: false, health: config.lives, shields: 0, combo: 0, bestCombo: 0,
    score: 0, wavesDone: 0, elapsedMs: 0, remainingMs: null, phaseMs: config.countdown * 1000 + 1800,
    grading: false, answers: [], message: 'Hành trình giải cứu mèo bắt đầu!' }
}
export type Action = { type: 'tick'; ms: number } | { type: 'answer'; index: number; correct: boolean; timeout?: boolean } | { type: 'pause' } | { type: 'resume' } | { type: 'grade' }
export function reduceGame(state: GameState, action: Action): GameState {
  if (state.phase === 'failed' || state.phase === 'completed') return state
  const s = structuredClone(state)
  if (action.type === 'pause') { s.paused = true; return s }
  if (action.type === 'resume') { s.paused = false; return s }
  if (s.paused) return state
  if (action.type === 'grade') { if (s.phase === 'question' && s.config.pauseGrading) s.grading = true; return s }
  if (action.type === 'answer') {
    if (s.phase !== 'question' || action.index !== s.index || s.answers.some(a => a.index === s.index)) return state
    const encounter = s.encounters[s.index]
    const correct = !action.timeout && action.correct && s.remainingMs !== 0
    const timeout = !!action.timeout || s.remainingMs === 0
    s.answers.push({ index: s.index, questionId: encounter.question.id, kind: encounter.kind, correct, timeout, elapsedMs: s.elapsedMs })
    s.grading = false
    if (encounter.kind === 'attack') s.wavesDone++
    if (correct) {
      s.score += 100
      if (encounter.kind === 'chest') {
        if (s.health < 3) { s.health++; s.message = 'Rương phép thuật: hồi 1 trái tim!' }
        else if (s.config.shields && s.shields < MAX_SHIELDS) { s.shields++; s.message = 'Nhận 1 khiên bảo vệ!' }
        else { s.score += 150; s.message = 'Đầy sức mạnh! Nhận 150 điểm thưởng.' }
      } else {
        s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo); s.score += s.combo * 10
        s.message = encounter.kind === 'boss' ? 'Phá một lớp giáp Boss!' : 'Phòng thủ thành công!'
      }
    } else {
      s.combo = 0
      if (encounter.kind !== 'chest' || s.config.hard) {
        if (s.shields > 0) { s.shields--; s.message = 'Khiên đã hấp thụ đòn đánh!' }
        else { s.health = Math.max(0, s.health - 1); s.message = 'Hiệp sĩ bị thương!' }
      } else s.message = 'Chưa mở được rương. Tiếp tục cố gắng!'
      if (timeout) s.message = 'Hết thời gian! ' + s.message
    }
    s.phase = 'feedback'; s.phaseMs = 2200
    return s
  }
  const ms = Number.isFinite(action.ms) ? Math.max(0, Math.min(5000, action.ms)) : 0
  s.elapsedMs += ms
  if (s.phase === 'question') {
    if (!s.grading && s.remainingMs !== null) {
      s.remainingMs = Math.max(0, s.remainingMs - ms)
      if (!s.remainingMs) return reduceGame(s, { type: 'answer', index: s.index, correct: false, timeout: true })
    }
  } else {
    s.phaseMs = Math.max(0, s.phaseMs - ms)
    if (!s.phaseMs) {
      if (s.phase === 'travel') {
        s.phase = 'question'
        const kind = s.encounters[s.index].kind
        const seconds = kind === 'boss' ? s.config.bossSeconds : s.config.seconds
        s.remainingMs = seconds ? seconds * 1000 : null
        s.message = kind === 'chest' ? 'Rương phép thuật · Câu hỏi thưởng' : kind === 'boss' ? 'Boss lâu đài · Phá giáp bằng tri thức!' : 'Quái vật xuất hiện! Hãy trả lời để chiến đấu.'
      } else if (s.phase === 'feedback') {
        if (!s.health) s.phase = 'failed'
        else if (s.index + 1 === s.encounters.length) { s.phase = 'rescue'; s.phaseMs = 6500; s.message = 'Đã nhận chìa khóa phép thuật! Mèo ơi, ta đến đây!' }
        else { s.index++; s.phase = 'travel'; s.phaseMs = 2600 / s.config.speed; s.remainingMs = null; s.message = 'Tiếp tục hành trình…' }
      } else if (s.phase === 'rescue') { s.phase = 'completed'; s.message = 'GIẢI CỨU THÀNH CÔNG!' }
    }
  }
  return s
}
export const sampleQuestions: Question[] = Array.from({ length: 40 }, (_, i) => ({ id: `knight-sample-${i}`, text: `${i + 1} + ${i + 2} bằng bao nhiêu?`,
  answer: String(i * 2 + 3), options: [String(i * 2 + 2), String(i * 2 + 3), String(i * 2 + 4)], correctOptions: [1] }))
