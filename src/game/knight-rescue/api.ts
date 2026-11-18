import { invoke } from '@tauri-apps/api/core'
import type { GameState } from './GameState'
export const knightApi = {
  save: (snapshot: GameState) => invoke<GameState>('knight_save', { snapshot, revision: snapshot.revision }),
  list: (classroomId?: string) => invoke<GameState[]>('knight_list', { classroomId: classroomId ?? null }),
}
