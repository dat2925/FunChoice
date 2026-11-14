export type Phase = 'READY' | 'COUNTDOWN' | 'RUNNING' | 'METEOR_WARNING' | 'METEOR_FALLING' | 'MISS' | 'IMPACT' | 'REVEAL' | 'NEXT_TARGET' | 'FINISHED'

export const drawTime = 1350
export const fallDuration = 1120
export const slowMotionScale = 0.45

export interface RoundOptions {
  count: number; revealed: number; lead: number; gap: number; speed: number
}

export class Round {
  phase: Phase = 'READY'
  elapsed = 0
  order: number
  nearMiss = false
  private saved = false

  constructor(private options: RoundOptions, private enter: (phase: Phase, order: number) => void, private random = Math.random) {
    this.order = options.revealed + 1
  }

  private duration() {
    switch (this.phase) {
      case 'READY': return 250
      case 'COUNTDOWN': return 3000
      case 'RUNNING': return this.options.lead * 1000
      case 'METEOR_WARNING': return drawTime
      case 'METEOR_FALLING': return fallDuration
      case 'MISS': return 1100
      case 'IMPACT': return 1050
      case 'REVEAL': return this.saved ? 1050 : Infinity
      case 'NEXT_TARGET': return this.options.gap * 1000
      case 'FINISHED': return Infinity
    }
  }

  aim() { this.saved = true }

  acknowledge() { this.saved = true; this.elapsed = 0 }

  get progress() { return Math.min(1, this.elapsed / (this.duration() || 1)) }

  advance(delta: number) {
    this.elapsed += delta * this.options.speed
    if (this.phase === 'METEOR_WARNING' && !this.nearMiss && !this.saved) {
      this.elapsed = Math.min(this.elapsed, drawTime)
      return
    }
    if (this.elapsed < this.duration()) return
    const next: Record<Phase, Phase> = {
      READY: 'COUNTDOWN', COUNTDOWN: 'RUNNING', RUNNING: 'METEOR_WARNING',
      METEOR_WARNING: 'METEOR_FALLING', METEOR_FALLING: this.nearMiss ? 'MISS' : 'IMPACT',
      MISS: 'METEOR_WARNING', IMPACT: 'REVEAL',
      REVEAL: this.order === this.options.count ? 'FINISHED' : 'NEXT_TARGET',
      NEXT_TARGET: 'METEOR_WARNING', FINISHED: 'FINISHED',
    }
    if (this.phase === 'NEXT_TARGET') this.order++
    const previous = this.phase
    this.phase = next[previous]
    if (this.phase === 'METEOR_WARNING') this.nearMiss = previous !== 'MISS' && this.random() < 0.22
    this.elapsed = 0
    this.saved = false
    this.enter(this.phase, this.order)
  }
}
