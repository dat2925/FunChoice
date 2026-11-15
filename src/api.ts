import { invoke } from '@tauri-apps/api/core'

export const schoolThemes = { rural: 'Nông thôn', city: 'Thành phố', mountain: 'Miền núi' } as const
export type SchoolTheme = keyof typeof schoolThemes
export interface School { id: string; name: string; count: number; theme: SchoolTheme }
export interface Classroom { id: string; schoolId: string; name: string; count: number }
export type Gender = 'male' | 'female'
export const genderLabels = { male: 'Nam', female: 'Nữ' } as const
export interface Student {
  id: string; classroomId: string; fullName: string; studentCode: string | null
  characterVariant: number; gender: Gender | null; isActive: boolean
}
export interface StudentInput {
  fullName: string; studentCode: string | null; gender?: Gender | null; isActive: boolean
}
export const modes = {
  random: { label: 'Ngẫu nhiên', info: 'Mỗi thiên thạch chọn ngẫu nhiên một học sinh đang hoạt động ngay trước khi lao xuống. Mỗi em có cơ hội như nhau trong số học sinh còn lại.' },
  cycle: { label: 'Không lặp', info: 'Chọn hết vòng hiện tại trước khi mở vòng mới. Nếu một lượt đi qua ranh giới hai vòng, học sinh đã trúng trong lượt đó được bỏ qua ở vòng mới.' },
  weighted: { label: 'Ưu tiên ít được chọn', info: 'Trọng số = 1 / (1 + số lần đã trúng). Mỗi lần rơi lấy mẫu theo trọng số trong số học sinh còn lại.' },
} as const
export interface LicenseInfo {
  pro: boolean; machineCode: string | null; needsMachineKey: boolean
  expiresAt: number | null; freeClasses: number; freeStudents: number
}
export const musicTracks = { suspense: 'Gay cấn', adventure: 'Phiêu lưu', arcade: 'Arcade', mp3: 'MP3 của bạn' } as const
export const meteorStyles = { straight: 'Rơi thẳng', curve: 'Đổi hướng', mixed: 'Hỗn hợp' } as const
export interface Settings {
  withQuestions: boolean; repeatStudents: boolean; questions: Question[]
  meteorStyle: keyof typeof meteorStyles
  count: number; mode: keyof typeof modes; lead: number; gap: number
  sound: boolean; shake: boolean; quality: 'high' | 'low'; speed: number; music: keyof typeof musicTracks
}
export const defaults: Settings = {
  withQuestions: false, repeatStudents: false, questions: [],
  count: 1, mode: 'random', lead: 3, gap: 2, sound: true, shake: true, quality: 'high', speed: 1, music: 'suspense', meteorStyle: 'straight',
}
export interface Question {
  id: string; text: string; answer: string | null
  options?: string[]; correctOptions?: number[]
}
export const optionLetters = 'ABCDEFGH'
export interface QuestionPlan { bank: Question[]; turns: (string | null)[] }
export interface Pick {
  studentId: string; fullName: string; studentCode: string | null; selectionOrder: number; selectedAt: string | null
}
export interface Session {
  id: string; classroomId: string; schoolName: string; schoolTheme: SchoolTheme; classroomName: string
  targetCount: number; selectionMode: keyof typeof modes; startedAt: string; finishedAt: string | null
  cancelled: boolean; settings: Settings; results: Pick[]
}
export const api = {
  setMusic: (path: string) => invoke<void>('set_background_music', { path }),
  hasBackgroundMusic: () => invoke<boolean>('has_background_music'),
  backgroundMusic: () => invoke<ArrayBuffer>('background_music'),
  license: () => invoke<LicenseInfo>('license_info'),
  activate: (key: string) => invoke<LicenseInfo>('activate_pro', { key }),
  schools: () => invoke<School[]>('list_schools'),
  classrooms: (schoolId: string) => invoke<Classroom[]>('list_classrooms', { schoolId }),
  students: (classroomId: string) => invoke<Student[]>('list_students', { classroomId }),
  questionPlan: (classroomId: string) => invoke<QuestionPlan>('class_question_plan', { classroomId }),
  saveQuestionPlan: (classroomId: string, plan: QuestionPlan) => invoke<void>('save_class_question_plan', { classroomId, plan }),
  saveSchool: (name: string, theme: SchoolTheme, id?: string) => invoke<string>('save_school', { name, theme, id }),
  saveClassroom: (schoolId: string, name: string, id?: string) => invoke<string>('save_classroom', { schoolId, name, id }),
  saveStudent: (classroomId: string, student: StudentInput, id?: string) =>
    invoke<string>('save_student', { classroomId, student, id }),
  importStudents: (classroomId: string, students: StudentInput[]) =>
    invoke<number>('import_students', { classroomId, students }),
  archive: (kind: string, id: string) => invoke<void>('archive', { kind, id }),
  pending: () => invoke<Session | null>('pending_game'),
  history: () => invoke<Session[]>('history'),
  start: (classroomId: string, settings: Settings) => invoke<Session>('start_game', { classroomId, settings }),
  draw: (id: string, order: number) => invoke<Pick>('draw_meteor', { id, order }),
  reveal: (id: string, order: number) => invoke<Session>('reveal', { id, order }),
  cancel: (id: string) => invoke<void>('cancel_game', { id }),
  backup: (path: string) => invoke<void>('backup', { path }),
  restore: (path: string) => invoke<void>('restore', { path }),
}
