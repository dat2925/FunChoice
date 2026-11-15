import { create } from 'zustand'
import { api, defaults, musicTracks, type Classroom, type School, type Settings } from './api'

export type Page = 'schools' | 'classrooms' | 'students' | 'questions' | 'exams' | 'games' | 'presets' | 'setup' | 'relay' | 'escape' | 'history' | 'backup'

const musicKey = 'funchoice.background-music'

export async function restoreMusic() {
  if (localStorage.getItem(musicKey) !== null) return
  if (await api.hasBackgroundMusic() && localStorage.getItem(musicKey) === null) {
    useDesk.getState().configure({ music: 'mp3' })
  }
}

function savedMusic(): Settings['music'] {
  const track = localStorage.getItem(musicKey)
  return track && Object.hasOwn(musicTracks, track) ? track as Settings['music'] : defaults.music
}

export const useDesk = create<{
  page: Page; school: School | null; classroom: Classroom | null; settings: Settings
  go: (page: Page) => void; enterSchool: (school: School) => void
  enterClassroom: (classroom: Classroom) => void; configure: (settings: Partial<Settings>) => void
}>((set) => ({
  page: 'schools', school: null, classroom: null, settings: { ...defaults, music: savedMusic() },
  go: (page) => set({ page }),
  enterSchool: (school) => set({ school, classroom: null, page: 'classrooms' }),
  enterClassroom: (classroom) => set((state) => ({ classroom, page: 'students', settings: { ...defaults, music: state.settings.music, meteorStyle: state.settings.meteorStyle } })),
  configure: (settings) => {
    if (settings.music) localStorage.setItem(musicKey, settings.music)
    set((state) => ({ settings: { ...state.settings, ...settings } }))
  },
}))
