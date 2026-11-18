import { invoke } from '@tauri-apps/api/core'
import type { Question, Session, Settings } from './api'
import type { EscapeConfig, EscapeSession } from './game/escape-room/model'
import type { RelayConfig } from './RelaySettings'

export const gameNames = { meteor: 'Thiên thạch', relay: 'Tiếp sức đấu đội', escape: 'Căn phòng bí ẩn' } as const

export type PresetGame =
  | { kind: 'meteor'; settings: Settings }
  | { kind: 'relay'; settings: RelayConfig }
  | { kind: 'escape'; settings: EscapeConfig }

export type QuestionSource =
  | { kind: 'default' | 'bank' }
  | { kind: 'questions'; questionIds: string[]; examId?: string | null }
  | { kind: 'exam'; examId: string; questionIds?: string[] }

export interface PresetInput { title: string; game: PresetGame; questionSource: QuestionSource | null }
export interface GamePreset { id: string; title: string; game: PresetGame; sourceLabel: string; questions: Question[] }

export const presetApi = {
  list: (classroomId: string) => invoke<GamePreset[]>('list_game_presets', { classroomId }),
  save: (classroomId: string, input: PresetInput, id?: string) => invoke<GamePreset>('save_game_preset', { classroomId, id, input }),
  remove: (classroomId: string, id: string) => invoke<void>('delete_game_preset', { classroomId, id }),
  meteor: (classroomId: string, id: string) => invoke<Session>('start_meteor_preset', { classroomId, id }),
  escape: (classroomId: string, id: string) => invoke<EscapeSession>('start_escape_preset', { classroomId, id }),
}
