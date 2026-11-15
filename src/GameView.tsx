import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, Download, Maximize, Play, Sparkles, Trophy, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { api, modes, type Session, type Student } from './api'
import { errorText } from './Modal'
import ProductBrand from './ProductBrand'
import QuestionCard from './QuestionCard'
import { exportCsv } from './roster'
import type { Phase } from './game/round'

const GameCanvas = lazy(() => import('./game/GameCanvas'))
const messages: Record<Phase, string> = {
  READY: 'Sẵn sàng', COUNTDOWN: 'Chuẩn bị chạy!', RUNNING: 'Cả lớp đang chạy!',
  METEOR_WARNING: 'Coi chừng thiên thạch!', METEOR_FALLING: 'Thiên thạch đang rơi · Chuyển động chậm',
  MISS: 'Rơi hụt! Chưa trúng ai',
  IMPACT: 'Chạm sân!', REVEAL: 'Đã tìm thấy một học sinh', NEXT_TARGET: 'Chuẩn bị lần rơi tiếp theo', FINISHED: 'Hoàn thành',
}

async function setFullscreen(enabled: boolean) {
  if (isTauri()) await getCurrentWindow().setFullscreen(enabled)
  else if (enabled) await document.documentElement.requestFullscreen()
  else if (document.fullscreenElement) await document.exitFullscreen()
}

export async function fullscreen() {
  const enabled = isTauri() ? await getCurrentWindow().isFullscreen() : !!document.fullscreenElement
  await setFullscreen(!enabled)
}

export function Results({ session, back, replay }: { session: Session; back: () => void; replay?: () => void }) {
  const [feedback, setFeedback] = useState('')
  const rows = session.results.filter((pick) => pick.selectedAt)
  return <div className="result-screen">
    <div className="result-top"><button className="text-button" onClick={back}><ArrowLeft size={16}/> Quay lại</button><button className="button secondary" onClick={() => void fullscreen().catch((e) => setFeedback(errorText(e)))}><Maximize size={16}/> Toàn màn hình</button></div>
    <div className="result-card panel">
      <div className="trophy"><Trophy size={36}/></div>
      <h1>{session.cancelled ? 'Lượt chơi đã dừng' : 'Kết quả chọn học sinh'}</h1>
      <p className="muted">{session.schoolName} · {session.classroomName} · {modes[session.selectionMode].label}</p>
      <ol className="result-list">{rows.map((pick) => <li key={pick.selectionOrder}><span>{pick.selectionOrder}</span><strong>{pick.fullName}</strong>{pick.studentCode && <small>{pick.studentCode}</small>}<Sparkles size={18}/></li>)}</ol>
      {!rows.length && <p className="muted">Lượt này chưa công bố học sinh nào.</p>}
      {feedback && <p role="status">{feedback}</p>}
      <div className="result-actions">
        <button className="button secondary" disabled={!rows.length} onClick={() => void navigator.clipboard.writeText(rows.map((p) => p.selectionOrder + '. ' + p.fullName + (p.studentCode ? ' (' + p.studentCode + ')' : '')).join('\n')).then(() => setFeedback('Đã sao chép kết quả.')).catch((e) => setFeedback(errorText(e)))}><Copy size={16}/> Sao chép</button>
        <button className="button secondary" disabled={!rows.length} onClick={() => exportCsv('ket-qua-thien-thach.csv', [['Thứ tự', 'Họ và tên', 'Mã học sinh'], ...rows.map((p) => [p.selectionOrder, p.fullName, p.studentCode ?? ''])])}><Download size={16}/> Xuất CSV</button>
        {replay && <button className="button primary" onClick={replay}><Play size={16}/> Chơi tiếp</button>}
      </div>
    </div>
    <ProductBrand className="result-brand" />
  </div>
}

export default function GameView({ initial, students, audio, mp3, paused, finish, requestExit, recover }: {
  initial: Session; students: Student[]; audio?: AudioContext; mp3?: AudioBuffer; paused: boolean
  finish: (result: Session) => void; requestExit: () => void; recover: () => void
}) {
  const latest = useRef(initial)
  const [progress, setProgress] = useState(initial.results.filter((r) => r.selectedAt))
  const [phase, setPhase] = useState<Phase>('READY')
  const [currentOrder, setCurrentOrder] = useState(0)
  const [questionTurn, setQuestionTurn] = useState<{ order: number; studentId: string; advance: () => void }>()
  const [countdown, setCountdown] = useState<number>()
  const [error, setError] = useState('')
  const finishRef = useRef(finish)
  finishRef.current = finish
  const events = useMemo(() => ({
    phase(next: Phase, tick?: number) { setPhase(next); setCountdown(tick); if (next !== 'REVEAL') setCurrentOrder(0) },
    async draw(order: number) { return (await api.draw(initial.id, order)).studentId },
    async reveal(order: number) {
      latest.current = await api.reveal(initial.id, order)
      setCurrentOrder(order)
      setProgress(latest.current.results.filter((row) => row.selectedAt))
    },
    question(order: number, studentId: string, advance: () => void) {
      setQuestionTurn({ order, studentId, advance })
    },
    done() { finishRef.current(latest.current) },
    failure(cause: unknown) { setError(errorText(cause)) },
  }), [initial.id])
  const [presenting, setPresenting] = useState(false)
  const presentingRef = useRef(false)
  const fullscreenBusy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (presentingRef.current) void setFullscreen(false).catch(() => undefined)
    }
  }, [])
  async function presentation(enabled: boolean) {
    if (fullscreenBusy.current || enabled === presentingRef.current) return
    fullscreenBusy.current = true
    try {
      await setFullscreen(enabled)
      if (!mounted.current) {
        if (enabled) await setFullscreen(false)
        return
      }
      presentingRef.current = enabled
      setPresenting(enabled)
    } catch (cause) { if (mounted.current) setError(errorText(cause)) }
    finally { fullscreenBusy.current = false }
  }
  useEffect(() => {
    if (!presenting) return
    const exit = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void presentation(false)
    }
    const sync = () => {
      if (!isTauri() && !document.fullscreenElement) {
        presentingRef.current = false
        setPresenting(false)
      }
    }
    window.addEventListener('keydown', exit)
    document.addEventListener('fullscreenchange', sync)
    return () => {
      window.removeEventListener('keydown', exit)
      document.removeEventListener('fullscreenchange', sync)
    }
  }, [presenting])
  useEffect(() => {
    if (!audio || !mp3) return
    const source = audio.createBufferSource()
    const gain = audio.createGain()
    source.buffer = mp3
    source.loop = true
    gain.gain.value = 0.88
    source.connect(gain).connect(audio.destination)
    source.start()
    return () => { source.stop(); source.disconnect(); gain.disconnect() }
  }, [audio, mp3])
  useEffect(() => {
    if (!audio || audio.state === 'closed') return
    void (paused ? audio.suspend() : audio.resume()).catch(() => undefined)
  }, [audio, paused])
  const latestPick = progress.at(-1)
  const question = questionTurn && initial.settings.questions[questionTurn.order - 1]
  return <main className={presenting ? "play-screen presenting" : "play-screen"}>
    <header className="play-header">
      <div className="play-title"><strong>{initial.schoolName}</strong><small>{initial.classroomName}</small></div>
      <div className="game-progress"><span>Đã chọn <strong>{progress.length}/{initial.targetCount}</strong></span><progress max={initial.targetCount} value={progress.length} aria-label="Tiến độ chọn học sinh"/></div>
      <button className="button play-button" onClick={() => void presentation(true)}><Maximize size={17}/> Toàn màn hình</button>
      <button className="button play-button" onClick={requestExit}><X size={17}/> Thoát lượt</button>
    </header>
    <div className="game-stage" data-phase={phase}>
      <Suspense fallback={<div className="game-loading">Đang mở sân trường…</div>}><GameCanvas session={initial} students={students} events={events} audio={audio} paused={paused}/></Suspense>
      <div className={'phase-chip ' + (phase === 'METEOR_WARNING' || phase === 'METEOR_FALLING' ? 'hot' : '')}><Sparkles size={15}/>{messages[phase]}</div>
      {phase === 'COUNTDOWN' && countdown && <div className="countdown" key={countdown}>{countdown}</div>}
      {phase === 'REVEAL' && !initial.settings.withQuestions && latestPick?.selectionOrder === currentOrder && latestPick && <div className="reveal-card" key={latestPick.selectionOrder}><Sparkles size={22}/><div><small>LẦN RƠI {latestPick.selectionOrder}</small><strong>{latestPick.fullName}{latestPick.studentCode && <span> · {latestPick.studentCode}</span>}</strong></div></div>}
      {questionTurn && question && <QuestionCard key={questionTurn.order} className="meteor-question" question={question}
        turn={questionTurn.order} person={students.find((student) => student.id === questionTurn.studentId)?.fullName}
        actions={<button className="button primary" onClick={() => { questionTurn.advance(); setQuestionTurn(undefined) }}>
          {questionTurn.order === initial.targetCount && !question.options?.length ? 'Xem kết quả' : 'Tiếp tục'}<ArrowRight size={17} aria-hidden="true"/>
        </button>}
      />}
      {presenting && <button className="button exit-presentation" onClick={() => void presentation(false)} aria-label="Thoát toàn màn hình"><X size={16}/> Esc</button>}
      {error && <div className="game-error" role="alert"><strong>{error}</strong><button className="button primary" onClick={recover}>Tải lại tiến độ</button></div>}
    </div>
    <footer className="play-footer">
      <div className="play-picks" aria-live="polite">
      {progress.length ? progress.slice(-6).map((p) => <span key={p.selectionOrder}><Check size={15}/>{p.fullName}</span>) : <span>Học sinh được công bố sau từng lần thiên thạch rơi.</span>}
      </div>
      <ProductBrand className="game-brand" />
    </footer>
  </main>
}

