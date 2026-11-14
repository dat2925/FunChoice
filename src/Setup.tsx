import { ArrowLeft, Clock3, Gauge, Play, Settings2, Shuffle, Sparkles, Users, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { errorText } from './Modal'
import { api, meteorStyles, modes, musicTracks, type Settings } from './api'

export default function Setup({ active, total, school, classroom, settings, setSettings, start, back, openQuestions, busy, pro = false, upgrade }: {
  active: number; total: number; school: string; classroom: string; settings: Settings
  setSettings: (value: Partial<Settings>) => void; start: () => void; back: () => void; openQuestions?: () => void; busy: boolean; pro?: boolean; upgrade?: () => void
}) {
  const [musicMessage, setMusicMessage] = useState('')
  const [pickingMusic, setPickingMusic] = useState(false)
  async function chooseMusic() {
    setPickingMusic(true)
    setMusicMessage('')
    try {
      const path = await open({ title: 'Chọn nhạc nền MP3', filters: [{ name: 'Nhạc MP3', extensions: ['mp3'] }] })
      if (path) {
        await api.setMusic(path)
        setSettings({ music: 'mp3' })
        setMusicMessage(path.split(/[\\/]/).at(-1) ?? 'Đã lưu nhạc MP3.')
      }
    } catch (error) { setMusicMessage(errorText(error)) }
    finally { setPickingMusic(false) }
  }
  const { lead, gap, speed } = settings
  const maximum = pro && settings.repeatStudents && active ? undefined : pro ? active : Math.min(active, 1)
  const count = pro ? settings.count : 1
  return <div className="subpage">
    <button className="text-button" onClick={back}><ArrowLeft size={16}/> Danh sách học sinh</button>
    <div className="page-heading"><div><h1>Cấu hình trò chơi</h1><p>{school} · {classroom}</p></div></div>
    <div className="setup-grid">
      <div className="panel setup-panel">
        <h2><Users size={20}/> Chọn học sinh</h2>
        <label>Chế độ chơi
          <select value={settings.withQuestions ? 'questions' : 'only'} onChange={(e) => setSettings({ withQuestions: e.target.value === 'questions' })}>
            <option value="only">Chỉ chọn học sinh</option>
            <option value="questions">Chọn học sinh và hiện câu hỏi</option>
          </select>
        </label>
        {settings.withQuestions && <button className="text-button" onClick={openQuestions}>Chuẩn bị câu hỏi cho từng lượt</button>}
        <p className="muted">{active} học sinh đang hoạt động trên tổng số {total} học sinh.</p>
        <div className="form-grid">
          <label>{settings.repeatStudents ? 'Số lượt chọn' : 'Số học sinh được chọn'}<input type="number" value={count || ''} min="1" max={maximum} disabled={!pro} onChange={(e) => setSettings({ count: Number(e.target.value) })}/></label>
          <label><span><Shuffle size={15}/> Chế độ chọn</span>
            <select value={settings.mode} onChange={(e) => setSettings({ mode: e.target.value as Settings['mode'] })}>
              {Object.entries(modes).map(([key, mode]) => <option value={key} key={key}>{mode.label}</option>)}
            </select>
          </label>
        </div>
        <label className="switch-row"><span>Cho phép chọn lại học sinh</span><input type="checkbox" checked={settings.repeatStudents} onChange={(e) => setSettings({ repeatStudents: e.target.checked })}/></label>
        {!pro && <p className="hint">Bản miễn phí chọn 1 học sinh mỗi lượt. <button className="text-button" onClick={upgrade}>Mở khóa Pro</button></p>}
        <p className="hint">{settings.repeatStudents
          ? settings.mode === 'cycle' ? 'Học sinh có thể được chọn lại khi mở vòng mới.' : 'Mỗi lượt có thể chọn lại học sinh đã được gọi.'
          : modes[settings.mode].info}</p>
        <h2><Clock3 size={20}/> Nhịp trò chơi</h2>
        <label>Kiểu rơi thiên thạch
          <select value={settings.meteorStyle} onChange={(e) => setSettings({ meteorStyle: e.target.value as Settings['meteorStyle'] })}>
            {Object.entries(meteorStyles).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label>Chạy trước lần rơi đầu<select value={lead} onChange={(e) => setSettings({ lead: +e.target.value })}>{Array.from({length: 21}, (_, i) => <option key={i} value={i}>{i} giây</option>)}</select></label>
          <label>Khoảng cách giữa các lần rơi<select value={gap} onChange={(e) => setSettings({ gap: +e.target.value })}>{Array.from({length: 10}, (_, i) => <option key={i} value={i + 1}>{i + 1} giây</option>)}</select></label>
        </div>
      </div>
      <div className="panel setup-panel">
        <h2><Settings2 size={20}/> Trình chiếu</h2>
        <div className="form-grid">
          <label><span><Sparkles size={15}/> Chất lượng đồ họa</span><select value={settings.quality} onChange={(e) => setSettings({ quality: e.target.value as Settings['quality'] })}><option value="high">Cao</option><option value="low">Thấp</option></select></label>
          <label><span><Gauge size={15}/> Tốc độ trò chơi</span><select value={speed} onChange={(e) => setSettings({ speed: +e.target.value })}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => <option key={v} value={v}>{v}×</option>)}</select></label>
        </div>
        <label className="switch-row"><span>Nhạc nền {!pro && '· Pro'}</span>
          <select disabled={!pro} value={pro ? settings.music : 'suspense'} onChange={(e) => setSettings({ music: e.target.value as Settings['music'] })}>
            {Object.entries(musicTracks).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
          </select>
        </label>
        {pro && <div className="music-file">
          <button className="button secondary" onClick={() => void chooseMusic()} disabled={pickingMusic}>Chọn tệp MP3…</button>
          {musicMessage && <p className="muted" role="status">{musicMessage}</p>}
        </div>}
        <label className="switch-row"><span><Volume2 size={18}/> Âm thanh</span><input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })}/></label>
        <label className="switch-row"><span><Sparkles size={18}/> Rung camera</span><input type="checkbox" checked={settings.shake} onChange={(e) => setSettings({ shake: e.target.checked })}/></label>

      </div>
    </div>
    <div className="start-strip"><span>{active ? 'Kết quả được lưu theo từng lượt chọn.' : 'Hãy thêm hoặc kích hoạt học sinh trong lớp để bắt đầu.'}</span><button className="button primary big" onClick={start} disabled={busy || pickingMusic || !Number.isSafeInteger(count) || count < 1 || (maximum !== undefined && count > maximum)}><Play size={18} fill="currentColor"/> {busy ? 'Đang tạo lượt…' : 'BẮT ĐẦU TRÒ CHƠI'}</button></div>
  </div>
}
