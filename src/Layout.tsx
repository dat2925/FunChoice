import { ArrowRight, ChevronDown, ChevronRight, CircleHelp, Database, GraduationCap, History, Plus, School as SchoolIcon, Sparkles, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Classroom, School } from './api'
import type { Page } from './store'

import ProductBrand from './ProductBrand'
import UpdatePanel from './UpdatePanel'

export function HeroArt() {
  return <svg className="hero-art" viewBox="0 0 492 260" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="flame" x1="350" y1="28" x2="225" y2="184" gradientUnits="userSpaceOnUse"><stop stopColor="#FF8E79" stopOpacity="0"/><stop offset=".55" stopColor="#FF9B83"/><stop offset="1" stopColor="#FFC36E"/></linearGradient>
      <linearGradient id="rock" x1="252" y1="104" x2="345" y2="214" gradientUnits="userSpaceOnUse"><stop stopColor="#FFE9A3"/><stop offset="1" stopColor="#F3868D"/></linearGradient>
      <linearGradient id="planet" x1="50" y1="50" x2="113" y2="123" gradientUnits="userSpaceOnUse"><stop stopColor="#A88AF8"/><stop offset="1" stopColor="#7755D5"/></linearGradient>
    </defs>
    <circle cx="298" cy="123" r="108" stroke="#c5b0ff" strokeOpacity=".19"/>
    <circle cx="298" cy="123" r="139" stroke="#c5b0ff" strokeOpacity=".15"/>
    <circle cx="298" cy="123" r="165" stroke="#c5b0ff" strokeOpacity=".11" strokeDasharray="4 7"/>
    <path d="M91 215c76 23 280-63 366-145 20-19 10-27-12-22M124 50C91 69 51 113 65 122c14 10 75-12 112-40" stroke="#ceb9ff" strokeOpacity=".28" strokeWidth="1.5"/>
    <circle cx="101" cy="83" r="33" fill="url(#planet)"/>
    <path d="M73 68c28-4 49 3 59 12M73 88c22-3 43 5 55 13M85 107c11-1 24 4 28 6" stroke="#c4a9fb" strokeOpacity=".44" strokeWidth="2"/>
    <ellipse cx="100" cy="85" rx="53" ry="9" transform="rotate(-22 100 85)" stroke="#d7baff" strokeOpacity=".68" strokeWidth="2"/>
    <path d="M239 128c42-45 100-53 161-110-17 38-25 50-38 65l61-24c-30 31-51 51-63 78l31-6c-15 29-40 51-59 64Z" fill="url(#flame)"/>
    <path d="M263 132c24-24 68-43 105-71-4 15-16 33-23 45l30-13-30 49 16-4-26 44Z" fill="#FFD485" opacity=".93"/>
    <path d="M237 139l30-23 38-6 36 18 16 30-9 32-30 26-39 1-34-19-14-28z" fill="#7b4a84" opacity=".67" transform="translate(4 7)"/>
    <path d="M237 139l30-23 38-6 36 18 16 30-9 32-30 26-39 1-34-19-14-28z" fill="url(#rock)" stroke="#FFE7AC" strokeWidth="2"/>
    <path d="M237 139l32-5 36-24-38 6z" fill="#FFF2BF" opacity=".72"/><path d="M315 212l-35-4-35-16 34 25 39-1 30-26 9-32-20 27z" fill="#d9688a" opacity=".64"/>
    <path d="M259 153l13-11 17 4 7 13-8 13-17-1-11-7z" fill="#C87086" stroke="#F4A592" strokeWidth="2"/>
    <path d="M260 153l12-11 17 4 7 13-8-5-13-4z" fill="#ad597b" opacity=".7"/>
    <path d="M312 178l10-8 13 5 1 11-11 9-12-4zM257 187l7-5 9 4 2 7-7 4-8-4z" fill="#D57588" stroke="#F1A28F" strokeWidth="1.5"/>
    <path d="M311 129l11 3 5 6" stroke="#FFF2BF" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
    <g fill="#FFD78E"><path d="M196 106l3 9 9 3-9 3-3 9-3-9-9-3 9-3zm201 65 3 10 10 3-10 3-3 10-3-10-10-3 10-3zM166 205l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM421 99l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><circle cx="223" cy="77" r="2.5"/><circle cx="354" cy="38" r="2"/><circle cx="447" cy="145" r="2.5"/><circle cx="224" cy="205" r="2"/></g>
    <g fill="#dac6ff"><circle cx="156" cy="151" r="2.5"/><circle cx="181" cy="62" r="2"/><circle cx="378" cy="214" r="2"/><circle cx="435" cy="206" r="2"/><path d="M132 184v10m-5-5h10M260 57v13m-6.5-6.5h13M450 80v9m-4.5-4.5h9" stroke="#e0caff" strokeWidth="1.5" strokeLinecap="round"/></g>
    <path d="M199 153l13-8m164-92 11-7m18 95 16-10m-213 49 8-5" stroke="#FFAA99" strokeWidth="2" strokeLinecap="round"/>
  </svg>
}

export function Hero({ title, description, button, onAction }: { title: ReactNode; description: string; button?: string; onAction?: () => void }) {
  return <section className="hero">
    <HeroArt />
    <div className="hero-text">
      <div className="hero-label"><Sparkles size={14}/> TRÒ CHƠI LỚP HỌC</div>
      <h1>{title}</h1>
      <p>{description}</p>
      {button && <button className="button hero-button" onClick={onAction}>{button}<ArrowRight size={17}/></button>}
    </div>
  </section>
}

const labels: Record<Page, string> = {
  schools: 'Trường học', classrooms: 'Lớp học', students: 'Học sinh',
  questions: 'Chuẩn bị câu hỏi', games: 'Chọn trò chơi', setup: 'Thiên thạch', relay: 'Tiếp sức đấu đội',
  history: 'Lịch sử chọn', backup: 'Sao lưu dữ liệu',
}
export function Shell({ page, school, classroom, navigate, help, proStatus, upgrade, updateBlocked, children }: {
  page: Page; school: School | null; classroom: Classroom | null
  navigate: (page: Page) => void; help: () => void; proStatus?: string; upgrade: () => void; updateBlocked: boolean; children: ReactNode
}) {
  const schoolArea = ['schools', 'classrooms', 'students', 'questions', 'games', 'setup', 'relay'].includes(page)
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('schools')} aria-label="FunChoice, về trang trường học">
        <ProductBrand />
      </button>
      <div className="sidebar-content">
        <div className="nav-label">QUẢN LÝ</div>
        <nav aria-label="Điều hướng chính">
          <button className={schoolArea ? 'nav-item current' : 'nav-item'} onClick={() => navigate('schools')} aria-current={schoolArea ? 'page' : undefined}><SchoolIcon size={19}/> Trường học</button>
          <button className={page === 'history' ? 'nav-item current' : 'nav-item'} onClick={() => navigate('history')} aria-current={page === 'history' ? 'page' : undefined}><History size={19}/> Lịch sử chọn</button>
        </nav>
        <div className="nav-label second">HỆ THỐNG</div>
        <nav aria-label="Hệ thống">
          <button className={page === 'backup' ? 'nav-item current' : 'nav-item'} onClick={() => navigate('backup')} aria-current={page === 'backup' ? 'page' : undefined}><Database size={18}/> Sao lưu dữ liệu</button>
          <button className="nav-item" onClick={help}><CircleHelp size={18}/> Hướng dẫn</button>
        </nav>
      </div>
      <div className="sidebar-foot">
        {proStatus ? <div className="license-status" role="status">
          <Sparkles size={16} aria-hidden="true"/>
          <div><strong>FunChoice Pro</strong><small>{proStatus}</small></div>
        </div> : <button className="button soft license-button" onClick={upgrade}><Sparkles size={16}/> Nhập key Pro</button>}
        <div className="local-status"><span className="status-dot"/><div><strong>Chế độ ngoại tuyến</strong><small>Dữ liệu lưu trên máy này</small></div></div>
        <UpdatePanel blocked={updateBlocked}/>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="crumbs">
          <button onClick={() => navigate('schools')}>Quản lý</button><ChevronRight size={14}/>
          {schoolArea && page !== 'schools' && <><button onClick={() => navigate('schools')}>Trường học</button><ChevronRight size={14}/></>}
          {schoolArea && school && page !== 'schools' && <><button onClick={() => navigate('classrooms')}>{school.name}</button><ChevronRight size={14}/></>}
          {schoolArea && classroom && <><button onClick={() => navigate('students')}>{classroom.name}</button><ChevronRight size={14}/></>}
          <strong>{labels[page]}</strong>
        </div>
        <div className="teacher"><span className="teacher-icon"><GraduationCap size={18}/></span><span>Giáo viên</span><ChevronDown size={14} className="teacher-chevron"/></div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>
}

export function Empty({ title, message, action, label = 'Thêm mới', icon = 'school' }: {
  title: string; message: string; action?: () => void; label?: string; icon?: 'school' | 'student' | 'history'
}) {
  const Icon = icon === 'history' ? History : icon === 'student' ? Users : SchoolIcon
  return <div className="empty">
    <div className="empty-icon"><Icon size={25}/></div>
    <strong>{title}</strong><p>{message}</p>
    {action && <button className="button soft" onClick={action}><Plus size={17}/>{label}</button>}
  </div>
}
