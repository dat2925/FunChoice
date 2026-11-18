import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import QuestionCard, { canGradeQuestion } from '../../QuestionCard'
import { fullscreen } from '../../GameView'
import { errorText } from '../../Modal'
import { reduceGame, type Action, type GameState } from './GameState'
import { knightApi } from './api'
import { KnightAudio } from './audio'
import KnightResults from './KnightResults'
import './knight.css'
const KnightCanvas = lazy(() => import('./KnightRescueScene'))
export default function KnightPlay({ initial, back, replay }: { initial: GameState; back: () => void; replay: () => void }) {
  const [state, setState] = useState(initial)
  const live = useRef(initial)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sound, setSound] = useState(initial.config.sound)
  const lock = useRef(false)
  const pending = useRef<GameState | null>(null)
  const audio = useRef<KnightAudio | null>(null)
  const failed = useRef(false)
  const lastSave = useRef(0)
  const lastTick = useRef(performance.now())
  const lastSound = useRef('')
  const previousShields = useRef(initial.shields)
  const onReady = useCallback(() => { lastTick.current = performance.now(); setReady(true) }, [])
  const dispatch = useCallback(async function handle(action: Action, exit = false): Promise<void> {
    if (failed.current) return
    if (lock.current) { window.setTimeout(() => void handle(action, exit), 30); return }
    const previous = live.current
    let timed = previous
    if (action.type === 'answer' && previous.phase === 'question') {
      const now = performance.now()
      timed = reduceGame(previous, { type: 'tick', ms: now - lastTick.current })
      lastTick.current = now
    }
    let next = reduceGame(timed, action)
    if (next === previous && !exit) return
    lock.current = true
    try {
      const mustSave = exit || action.type !== 'tick' || next.phase !== previous.phase || next.index !== previous.index || next.elapsedMs - lastSave.current >= 1000
      if (mustSave) {
        pending.current = next
        next = await knightApi.save(next)
        pending.current = null; lastSave.current = next.elapsedMs
      }
      live.current = next; setState(next)
      if (exit) back()
    } catch (e) { failed.current = true; setError(errorText(e)) }
    finally { lock.current = false }
  }, [back])
  useEffect(() => {
    if (!ready) return
    const timer = window.setInterval(() => {
      const now = performance.now()
      if (!lock.current && !failed.current && !document.hidden) { const ms = now - lastTick.current; lastTick.current = now; void dispatch({ type: 'tick', ms }) }
    }, 100)
    const hide = () => { if (document.hidden) void dispatch({ type: 'pause' }) }
    window.addEventListener('blur', hide); document.addEventListener('visibilitychange', hide)
    return () => { clearInterval(timer); window.removeEventListener('blur', hide); document.removeEventListener('visibilitychange', hide) }
  }, [dispatch, ready])
  useEffect(() => { audio.current = new KnightAudio(); return () => audio.current?.close() }, [])
  const boss = state.encounters[state.index].kind === 'boss'
  useEffect(() => {
    if (sound && !state.paused && !error && !['failed', 'completed'].includes(state.phase)) audio.current?.music(boss)
    else audio.current?.stop()
    return () => audio.current?.stop()
  }, [sound, state.paused, boss, error, state.phase])
  useEffect(() => {
    if (!sound) return
    const signature = `${state.index}-${state.phase}`
    if (lastSound.current === signature) return
    lastSound.current = signature
    if (state.phase === 'feedback') audio.current?.effect(state.answers.at(-1)?.correct ? state.encounters[state.index].kind : state.shields < previousShields.current ? 'shield' : 'wrong')
    previousShields.current = state.shields
    if (state.phase === 'rescue' || state.phase === 'completed') audio.current?.effect('rescue')
  }, [state.phase, state.index, sound, state.answers, state.encounters, state.shields, initial.shields])
  useEffect(() => {
    if (!sound || state.paused || state.phase !== 'travel') return
    const id = window.setInterval(() => audio.current?.effect('step'), 380 / state.config.speed)
    return () => clearInterval(id)
  }, [sound, state.phase, state.paused, state.config.speed])
  const enableAudio = () => { if (sound) audio.current?.start() }
  const terminal = state.phase === 'completed' || state.phase === 'failed'
  const encounter = state.encounters[state.index]
  async function retrySave() {
    if (!pending.current || lock.current) return
    lock.current = true
    try { const next = await knightApi.save(pending.current); live.current = next; setState(next); pending.current = null; failed.current = false; setError(''); lastTick.current = performance.now() }
    catch (e) { setError(errorText(e)) } finally { lock.current = false }
  }
  const answer = (correct: boolean) => { enableAudio(); void dispatch({ type: 'answer', index: state.index, correct }) }
  return <div className="knight-play" onPointerDown={enableAudio}>
    <header className="knight-hud"><div><strong aria-label={`${state.health} mạng`}>{[0, 1, 2].map(i => <span key={i} className={i < state.health ? '' : 'knight-empty'}>♥</span>)}</strong><small>🛡 {state.shields}/3 khiên</small></div>
      <div className="knight-progress"><b>Hiệp Sĩ Cứu Mèo · {state.wavesDone}/{state.config.waves} đợt</b><progress value={state.wavesDone} max={state.config.waves}/><small>{state.schoolName} · {state.classroomName}</small></div>
      <div className="knight-controls"><b role="timer">{state.phase === 'question' ? state.grading ? 'Đang chấm' : state.remainingMs === null ? '∞' : `${Math.ceil(state.remainingMs / 1000)}s` : '⚔'}</b>
        {state.config.allowPause && !terminal && <button className="button secondary" onClick={() => void dispatch({ type: state.paused ? 'resume' : 'pause' })}>{state.paused ? 'Tiếp tục' : 'Tạm dừng'}</button>}
        <button className="icon-button" aria-label="Bật tắt âm thanh" onClick={() => { if (!sound) audio.current?.start(); setSound(!sound) }}>{sound ? '🔊' : '🔇'}</button>
        <button className="button secondary" onClick={() => void fullscreen().catch(e => setNotice(errorText(e)))}>Toàn màn hình</button>
        <button className="text-button" onClick={() => terminal ? back() : void dispatch({ type: 'pause' }, true)}>Thoát</button>
      </div></header>
    <div className="knight-stage"><Suspense fallback={<p>Đang dựng hành trình…</p>}><KnightCanvas state={state} ready={onReady}/></Suspense>
      {!ready && <p role="status">Đang chuẩn bị sân khấu…</p>}
      {state.phase === 'travel' && state.index === 0 && state.phaseMs > 1800 && <div className="knight-countdown">{Math.ceil((state.phaseMs - 1800) / 1000)}</div>}
    </div>
    <div className="knight-story" aria-live="polite"><strong>{state.message}</strong><span>✦ {state.score} điểm · Combo {state.combo} · Kỷ lục {state.bestCombo}</span></div>
    {notice && <p role="status">{notice}</p>}
    {error && <div className="alert" role="alert">Chưa lưu được tiến trình: {error} <button className="button secondary" onClick={() => void retrySave()}>Thử lưu lại</button><p>Trò chơi đang dừng để giữ nguyên kết quả. Nếu phiên đã thay đổi, hãy mở lại ứng dụng và tiếp tục bản đã lưu.</p></div>}
    {state.paused && !terminal && <div className="knight-paused panel"><h2>Hành trình đang tạm dừng</h2><p>Tiến trình và thời gian câu hỏi được giữ nguyên.</p><button className="button primary" onClick={() => { enableAudio(); void dispatch({ type: 'resume' }) }}>Tiếp tục</button></div>}
    {!state.paused && !error && state.phase === 'question' && ready && <QuestionCard key={`${state.id}-${state.index}`} question={encounter.question} turn={state.index + 1}
      turnLabel={encounter.kind === 'chest' ? 'Rương thưởng · Không tính đợt tấn công' : encounter.kind === 'boss' ? `Boss · Giáp ${state.answers.filter(a => a.kind === 'boss').length + 1}/${state.config.bossQuestions}` : `Đợt tấn công ${state.wavesDone + 1}/${state.config.waves}`}
      gradeOnSelection onConfirm={answer} actions={!canGradeQuestion(encounter.question) ? <>
        {state.config.pauseGrading && !state.grading && <button className="button secondary" onClick={() => void dispatch({ type: 'grade' })}>Dừng giờ để chấm</button>}
        <button className="button secondary" onClick={() => answer(false)}>Giáo viên: Sai</button><button className="button primary" onClick={() => answer(true)}>Giáo viên: Đúng</button>
      </> : <span>Chọn đáp án để giúp hiệp sĩ chiến đấu.</span>}/>}
    {terminal && <KnightResults state={state} back={back} replay={replay}/>}
  </div>
}
