import { invoke } from '@tauri-apps/api/core'
import type { Question } from '../../api'

export const chapter = 'Chương 1: Bí mật phòng học cũ'
export const clockClue = 'Kim phút chỉ số 3. Kim giờ đã qua số 3 nhưng chưa đến số 4.'
export const paintingClue = 'Ba con số mở chiếc két. Đọc chúng theo thứ tự: bàn học, tủ sách, đồng hồ.'
export const hints = [
  'Bàn học và cuốn sách phát sáng đều cất một mảnh giấy. Hãy giải câu hỏi để lấy chúng.',
  'Đọc kỹ gợi ý của đồng hồ. Mỗi vạch số trên mặt đồng hồ ứng với 5 phút.',
  'Bức tranh chỉ ra thứ tự các mảnh giấy. Mở túi đồ để xem lại từng số.',
  'Chìa khóa trong két dùng để mở cửa. Hãy chọn cửa sau khi đã nhận chìa.',
]

export type EscapeStatus = 'not_started' | 'playing' | 'paused' | 'completed' | 'failed' | 'abandoned'
export type Item = 'paper4' | 'paper7' | 'paper2' | 'paintingNote' | 'key'
export type Station = 'desk' | 'book'
export type RoomObject = Station | 'clock' | 'painting' | 'safe' | 'door'
export type Feedback = 'correct' | 'incorrect' | 'wrongTime' | 'missingClues' | 'wrongCode' | 'needKey' | 'hint' | 'expired'

export const items: Record<Item, { label: string; description: string }> = {
  paper4: { label: 'Mảnh giấy số 4', description: 'Mảnh giấy tìm thấy trong ngăn kéo bàn học ghi số 4.' },
  paper7: { label: 'Mảnh giấy số 7', description: 'Mảnh giấy kẹp trong cuốn sách phát sáng ghi số 7.' },
  paper2: { label: 'Mảnh giấy số 2', description: 'Mảnh giấy giấu trong đồng hồ ghi số 2.' },
  paintingNote: { label: 'Ghi chú sau tranh', description: paintingClue },
  key: { label: 'Chìa khóa thoát hiểm', description: 'Chìa đồng trong két sắt vừa với ổ khóa cửa.' },
}

export const objects: Record<RoomObject, { label: string; bounds: [number, number, number, number]; item?: Item }> = {
  book: { label: 'Tủ sách', bounds: [18, 111, 321, 450], item: 'paper7' },
  desk: { label: 'Bàn học', bounds: [71, 638, 695, 282], item: 'paper4' },
  clock: { label: 'Đồng hồ', bounds: [772, 116, 178, 224], item: 'paper2' },
  painting: { label: 'Bức tranh', bounds: [1020, 194, 246, 186], item: 'paintingNote' },
  safe: { label: 'Két sắt', bounds: [1073, 480, 211, 207], item: 'key' },
  door: { label: 'Cửa thoát hiểm', bounds: [1357, 102, 293, 628] },
}

export const roomWidth = 1672
export const roomHeight = 941
export const roomObjects = Object.keys(objects) as RoomObject[]

export interface EscapeConfig {
  name: string; limitMinutes: number | null; sound: boolean; hints: boolean; wrongAnswer: 'retry' | 'timePenalty'
  deskQuestionId: string | null; bookQuestionId: string | null
}
export const defaultEscapeConfig: EscapeConfig = { name: 'Bí mật phòng học cũ', limitMinutes: 10, sound: true, hints: true,
  wrongAnswer: 'retry', deskQuestionId: null, bookQuestionId: null }

export interface EscapeSession {
  id: string; classroomId: string; schoolName: string; classroomName: string; config: EscapeConfig; startedAt: string
  status: EscapeStatus; revision: number; remainingMs: number | null; elapsedMs: number; questions: [Question, Question]
  inventory: Item[]; hintsUsed: number; answers: { station: Station; correct: boolean; selected: number[] }[]
  correct: number; wrong: number
}

export type EscapeAction =
  | { type: 'tick' | 'pause' | 'resume' | 'abandon' | 'painting' | 'hint' | 'exit' }
  | { type: 'answer'; station: Station; selected?: number[]; manual?: boolean }
  | { type: 'clock'; hour: number; minute: number }
  | { type: 'safe'; code: string }

export interface EscapeChange { session: EscapeSession; feedback: Feedback | null }

export const escapeApi = {
  start: (classroomId: string, config: EscapeConfig) => invoke<EscapeSession>('escape_start', { classroomId, config }),
  restart: (sessionId: string) => invoke<EscapeSession>('escape_restart', { sessionId }),
  list: (classroomId?: string) => invoke<EscapeSession[]>('escape_list', { classroomId: classroomId ?? null }),
  action: (session: EscapeSession, elapsedMs: number, action: EscapeAction) =>
    invoke<EscapeChange>('escape_action', { id: session.id, revision: session.revision, elapsedMs, action }),
}

export function isActive(session: EscapeSession) { return session.status === 'playing' || session.status === 'paused' }

export function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
