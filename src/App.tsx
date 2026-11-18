import { ArrowLeft, ArrowRight, CalendarClock, CircleHelp, Database, DoorOpen, Download, FileUp, FolderOpen, History, Pencil, Play, Plus, School as SchoolIcon, Search, ShieldCheck, Sparkles, Trash2, Users, X } from 'lucide-react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type LicenseInfo, genderLabels, modes, schoolThemes, type SchoolTheme, type Gender, type Classroom, type School, type Session, type Student, type Question } from './api'
import { restoreMusic, useDesk } from './store'
import { Empty, Hero, Shell } from './Layout'
import Modal, { errorText, type DialogSpec } from './Modal'
import Setup from './Setup'
import QuestionSetup from './QuestionSetup'
import ExamManager from './ExamManager'
import GamePresets from './GamePresets'
import { presetApi, type GamePreset } from './presetApi'
import Relay from './Relay'
import { relayTeams, type RelayConfig } from './RelaySettings'
import ProPurchase, { proPurchaseAvailable } from './ProPurchase'
import SchoolThemePicker from './SchoolThemePicker'
import UpdatePanel from './UpdatePanel'
import GameView, { Results } from './GameView'
import { asImage, parts } from './game/characters'
import { exportCsv, normalized, readRoster } from './roster'
import EscapeSetup from './game/escape-room/EscapeSetup'
import EscapePlay from './game/escape-room/EscapePlay'
import EscapeHistory from './game/escape-room/EscapeHistory'
import type { EscapeSession } from './game/escape-room/model'
import escapeArt from './assets/escape-classroom.png'
import './game/escape-room/escape.css'
import KnightSetup, { KnightArt } from './game/knight-rescue/KnightSetup'
import KnightPlay from './game/knight-rescue/KnightPlay'
import KnightHistory from './game/knight-rescue/KnightHistory'
import type { GameState as KnightState } from './game/knight-rescue/GameState'

const licenseDate = (expiry: number) => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date((expiry - 1) * 1000))
const stamp = (time: string) => new Date(time).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
const fileOptions = [{ name: 'SoloTech SQLite', extensions: ['sqlite'] }]

function SearchField({ search, setSearch, label }: { search: string; setSearch: (value: string) => void; label: string }) {
  return <div className="search"><Search size={18}/><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={label} aria-label={label}/></div>
}

export default function App() {
  const desk = useDesk()
  const { page, school, classroom, go, enterSchool, enterClassroom, settings, configure } = desk
  const [schools, setSchools] = useState<School[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [history, setHistory] = useState<Session[]>([])
  const [license, setLicense] = useState<LicenseInfo | null>(null)
  const [purchaseAvailable, setPurchaseAvailable] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [pending, setPending] = useState<Session | null>(null)
  const [game, setGame] = useState<{ initial: Session; students: Student[]; audio?: AudioContext; mp3?: AudioBuffer } | null>(null)
  const [result, setResult] = useState<Session | null>(null)
  const [escape, setEscape] = useState<EscapeSession>()
  const [knight, setKnight] = useState<KnightState>()
  const [preparedRelay, setPreparedRelay] = useState<{ classroom: Classroom; config: RelayConfig; questions: Question[]; students: Student[] }>()
  const [dialog, setDialog] = useState<DialogSpec | null>(null)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [updateSlot, setUpdateSlot] = useState<HTMLDivElement | null>(null)
  const [relayActive, setRelayActive] = useState(false)
  const lock = useRef(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void restoreMusic().catch(() => undefined)
    void proPurchaseAvailable().then(setPurchaseAvailable).catch(() => undefined)
    const refreshLicense = () => void api.license().then(setLicense).catch((cause) => setError(errorText(cause)))
    refreshLicense()
    const timer = window.setInterval(refreshLicense, 30_000)
    window.addEventListener('focus', refreshLicense)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshLicense) }
  }, [])

  useEffect(() => {
    let current = true
    const apply = async () => {
      try {
        if (page === 'schools') {
          const [list, unfinished] = await Promise.all([api.schools(), api.pending()])
          if (current) { setSchools(list); setPending(unfinished); setReady(true) }
        } else if (page === 'classrooms' && school) {
          const list = await api.classrooms(school.id)
          if (current) setClassrooms(list)
        } else if (['students', 'games', 'presets', 'setup', 'relay'].includes(page) && classroom) {
          const list = await api.students(classroom.id)
          if (current) setStudents(list)
        } else if (page === 'history') {
          const list = await api.history()
          if (current) setHistory(list)
        }
      } catch (cause) { if (current) setError(errorText(cause)) }
    }
    void apply()
    return () => { current = false }
  }, [page, school, classroom, refresh])

  async function proDialog() {
    try {
      const status = await api.license()
      setLicense(status)
      const expired = status.expiresAt !== null
      setDialog({
        title: 'FunChoice Pro',
        description: status.pro ? 'Nhập key có thời hạn dài hơn hoặc key vĩnh viễn cho máy này.' : (status.needsMachineKey ? 'Key dùng chung đã ngừng hỗ trợ. Gửi mã máy bên dưới cho SoloTech để nhận key riêng. ' : expired ? 'Key đã hết hạn. ' : '') + 'Bản miễn phí có tối đa ' + status.freeClasses + ' lớp, ' + status.freeStudents + ' học sinh mỗi lớp, 1 học sinh mỗi lượt và nhạc nền mặc định.',
        submit: 'Kích hoạt Pro',
        body: <>
          <label>Mã máy<input value={status.machineCode ?? 'Không đọc được mã máy'} readOnly onFocus={(e) => e.currentTarget.select()}/></label>
          {status.machineCode && <button type="button" className="button secondary" onClick={async (event) => {
            const button = event.currentTarget
            try {
              await navigator.clipboard.writeText(status.machineCode!)
              button.textContent = 'Đã sao chép mã máy'
            } catch { button.textContent = 'Hãy chọn và sao chép mã máy' }
          }}>Sao chép mã máy</button>}
          <label>Key Pro<input name="key" required maxLength={160} placeholder="FC-PRO1.…" autoComplete="off" spellCheck={false}/></label>
          <div className="hint pro-contact">
            <strong>Liên hệ SoloTech để nhận key Pro</strong>
            <p>Zalo <span>0944228546</span></p>
            <p>Email <span>solotechvn.official@gmail.com</span></p>
          </div>
        </>,
        onSave: async (form) => {
          setLicense(await api.activate(String(form.get('key') ?? '')))
          updated('Đã kích hoạt FunChoice Pro.')
        },
      })
    } catch (cause) { setError(errorText(cause)) }
  }

  function navigate(next: typeof page) {
    setSearch('')
    setError('')
    if (next === 'schools') setReady(false)
    go(next)
    setRefresh((n) => n + 1)
  }
  function chooseSchool(value: School) {
    setClassrooms([])
    setSearch('')
    enterSchool(value)
  }
  function chooseClassroom(value: Classroom) {
    setStudents([])
    setSearch('')
    enterClassroom(value)
  }
  function updated(message: string) {
    setNotice(message)
    setRefresh((n) => n + 1)
  }
  function nameDialog(kind: 'school' | 'classroom', item?: School | Classroom) {
    const label = kind === 'school' ? 'trường' : 'lớp'
    setDialog({
      title: item ? (kind === 'school' ? 'Sửa thông tin trường' : 'Đổi tên lớp') : 'Thêm ' + label + ' mới',
      submit: item ? 'Lưu thay đổi' : 'Thêm ' + label,
      body: <>
        <label>Tên {label}<input name="name" defaultValue={item?.name} autoFocus required maxLength={kind === 'school' ? 120 : 80} placeholder={kind === 'school' ? 'VD: Trường Tiểu học Hoa Sen' : 'VD: Lớp 5A'}/></label>
        {kind === 'school' && <SchoolThemePicker initial={item && 'theme' in item ? item.theme : 'rural'}/>}
      </>,
      onSave: async (form) => {
        const name = String(form.get('name'))
        if (kind === 'school') await api.saveSchool(name, form.get('theme') as SchoolTheme, item?.id)
        else if (school) await api.saveClassroom(school.id, name, item?.id)
        updated(item ? 'Đã lưu thay đổi.' : 'Đã thêm ' + label + '.')
      },
    })
  }
  function deleteDialog(kind: 'school' | 'classroom' | 'student', id: string, name: string) {
    const more = kind === 'school' ? ' Toàn bộ lớp và học sinh thuộc trường sẽ bị xóa khỏi danh sách.' :
      kind === 'classroom' ? ' Toàn bộ học sinh thuộc lớp sẽ bị xóa khỏi danh sách.' : ''
    setDialog({
      title: 'Xóa ' + name + '?', description: 'Mục này sẽ bị xóa khỏi danh sách.' + more + ' Kết quả đã công bố vẫn còn trong lịch sử.',
      danger: true, submit: 'Xác nhận xóa',
      onSave: async () => { await api.archive(kind, id); updated('Đã xóa mục đã chọn.') },
    })
  }
  function studentDialog(item?: Student) {
    if (!classroom) return
    setDialog({
      title: item ? 'Sửa thông tin học sinh' : 'Thêm học sinh',
      submit: item ? 'Lưu thay đổi' : 'Thêm học sinh',
      body: <>
        <label>Họ và tên<input name="name" defaultValue={item?.fullName} required maxLength={120} autoFocus placeholder="VD: Nguyễn Minh Anh"/></label>
        <label>Mã học sinh <small>Không bắt buộc</small><input name="code" defaultValue={item?.studentCode ?? ''} maxLength={48}/></label>
        <label>Giới tính<select name="gender" defaultValue={item?.gender ?? ''}>
          <option value="">Chưa nhập</option>
          <option value="male">Nam</option><option value="female">Nữ</option>
        </select></label>
        <label className="switch-row"><span>Đang hoạt động</span><input name="active" type="checkbox" defaultChecked={item?.isActive ?? true}/></label>
      </>,
      onSave: async (form) => {
        await api.saveStudent(classroom.id, {
          fullName: String(form.get('name')), studentCode: String(form.get('code')) || null,
          isActive: form.has('active'), gender: (form.get('gender') || null) as Gender | null,
        }, item?.id)
        updated(item ? 'Đã cập nhật học sinh.' : 'Đã thêm học sinh.')
      },
    })
  }
  async function importFile(input: HTMLInputElement) {
    const selected = input.files?.[0]
    input.value = ''
    if (!selected || !classroom) return
    setError('')
    try {
      const roster = await readRoster(selected)
      if (useDesk.getState().classroom?.id !== classroom.id || useDesk.getState().page !== 'students') return
      setDialog({
        title: 'Nhập ' + roster.length + ' học sinh', submit: 'Nhập danh sách',
        description: 'Thêm học sinh từ ' + selected.name + ' vào ' + classroom.name + '. Các bản ghi hiện tại được giữ lại.',
        onSave: async () => { const count = await api.importStudents(classroom.id, roster); updated('Đã nhập ' + count + ' học sinh.') },
      })
    } catch (cause) { setError(errorText(cause)) }
  }
  async function play(existing?: Session, preset?: GamePreset) {
    if (lock.current || (!existing && !classroom)) return
    lock.current = true
    setBusy(true)
    setError('')
    let audio: AudioContext | undefined
    const config = existing?.settings ?? (preset?.game.kind === 'meteor' ? preset.game.settings
      : license?.pro ? settings : { ...settings, count: 1, music: 'suspense' as const })
    try {
      if (config.sound && typeof AudioContext !== 'undefined') {
        audio = new AudioContext()
        void audio.resume().catch(() => undefined)
      }
      const classId = existing?.classroomId ?? classroom!.id
      const roster = (await api.students(classId)).filter((student) => student.isActive)
      let mp3: AudioBuffer | undefined
      let resolvedConfig = config
      if (config.music === 'mp3') {
        try {
          if (audio) mp3 = await audio.decodeAudioData(await api.backgroundMusic())
        } catch (cause) {
          if (!existing) throw cause
          resolvedConfig = { ...config, music: 'suspense' }
        }
      }
      const session = existing ? { ...existing, settings: resolvedConfig }
        : preset ? await presetApi.meteor(classId, preset.id) : await api.start(classId, resolvedConfig)
      setResult(null)
      setPending(session)
      setGame({ initial: session, students: roster, audio, mp3 })
    } catch (cause) {
      if (audio) void audio.close()
      if (preset) throw cause
      setError(errorText(cause))
      setRefresh((n) => n + 1)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function playPreset(preset: GamePreset) {
    if (!classroom || lock.current) return
    if (preset.game.kind === 'meteor') { await play(undefined, preset); return }
    lock.current = true
    try {
      if (preset.game.kind === 'escape') {
        setEscape(await presetApi.escape(classroom.id, preset.id))
      } else {
        if (pending) throw new Error('Hãy tiếp tục hoặc kết thúc lượt Thiên thạch đang dở trước khi chơi.')
        const roster = (await api.students(classroom.id)).filter((student) => student.isActive)
        if (roster.length < 2) throw new Error('Tiếp sức cần ít nhất hai học sinh đang hoạt động.')
        const empty = relayTeams(roster, preset.game.settings).find((team) => !team.members.length)
        if (empty) throw new Error(`${empty.name} đang trống. Hãy sửa cấu hình để chia lại thành viên.`)
        if (!preset.questions.length) throw new Error('Tiếp sức cần ít nhất một câu hỏi.')
        setPreparedRelay({ classroom, config: preset.game.settings, questions: preset.questions, students: roster })
      }
    } finally { lock.current = false }
  }
  function closeGame() {
    if (game?.audio) void game.audio.close()
    setGame(null)
  }
  function stopGame(session: Session) {
    setDialog({
      title: 'Kết thúc lượt đang chơi?', description: 'Các kết quả đã công bố được lưu vào lịch sử. Các học sinh còn lại sẽ không được công bố trong lượt này.',
      danger: true, submit: 'Kết thúc lượt',
      onSave: async () => {
        await api.cancel(session.id)
        closeGame()
        setPending(null)
        updated('Đã kết thúc lượt chơi.')
      },
    })
  }
  async function backupFile() {
    setError('')
    try {
      const path = await save({ title: 'Lưu bản sao dữ liệu', defaultPath: 'SoloTech-sao-luu.sqlite', filters: fileOptions })
      if (path) { await api.backup(path); setNotice('Đã lưu tệp sao lưu.') }
    } catch (cause) { setError(errorText(cause)) }
  }
  async function restoreFile() {
    setError('')
    try {
      const path = await open({ title: 'Chọn bản sao dữ liệu', filters: fileOptions })
      if (!path) return
      setDialog({
        title: 'Khôi phục từ tệp sao lưu?', description: 'Dữ liệu trường, lớp, học sinh và lịch sử hiện có sẽ được thay bằng nội dung trong tệp đã chọn.',
        danger: true, submit: 'Khôi phục dữ liệu',
        onSave: async () => {
          await api.restore(path)
          setSchools([]); setClassrooms([]); setStudents([]); setHistory([])
          useDesk.setState({ school: null, classroom: null })
          navigate('schools')
          updated('Đã khôi phục dữ liệu.')
        },
      })
    } catch (cause) { setError(errorText(cause)) }
  }
  const active = students.filter((student) => student.isActive).length
  const q = normalized(search)
  const matches = (value: string) => normalized(value).includes(q)
  const displayedSchools = schools.filter((item) => matches(item.name))
  const displayedClasses = classrooms.filter((item) => matches(item.name))
  const displayedStudents = students.filter((item) => matches(item.fullName + ' ' + (item.studentCode ?? '')))
  const editActions = (kind: 'school' | 'classroom' | 'student', item: { id: string; name: string }, edit: () => void) => <div className="item-actions">
    <button className="icon-button" title="Sửa" aria-label={'Sửa ' + item.name} onClick={edit}><Pencil size={16}/></button>
    <button className="icon-button delete" title="Xóa" aria-label={'Xóa ' + item.name} onClick={() => deleteDialog(kind, item.id, item.name)}><Trash2 size={16}/></button>
  </div>
  let body: ReactNode
  if (knight) {
    body = <KnightPlay key={knight.id} initial={knight} back={() => { setKnight(undefined); navigate(page === 'history' ? 'history' : 'games') }} replay={() => { setKnight(undefined); navigate(classroom ? 'knight' : 'schools') }}/>
  } else if (escape) {
    body = <EscapePlay key={escape.id} initial={escape} back={() => {
      setEscape(undefined)
      if (page !== 'history' && page !== 'presets') navigate('games')
    }} replay={setEscape}/>
  } else if (game) {
    body = <GameView initial={game.initial} students={game.students} audio={game.audio} mp3={game.mp3}
      paused={!!dialog}
      requestExit={() => stopGame(game.initial)}
      recover={() => { closeGame(); navigate('schools') }}
      finish={(session) => { closeGame(); setDialog(null); setPending(null); setResult(session) }}/>
  } else if (result) {
    body = <Results session={result} back={() => {
      setResult(null)
      navigate(page === 'history' || page === 'presets' ? page : classroom ? 'students' : 'schools')
    }} replay={page !== 'history' && classroom ? () => { setResult(null); navigate(page === 'presets' ? 'presets' : 'setup') } : undefined}/>
  } else if (preparedRelay) {
    body = <Relay classroom={preparedRelay.classroom} students={preparedRelay.students} prepared={preparedRelay}
      back={() => setPreparedRelay(undefined)} openQuestions={() => navigate('questions')} onMatchChange={setRelayActive}/>
  } else {
    let section: ReactNode
    switch (page) {
      case 'schools':
        section = <>
          <Hero title={<>FunChoice<span>.</span></>} description="Biến mỗi lượt gọi tên thành một cuộc phiêu lưu thiên thạch ngay trong lớp học."
            button={schools.length ? 'Chọn trường học' : 'Thêm trường đầu tiên'} onAction={() => schools.length ? document.getElementById('school-search')?.querySelector('input')?.focus() : nameDialog('school')}/>
          <div className="page-heading school-heading"><div><h2>Trường học</h2><p>Chọn một trường để xem lớp học và bắt đầu chơi.</p></div><button className="button primary" disabled={!ready || !!pending} onClick={() => nameDialog('school')}><Plus size={19}/> Thêm trường</button></div>
          <div className="toolbar" id="school-search"><SearchField search={search} setSearch={setSearch} label="Tìm kiếm trường học..."/><span>{displayedSchools.length} trường</span></div>
          {!ready ? <p className="muted">Đang tải trường học…</p> : displayedSchools.length ? <div className="card-grid">{displayedSchools.map((item, i) => <article className="school-card panel" key={item.id}>
            <div className="card-top"><span className={'school-icon tone-' + i % 3}><SchoolIcon size={24}/></span>{editActions('school', item, () => nameDialog('school', item))}</div>
            <h3>{item.name}</h3><p><Users size={15}/> {item.count} lớp học · {schoolThemes[item.theme]}</p>
            <button className="card-link" onClick={() => chooseSchool(item)}>Xem lớp học <ArrowRight size={16}/></button>
          </article>)}</div> : <Empty title={q ? 'Không tìm thấy trường học' : 'Chưa có trường học'} message={q ? 'Thử tìm bằng tên trường khác.' : 'Thêm trường để tạo lớp và tổ chức lượt chơi đầu tiên.'} action={!q && !pending ? () => nameDialog('school') : undefined} label="Thêm trường"/>}
        </>
        break
      case 'classrooms':
        section = <div className="subpage">
          <button className="text-button" onClick={() => navigate('schools')}><ArrowLeft size={16}/> Tất cả trường học</button>
          <div className="page-heading"><div><h1>{school?.name}</h1><p>Chọn lớp để quản lý học sinh và chuẩn bị trò chơi.</p></div><button className="button primary" onClick={() => nameDialog('classroom')}><Plus size={19}/> Thêm lớp</button></div>
          <div className="toolbar"><SearchField search={search} setSearch={setSearch} label="Tìm kiếm lớp học..."/><span>{displayedClasses.length} lớp</span></div>
          {displayedClasses.length ? <div className="card-grid">{displayedClasses.map((item, i) => <article className="school-card panel" key={item.id}>
            <div className="card-top"><span className={'school-icon tone-' + i % 3}><Users size={24}/></span>{editActions('classroom', item, () => nameDialog('classroom', item))}</div>
            <h3>{item.name}</h3><p><Users size={15}/> {item.count} học sinh</p>
            <button className="card-link" onClick={() => chooseClassroom(item)}>Xem học sinh <ArrowRight size={16}/></button>
          </article>)}</div> : <Empty title={q ? 'Không tìm thấy lớp' : 'Chưa có lớp học'} message={q ? 'Thử tìm bằng tên lớp khác.' : 'Tạo lớp để thêm danh sách học sinh.'} action={q ? undefined : () => nameDialog('classroom')} label="Thêm lớp"/>}
        </div>
        break
      case 'students':
        section = <div className="subpage">
          <button className="text-button" onClick={() => navigate('classrooms')}><ArrowLeft size={16}/> Danh sách lớp</button>
          <div className="page-heading"><div><h1>{classroom?.name}</h1><p>{school?.name} · {active}/{students.length} học sinh đang hoạt động</p></div><div className="toolbar-actions"><button className="button secondary" onClick={() => navigate('questions')}><CircleHelp size={17}/> Chuẩn bị câu hỏi</button><button className="button secondary" onClick={() => navigate('games')}>Cấu hình trò chơi</button><button className="button primary" onClick={() => navigate('presets')}><Play size={17}/> Cấu hình đã lưu</button></div></div>
          <div className="toolbar wrap"><SearchField search={search} setSearch={setSearch} label="Tìm tên hoặc mã học sinh..."/><div className="toolbar-actions">
            <button className="button secondary" onClick={() => file.current?.click()}><FileUp size={16}/> Nhập Excel / CSV</button>
            <input type="file" ref={file} accept=".xlsx,.csv" hidden onChange={(e) => void importFile(e.currentTarget)}/>
            <button className="button secondary" disabled={!students.length} onClick={() => exportCsv('danh-sach-hoc-sinh.csv', [['Họ và tên','Mã học sinh','Giới tính','Trạng thái'], ...students.map((s) => [s.fullName, s.studentCode ?? '', s.gender ? genderLabels[s.gender] : '', s.isActive ? 'Hoạt động' : 'Tạm dừng'])])}><Download size={16}/> Xuất CSV</button>
            <button className="button primary" onClick={() => studentDialog()}><Plus size={18}/> Thêm học sinh</button>
          </div></div>
          {displayedStudents.length ? <div className="panel table-wrap"><table>
            <thead><tr><th>Họ và tên</th><th>Mã học sinh</th><th>Giới tính</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>{displayedStudents.map((item) => <tr key={item.id}><td><span className="student-name"><img src={asImage(parts(item.characterVariant, item.gender).preview)} alt=""/><strong>{item.fullName}</strong></span></td><td>{item.studentCode || '—'}</td><td>{item.gender ? genderLabels[item.gender] : 'Chưa nhập'}</td><td><span className={'status-pill ' + (item.isActive ? 'active' : '')}>{item.isActive ? 'Hoạt động' : 'Tạm dừng'}</span></td><td>{editActions('student', { id: item.id, name: item.fullName }, () => studentDialog(item))}</td></tr>)}</tbody>
          </table></div> : <Empty title={q ? 'Không tìm thấy học sinh' : 'Chưa có học sinh'} message={q ? 'Thử tìm bằng tên hoặc mã khác.' : 'Thêm từng học sinh hoặc nhập danh sách Excel / CSV.'} icon="student" action={q ? undefined : () => studentDialog()} label="Thêm học sinh"/>}
        </div>
        break
      case 'questions':
        section = classroom && <QuestionSetup key={classroom.id} classroom={classroom} count={license?.pro ? settings.count : 1}
          changeCount={license?.pro ? (count) => configure({ count }) : undefined}
          back={() => navigate('students')} setup={active ? () => { configure({ withQuestions: true }); navigate('games') } : undefined}/>
        break
      case 'exams':
        section = <ExamManager school={school} classroom={classroom}/>
        break
      case 'presets':
        section = classroom && <GamePresets key={classroom.id} classroom={classroom} students={students} pro={!!license?.pro}
          back={() => navigate('students')} start={playPreset}/>
        break
      case 'games':
        section = <div className="subpage">
          <button className="text-button" onClick={() => navigate('students')}><ArrowLeft size={16}/> Chi tiết lớp</button>
          <div className="page-heading"><div><h1>Chọn trò chơi</h1><p>{school?.name} · {classroom?.name}</p></div>
            <button type="button" className="button secondary" onClick={() => navigate('presets')}>Cấu hình đã lưu</button>
          </div>
          <div className="card-grid">
            <article className="school-card panel"><span className="school-icon tone-0"><Sparkles size={24}/></span><h3>Thiên thạch</h3>
              <p>Thiên thạch chọn học sinh. Có thể hiện câu hỏi sau mỗi lượt.</p>
              <button className="card-link" disabled={!active || !!pending} onClick={() => navigate('setup')}>Chọn Thiên thạch <ArrowRight size={16}/></button>
            </article>
            <article className="school-card panel"><span className="school-icon tone-1"><Users size={24}/></span><h3>Tiếp sức đấu đội</h3>
              <p>{active >= 2 ? 'Chia nhóm, luân phiên cử thành viên trả lời và ghi điểm cho đội.' : 'Cần ít nhất 2 học sinh đang hoạt động.'}</p>
              <button className="card-link" disabled={active < 2 || !!pending} onClick={() => navigate('relay')}>Chọn Tiếp sức đấu đội <ArrowRight size={16}/></button>
            </article>
            <article className="school-card panel escape-entry"><img src={escapeArt} alt="Phòng học cũ trong Escape Room"/>
              <span className="school-icon tone-2"><DoorOpen size={24}/></span><h3>Căn phòng bí ẩn</h3>
              <p>Khám phá căn phòng, giải mật mã và tìm đường thoát hiểm.</p>
              <button className="card-link" disabled={!school || !classroom} onClick={() => navigate('escape')}>Thiết lập trò chơi <ArrowRight size={16}/></button>
            </article>
            <article className="school-card panel"><KnightArt/><h3>Hiệp Sĩ Cứu Mèo</h3>
              <p>Vượt qua những thử thách kiến thức, chiến đấu với quái vật và giải cứu chú mèo đáng yêu!</p>
              <button className="card-link" disabled={!school || !classroom} onClick={() => navigate('knight')}>Thiết lập <ArrowRight size={16}/></button>
            </article>
          </div>
        </div>
        break
      case 'relay':
        section = classroom && <Relay key={classroom.id} classroom={classroom} students={students.filter((student) => student.isActive)}
          back={() => navigate('games')} openQuestions={() => navigate('questions')} onMatchChange={setRelayActive}/>
        break
      case 'escape':
        section = school && classroom && <EscapeSetup school={school} classroom={classroom} back={() => navigate('games')}
          open={(session, selectedSchool, selectedClass) => {
            if (school.id !== selectedSchool.id) enterSchool(selectedSchool)
            if (classroom.id !== selectedClass.id) enterClassroom(selectedClass)
            go('escape')
            setEscape(session)
          }}/>
        break
      case 'knight':
        section = school && classroom && <KnightSetup key={classroom.id} school={school} classroom={classroom} back={() => navigate('games')} open={setKnight}/>
        break
      case 'setup':
        section = <Setup active={active} total={students.length} school={school?.name ?? ''} classroom={classroom?.name ?? ''} settings={settings}
          setSettings={configure} start={() => void play()} back={() => navigate('games')} openQuestions={() => navigate('questions')} busy={busy} pro={license?.pro} upgrade={() => void proDialog()}/>
        break
      case 'history':
        section = <div className="subpage">
          <div className="page-heading"><div><h1>Lịch sử chọn</h1><p>Xem lại kết quả đã công bố theo từng lượt chơi.</p></div></div>
          <div className="toolbar"><SearchField search={search} setSearch={setSearch} label="Tìm trường, lớp hoặc học sinh..."/></div>
          {history.filter((item) => matches([item.schoolName, item.classroomName, ...item.results.map((r) => r.fullName)].join(' '))).map((item) => <article className="panel history-row" key={item.id}>
            <span className="school-icon tone-0"><CalendarClock size={22}/></span><div><h3>{item.classroomName} · {item.schoolName}</h3><p>{stamp(item.startedAt)} · {modes[item.selectionMode].label} · {item.results.length}/{item.targetCount} đã công bố{item.cancelled && ' · Đã dừng'}</p></div>
            <button className="button secondary" onClick={() => setResult(item)}>Xem kết quả <ArrowRight size={16}/></button>
          </article>)}
          {!history.length && <Empty title="Chưa có lượt chơi" message="Kết quả sẽ xuất hiện sau khi hoàn thành hoặc kết thúc một lượt." icon="history"/>}
          <EscapeHistory search={search} open={setEscape}/>
          <KnightHistory search={search} open={setKnight}/>
        </div>
        break
      case 'backup':
        section = <div className="subpage">
          <div className="page-heading"><div><h1>Sao lưu dữ liệu</h1><p>Lưu hoặc khôi phục trường, lớp, học sinh và lịch sử từ tệp SQLite.</p></div></div>
          <div className="setup-grid backup-grid"><article className="panel setup-panel"><span className="school-icon tone-0"><Database size={24}/></span><h2>Tạo bản sao lưu</h2><p className="muted">Lưu một bản sao dữ liệu hiện tại để giữ lại hoặc chuyển sang máy khác.</p><button className="button primary" onClick={() => void backupFile()}><Download size={17}/> Lưu tệp sao lưu</button></article>
            <article className="panel setup-panel"><span className="school-icon tone-1"><ShieldCheck size={24}/></span><h2>Khôi phục dữ liệu</h2><p className="muted">Mở tệp sao lưu SoloTech để thay thế dữ liệu trên máy này.</p><button className="button secondary" onClick={() => void restoreFile()}><FolderOpen size={17}/> Chọn tệp sao lưu</button></article></div>
        </div>
        break
    }
    body = <Shell page={page} school={school} classroom={classroom} navigate={navigate} updateSlot={setUpdateSlot} proStatus={license?.pro ? (license.expiresAt == null ? 'Vĩnh viễn' : 'Đến hết ' + licenseDate(license.expiresAt)) : undefined} upgrade={() => void proDialog()} purchase={purchaseAvailable ? () => setPurchaseOpen(true) : undefined} help={() => setDialog({
      title: 'Hướng dẫn sử dụng', body: <div className="help-text"><p>Thêm trường, tạo lớp và thêm học sinh. Khi nhập Excel hoặc CSV, đặt tiêu đề <strong>Họ và tên</strong> ở dòng đầu. Bạn có thể thêm cột <strong>Mã học sinh</strong>, <strong>Giới tính</strong> (Nam/Nữ) và <strong>Trạng thái</strong>.</p><p>Mở <strong>Cấu hình trò chơi</strong> để chọn số lượng, chế độ và hiệu ứng. Trong lượt chơi, chọn <strong>Toàn màn hình</strong> để trình chiếu. Kết quả được lưu theo từng lần công bố.</p><p>Nếu đóng cửa sổ khi đang chơi, mở lại ứng dụng và chọn <strong>Tiếp tục lượt</strong>.</p></div>,
    })}>
      {error && <div className="alert" role="alert">{error}<button className="icon-button" aria-label="Đóng thông báo lỗi" onClick={() => setError('')}><X size={16}/></button></div>}
      {pending && <div className="pending-banner"><History size={20}/><div><strong>Lượt chơi đang dở</strong><small>{pending.schoolName} · {pending.classroomName}</small></div><button className="button soft" disabled={busy} onClick={() => void play(pending)}>Tiếp tục lượt</button><button className="button secondary" onClick={() => stopGame(pending)}>Kết thúc</button></div>}
      {section}
    </Shell>
  }
  return <>
    {body}
    <UpdatePanel slot={updateSlot} blocked={!ready || !!pending || busy || !!game || !!escape || !!knight || !!result || relayActive || !!dialog || purchaseOpen}/>
    {notice && !game && !escape && !knight && <div className="toast" role="status"><Sparkles size={17}/>{notice}<button className="icon-button" aria-label="Đóng thông báo" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {dialog && <Modal spec={dialog} close={() => setDialog(null)}/>}
    {purchaseAvailable && <ProPurchase open={purchaseOpen} close={() => setPurchaseOpen(false)} license={license}
      activated={(status) => { setLicense(status); updated('Đã kích hoạt FunChoice Pro.') }}/>}
  </>
}

