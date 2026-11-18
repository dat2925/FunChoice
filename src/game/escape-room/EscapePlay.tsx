import { ArrowLeft, BookOpen, Check, Clock3, DoorOpen, KeyRound, Lightbulb, Maximize, Pause, RotateCcw, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { optionLetters, type Question } from '../../api'
import ProductBrand from '../../ProductBrand'
import QuestionImages from '../../QuestionImages'
import { errorText } from '../../Modal'
import roomArt from '../../assets/escape-classroom.png'
import { createRoomAudio } from './audio'
import { chapter, clockClue, escapeApi, formatTime, hints, isActive, sessionItems, sessionStations, sessionObjects, orderClue, objects, roomHeight, roomWidth,
  type EscapeAction, type EscapeChange, type EscapeSession, type Feedback, type Item, type Station, type RoomObject } from './model'

const RoomScene = lazy(() => import('./RoomScene'))
const clueItems: Item[] = ['paper4', 'paper7', 'paper2']
const feedbackText: Record<Feedback, string> = {
  correct: 'Chính xác! Manh mối đã được thêm vào túi đồ.', incorrect: 'Chưa chính xác. Hãy thảo luận và thử lại.',
  wrongTime: 'Kim đồng hồ chưa đúng vị trí.', missingClues: 'Hãy giải đủ câu hỏi và thu thập các mảnh giấy trước khi mở két.',
  wrongCode: 'Mật mã chưa đúng. Kiểm tra lại thứ tự các mảnh giấy.', needKey: 'Cửa đang khóa. Hãy tìm chìa khóa.',
  hint: 'Đã lưu gợi ý vào sổ tay.', expired: 'Đã hết thời gian giải đố.',
}

function Challenge({ question, busy, submit }: { question: Question; busy: boolean; submit: (selected: number[], manual?: boolean) => void }) {
  const [selected, setSelected] = useState<number[]>([])
  const [showAnswer, setShowAnswer] = useState(false)
  const auto = !!question.options?.length && !!question.correctOptions?.length
  const multiple = (question.correctOptions?.length ?? 0) > 1
  const answer = showAnswer && question.answer
  return <div className="escape-question">
    <div className="question-card-body question-content">
      <h3>{question.text}</h3>
      <QuestionImages imageIds={question.imageIds} presentation/>
      {(!!question.options?.length || answer) && <div className="question-responses">
        {multiple && <p className="muted">Có thể chọn nhiều phương án.</p>}
        {!!question.options?.length && <div className="question-options" role="group" aria-label="Các phương án">
          {question.options.map((option, index) => <button type="button" key={index} className={'question-option ' + (showAnswer && question.correctOptions?.includes(index) ? 'correct' : '')}
            aria-pressed={selected.includes(index)} disabled={busy} onClick={() => setSelected((current) => current.includes(index) ? current.filter((value) => value !== index) : multiple ? [...current, index] : [index])}>
            <span className="question-option-letter">{optionLetters[index]}</span><span className="question-option-text">{option}</span>
          </button>)}
        </div>}
        {answer && <div className="question-answer"><strong>Đáp án</strong><p>{answer}</p></div>}
      </div>}
    </div>
    <div className="question-card-actions">
      {(question.answer || auto) && <button type="button" className="button secondary" aria-expanded={showAnswer} onClick={() => setShowAnswer(!showAnswer)}>{showAnswer ? 'Ẩn đáp án' : 'Hiện đáp án'}</button>}
      {auto ? <button type="button" className="button primary" disabled={busy || !selected.length} onClick={() => submit(selected)}>Xác nhận</button> : <>
        <button type="button" className="button secondary" disabled={busy} onClick={() => submit(selected, false)}>Chưa chính xác</button>
        <button type="button" className="button primary" disabled={busy} onClick={() => submit(selected, true)}>Chính xác</button>
      </>}
    </div>
  </div>
}

function ClockPuzzle({ busy, submit }: { busy: boolean; submit: (hour: number, minute: number) => void }) {
  const [hour, setHour] = useState(12)
  const [minute, setMinute] = useState(0)
  return <form className="escape-challenge" onSubmit={(event) => { event.preventDefault(); submit(hour, minute) }}>
    <p>{clockClue}</p>
    <svg viewBox="0 0 120 120" className="escape-clock" role="img" aria-label={`Đồng hồ chỉ ${hour} giờ ${minute} phút`}>
      <circle cx="60" cy="60" r="55" fill="#fff4d5" stroke="#a87338" strokeWidth="5"/>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * Math.PI / 6
        return <text key={index} x={60 + Math.sin(angle) * 42} y={60 - Math.cos(angle) * 42} dominantBaseline="central" textAnchor="middle" fill="#543624" fontSize="10">{index || 12}</text>
      })}
      <line x1="60" y1="63" x2="60" y2="32" stroke="#513421" strokeWidth="5" strokeLinecap="round" transform={`rotate(${hour * 30 + minute / 2} 60 60)`}/>
      <line x1="60" y1="65" x2="60" y2="22" stroke="#966137" strokeWidth="3" strokeLinecap="round" transform={`rotate(${minute * 6} 60 60)`}/>
      <circle cx="60" cy="60" r="4" fill="#ad6329"/>
    </svg>
    <div className="form-grid"><label>Giờ<select aria-label="Giờ" value={hour} onChange={(event) => setHour(Number(event.target.value))}>
      {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label>
      <label>Phút<select aria-label="Phút" value={minute} onChange={(event) => setMinute(Number(event.target.value))}>
        {Array.from({ length: 12 }, (_, index) => <option key={index} value={index * 5}>{String(index * 5).padStart(2, '0')}</option>)}</select></label></div>
    <button type="submit" className="button primary" disabled={busy}>Xác nhận giờ</button>
  </form>
}

function Keypad({ length, busy, error, attempt, tap, submit }: { length: number; busy: boolean; error: boolean; attempt: number; tap: () => void; submit: (code: string) => void }) {
  const [code, setCode] = useState('')
  return <form className="escape-challenge" onSubmit={(event) => { event.preventDefault(); if (code.length === length) submit(code) }}>
    <label>Mật mã két<input className={'escape-code ' + (error ? 'escape-shake' : '')} key={attempt} value={code} inputMode="numeric" pattern={`[0-9]{${length}}`} maxLength={length}
      onChange={(event) => { tap(); setCode(event.target.value.replace(/\D/g, '').slice(0, length)) }}/></label>
    <div className="escape-keypad">{'123456789'.split('').map((digit) => <button key={digit} type="button" onClick={() => { tap(); setCode((value) => (value + digit).slice(0, length)) }}>{digit}</button>)}
      <button type="button" aria-label="Xóa số cuối" onClick={() => { tap(); setCode((value) => value.slice(0, -1)) }}>⌫</button>
      <button type="button" onClick={() => { tap(); setCode((value) => (value + '0').slice(0, length)) }}>0</button>
      <button type="button" onClick={() => setCode('')}>Xóa</button>
    </div>
    <button type="submit" className="button primary" disabled={busy || code.length !== length}>Mở két</button>
  </form>
}

function ResultScreen({ session, back, replay, busy, error }: { session: EscapeSession; back: () => void; replay: () => void; busy: boolean; error: string }) {
  const won = session.status === 'completed'
  const rating = won ? session.wrong === 0 && session.hintsUsed < 2 ? 'Nhà giải mã xuất sắc' : 'Cả lớp đã giải mã thành công' : 'Chưa mở được cửa thoát hiểm'
  return <div className="escape-result" style={{ backgroundImage: `linear-gradient(#211411b0,#211411df),url(${roomArt})` }}>
    <div className="panel escape-result-panel"><DoorOpen size={42}/><p>{chapter}</p>
      <h1>{won ? 'Chúc mừng! Bạn đã thoát khỏi căn phòng bí ẩn!' : session.status === 'failed' ? 'Đã hết giờ!' : 'Phiên chơi đã dừng'}</h1>
      <p><strong>{rating}</strong></p>
      <dl><div><dt>Thời gian</dt><dd>{formatTime(session.elapsedMs)}</dd></div><div><dt>Trả lời đúng</dt><dd>{session.correct}</dd></div>
        <div><dt>Trả lời sai</dt><dd>{session.wrong}</dd></div><div><dt>Gợi ý đã dùng</dt><dd>{session.hintsUsed}</dd></div></dl>
      {error && <p role="alert" className="alert">{error}</p>}
      <div className="toolbar-actions"><button className="button primary" disabled={busy} onClick={replay}><RotateCcw size={17}/> Chơi lại</button>
        <button className="button secondary" onClick={back}><ArrowLeft size={17}/> Trở về danh sách</button></div>
      <ProductBrand/>
    </div>
  </div>
}

export default function EscapePlay({ initial, back, replay }: { initial: EscapeSession; back: () => void; replay: (session: EscapeSession) => void }) {
  const [session, setSession] = useState(initial)
  const items = sessionItems(session)
  const paintingClue = orderClue(session)
  const roomObjects = sessionObjects(session)
  const activeStations = sessionStations(session)
  const activeClues = session.clueValues?.length ? activeStations.map((station) => objects[station].item!) : clueItems
  const current = useRef(initial)
  const checkpoint = useRef(performance.now())
  const queue = useRef(Promise.resolve())
  const mounted = useRef(true)
  const [active, setActive] = useState<RoomObject>()
  const stationIndex = active ? activeStations.indexOf(active as Station) : -1
  const [hover, setHover] = useState<RoomObject>()
  const [item, setItem] = useState<Item>()
  const [notebook, setNotebook] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [sceneFailed, setSceneFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loot, setLoot] = useState<{ item: Item; x: number; y: number; dx: number; dy: number }>()
  const [animating, setAnimating] = useState(false)
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [audio] = useState(() => createRoomAudio(initial.config.sound))
  const fullscreen = useRef(false)
  const [full, setFull] = useState(false)
  const ticking = useRef(false)
  const stage = useRef<HTMLDivElement>(null)
  const inventory = useRef<HTMLDivElement>(null)

  const ready = useCallback(() => setSceneReady(true), [])
  const failed = useCallback(() => setSceneFailed(true), [])
  const dispatch = useCallback((action: EscapeAction) => {
    const request = queue.current.then(async (): Promise<EscapeChange> => {
      const before = current.current
      if (!mounted.current || !isActive(before) || (action.type === 'tick' && before.status !== 'playing')) return { session: before, feedback: null }
      const at = performance.now()
      const elapsed = before.status === 'playing' ? Math.max(0, Math.floor(at - checkpoint.current)) : 0
      const change = await escapeApi.action(before, elapsed, action)
      checkpoint.current = at
      current.current = change.session
      if (mounted.current) {
        if (action.type === 'exit' && change.session.status === 'completed') setAnimating(true)
        if (change.session.status === 'failed') audio.play('timeout')
        setSession(change.session)
      }
      return change
    })
    queue.current = request.then(() => undefined, () => undefined)
    return request
  }, [audio])

  useEffect(() => {
    mounted.current = true
    const timer = window.setInterval(() => {
      if (current.current.status !== 'playing' || busyRef.current || ticking.current) return
      ticking.current = true
      void dispatch({ type: 'tick' }).catch((cause) => { if (mounted.current) setError(errorText(cause)) })
        .finally(() => { ticking.current = false })
    }, 1000)
    return () => { mounted.current = false; window.clearInterval(timer); audio.close(); if (fullscreen.current) void getCurrentWindow().setFullscreen(false).catch(() => undefined) }
  }, [audio, dispatch])

  useEffect(() => {
    if (!animating) return
    const timer = window.setTimeout(() => setAnimating(false), 1100)
    return () => window.clearTimeout(timer)
  }, [animating])

  async function submit(action: EscapeAction) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setFeedback(null)
    try {
      const before = current.current
      const result = await dispatch(action)
      if (!mounted.current) return
      setFeedback(result.feedback)
      setAttempt((value) => value + 1)
      const acquired = result.session.inventory.find((entry) => !before.inventory.includes(entry))
      if (acquired && acquired !== 'paintingNote') {
        const origin = stage.current?.getBoundingClientRect()
        const destination = inventory.current?.getBoundingClientRect()
        if (origin && destination && active) {
          const [left, top, width, height] = objects[active].bounds
          const x = origin.width * (left + width / 2) / roomWidth
          const y = origin.height * (top + height / 2) / roomHeight
          setLoot({ item: acquired, x, y, dx: destination.x + 52 - origin.x - x, dy: destination.y + 16 - origin.y - y })
        }
        if (acquired === 'paper4') audio.play('drawer')
        else if (acquired === 'key') audio.play('lock')
        else audio.play('item')
      } else if (result.session.status === 'completed' && before.status !== 'completed') audio.play('win')
      else if (result.feedback === 'incorrect' || result.feedback === 'wrongCode' || result.feedback === 'wrongTime') audio.play('wrong')
      if (action.type === 'hint' && result.feedback === 'hint') { closeDetail(); setNotebook(true) }
      if (action.type === 'resume') setConfirmAbandon(false)
    } catch (cause) { if (mounted.current) setError(errorText(cause)) }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }

  function closeDetail() { setActive(undefined); setItem(undefined); setNotebook(false); setFeedback(null); setBookOpen(false) }

  async function toggleFullscreen() {
    try {
      const window = getCurrentWindow()
      const enabled = !await window.isFullscreen()
      await window.setFullscreen(enabled)
      fullscreen.current = enabled
      setFull(enabled)
    } catch (cause) { setError(errorText(cause)) }
  }

  async function restart() {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try { replay(await escapeApi.restart(session.id)) }
    catch (cause) { setError(errorText(cause)) }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }

  if (!isActive(session) && !animating) return <ResultScreen session={session} back={back} replay={() => void restart()} busy={busy} error={error}/>
  const paused = session.status === 'paused'
  const clues = activeClues.filter((entry) => session.inventory.includes(entry)).length
  const solved = roomObjects.filter((target) => { const reward = objects[target].item; return reward && session.inventory.includes(reward) }).length
  const reward = active ? objects[active].item : undefined
  const acquired = reward && session.inventory.includes(reward)
  const detail = !paused && !animating && (active || item || notebook)
  const questionDetail = !acquired && (stationIndex >= 0 && (active !== 'book' || bookOpen))

  return <div className="escape-play">
    <header className="escape-head">
      <div><p>{chapter}</p><h1>{session.config.name}</h1><p>{session.classroomName} · Tiến độ {solved + Number(animating)}/{roomObjects.length} · {clues}/{activeClues.length} mảnh mật mã</p></div>
      <div className="toolbar-actions"><span className={'escape-time ' + (session.remainingMs !== null && session.remainingMs <= 30_000 ? 'urgent' : '')} aria-label="Thời gian còn lại"><Clock3 size={18}/>{session.remainingMs === null ? 'Không giới hạn' : formatTime(session.remainingMs)}</span>
        <button className="button play-button" disabled={busy || animating} onClick={() => void submit({ type: paused ? 'resume' : 'pause' })}><Pause size={17}/>{paused ? 'Tiếp tục' : 'Tạm dừng'}</button>
        <button className="button play-button" aria-pressed={full} onClick={() => void toggleFullscreen()}><Maximize size={17}/> {full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}</button></div>
    </header>
    <main className={'escape-main' + (detail && !questionDetail ? ' has-detail' : '')}>
      <div className="escape-preview">
        <div className="escape-stage" ref={stage} style={{ backgroundImage: `url(${roomArt})` }}>
          <Suspense fallback={<p className="escape-loading" role="status">Đang mở căn phòng…</p>}>
            <RoomScene inventory={session.inventory} focus={paused ? undefined : active} hover={hover} escaped={animating} ready={ready} failed={failed}/>
          </Suspense>
          {!sceneReady && !sceneFailed && <p className="escape-loading" role="status">Đang dựng căn phòng…</p>}
          {!paused && !animating && !detail && (sceneReady || sceneFailed) && roomObjects.map((target) => {
            const { bounds: [x, y, width, height], label, item: part } = objects[target]
            const found = part && session.inventory.includes(part)
            return <button key={target} type="button" className={'escape-object ' + (found ? 'found' : '')}
              style={{ left: `${100 * x / roomWidth}%`, top: `${100 * y / roomHeight}%`, width: `${100 * width / roomWidth}%`, height: `${100 * height / roomHeight}%` }}
              onMouseEnter={() => setHover(target)} onMouseLeave={() => setHover(undefined)} onFocus={() => setHover(target)} onBlur={() => setHover(undefined)}
              onClick={() => { audio.play('inspect'); closeDetail(); setHover(undefined); setActive(target) }}><span>{found && <Check size={14} aria-hidden="true"/>}{label}</span></button>
          })}
          {loot && <div className="escape-loot" aria-hidden="true" key={loot.item} onAnimationEnd={() => setLoot(undefined)}
            style={{ left: loot.x, top: loot.y, '--loot-x': `${loot.dx}px`, '--loot-y': `${loot.dy}px` } as CSSProperties}>
            {loot.item === 'key' ? <KeyRound size={25}/> : <BookOpen size={25}/>} {items[loot.item].label}</div>}
          {animating && <KeyRound className="escape-door-key" size={35} aria-hidden="true"/>}
        </div>
      </div>
      {detail && <section className={'escape-detail' + (questionDetail ? ' escape-question-detail' : '')} aria-label="Chi tiết khám phá">
        <div className="escape-detail-head"><h2>{active ? objects[active].label : item ? items[item].label : 'Sổ tay'}</h2>
          <button className="icon-button" aria-label="Đóng chi tiết" onClick={closeDetail}><X size={19}/></button></div>
        {active === 'painting' ? <><p>{paintingClue}</p><button className="button primary" disabled={busy || !!acquired} onClick={() => void submit({ type: 'painting' })}>{acquired ? 'Đã lưu trong sổ tay' : 'Lưu ghi chú'}</button></>
          : acquired ? <p>{items[reward].description}</p>
          : questionDetail ? <Challenge key={active} question={session.questions[stationIndex]} busy={busy}
            submit={(selected, manual) => void submit({ type: 'answer', station: active as Station, selected, manual })}/>
          : active === 'book' ? <><p>Một cuốn sách phát sáng trên giá.</p><button className="button primary" onClick={() => { audio.play('book'); setBookOpen(true) }}><BookOpen size={17}/> Mở cuốn sách phát sáng</button></>
          : active === 'clock' && !session.clueValues?.length ? <ClockPuzzle busy={busy} submit={(hour, minute) => void submit({ type: 'clock', hour, minute })}/>
          : active === 'safe' ? clues < activeClues.length ? <p>Hãy giải đủ câu hỏi và thu thập các mảnh giấy trước khi mở két.</p> : <Keypad length={activeClues.length} busy={busy} error={feedback === 'wrongCode'} attempt={attempt} tap={() => audio.play('keypad')} submit={(code) => void submit({ type: 'safe', code })}/>
          : active === 'door' ? session.inventory.includes('key') ? <button className="button primary" disabled={busy} onClick={() => { audio.play('lock'); void submit({ type: 'exit' }) }}><KeyRound size={17}/> Dùng chìa khóa</button> : <p>Cửa đang khóa. Hãy tìm chìa khóa.</p>
          : item ? <p>{items[item].description}</p>
          : <div className="escape-notes">{!session.hintsUsed && !session.inventory.includes('paintingNote') && <p className="muted">Chưa có ghi chú.</p>}
            {session.inventory.includes('paintingNote') && <p>{paintingClue}</p>}{hints.slice(0, session.hintsUsed).map((hint) => <p key={hint}>{hint}</p>)}</div>}
        {feedback && <p role="status" className={feedback === 'correct' ? 'escape-good' : 'escape-feedback'}>{feedbackText[feedback]}</p>}
      </section>}
      {paused && <section className="escape-pause panel" aria-label="Phiên chơi tạm dừng">
        <Pause size={27}/><h2>{confirmAbandon ? 'Bỏ phiên chơi này?' : 'Đã tạm dừng'}</h2>
        <p>{confirmAbandon ? 'Phiên sẽ được đánh dấu đã bỏ trong lịch sử và không thể chơi tiếp.' : 'Đồng hồ đã dừng. Tiến trình hiện tại đã được lưu.'}</p>
        <div className="toolbar-actions">{confirmAbandon ? <>
          <button className="button danger" disabled={busy} onClick={() => void submit({ type: 'abandon' })}>Xác nhận bỏ phiên</button>
          <button className="button secondary" onClick={() => setConfirmAbandon(false)}>Giữ phiên</button></> : <>
          <button className="button primary" disabled={busy} onClick={() => void submit({ type: 'resume' })}>Tiếp tục khám phá</button>
          <button className="button secondary" onClick={back}>Lưu và quay lại</button>
          <button className="text-button" onClick={() => setConfirmAbandon(true)}>Bỏ phiên</button></>}
        </div>
      </section>}
    </main>
    {error && <div className="escape-error alert" role="alert">{error}<button className="text-button" onClick={() => setError('')}>Đóng</button></div>}
    <footer className="escape-foot">
      <div className="escape-inventory" ref={inventory} aria-label="Túi đồ"><strong>Túi đồ</strong>{!session.inventory.length && <span>Chưa có vật phẩm</span>}
        {session.inventory.map((entry) => <button key={entry} className="button play-button" disabled={paused || animating} onClick={() => { closeDetail(); setItem(entry) }}>
          {entry === 'key' ? <KeyRound size={15}/> : <BookOpen size={15}/>} {items[entry].label}</button>)}</div>
      <div className="toolbar-actions"><button className="button play-button" disabled={paused || animating} onClick={() => { closeDetail(); setNotebook(true) }}><BookOpen size={16}/> Sổ tay</button>
        {session.config.hints && <button className="button play-button" disabled={paused || animating || busy || session.hintsUsed >= hints.length} onClick={() => void submit({ type: 'hint' })}><Lightbulb size={16}/> Gợi ý</button>}
        <button className="button play-button" disabled={busy || animating} onClick={() => paused ? back() : void submit({ type: 'pause' })}><ArrowLeft size={17}/> Quay lại</button></div>
    </footer>
  </div>
}
