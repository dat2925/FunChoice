// Original synthesized effects and melodies. All audio is produced offline.
export class KnightAudio {
  context: AudioContext | null = null; timer?: number; step = 0
  start() { if (!this.context) this.context = new AudioContext(); void this.context.resume() }
  tone(frequency: number, duration = .15, type: OscillatorType = 'sine', gain = .06) {
    const c = this.context
    if (!c || c.state !== 'running') return
    const o = c.createOscillator(); const g = c.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, c.currentTime)
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + duration)
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + duration)
  }
  effect(kind: string) {
    if (kind === 'rescue' && this.context) {
      const c = this.context; const o = c.createOscillator(); const g = c.createGain()
      o.type = 'triangle'; o.frequency.setValueAtTime(690, c.currentTime); o.frequency.exponentialRampToValueAtTime(1050, c.currentTime + .18); o.frequency.exponentialRampToValueAtTime(480, c.currentTime + .65)
      g.gain.setValueAtTime(.035, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .7)
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .7)
    }
    const notes = kind === 'rescue' ? [660, 880, 740, 980] : kind === 'chest' ? [523, 659, 784] : kind === 'wrong' ? [180, 120] : kind === 'shield' ? [1100, 550] : kind === 'step' ? [85] : [440, 880]
    notes.forEach((n, i) => { const c = this.context; if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = kind === 'wrong' ? 'triangle' : 'sine'; o.frequency.value = n; const t = c.currentTime + i * .1; g.gain.setValueAtTime(.07, t); g.gain.exponentialRampToValueAtTime(.001, t + .2); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + .2) })
  }
  music(boss: boolean) {
    this.stop()
    this.timer = window.setInterval(() => { const notes = boss ? [220, 261, 311, 293, 220, 196, 246, 293] : [392, 494, 587, 494, 440, 523, 659, 523]; this.tone(notes[this.step++ % 8], .35, 'triangle', .025) }, boss ? 230 : 420)
  }
  stop() { window.clearInterval(this.timer) }
  close() { this.stop(); void this.context?.close() }
}
