import type { Settings } from '../api'

const suspense = [110, 110, 130.81, 110, 146.83, 130.81, 110, 103.83]
const themes = {
  suspense: { bass: suspense, high: [440, 523.25, 587.33, 622.25], beat: 0.176, wave: 'triangle' },
  adventure: { bass: [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61], high: [523.25, 659.25, 698.46, 783.99], beat: 0.225, wave: 'sine' },
  arcade: { bass: [130.81, 130.81, 155.56, 196, 155.56, 130.81, 233.08, 196], high: [523.25, 622.25, 783.99, 932.33], beat: 0.155, wave: 'square' },
} as const

export class SuspenseMusic {
  private step = 0
  private next = 0
  private bus: GainNode

  constructor(private context: AudioContext, private track: Exclude<Settings['music'], 'mp3'>) {
    this.bus = context.createGain()
    this.bus.gain.value = 1.65
    this.bus.connect(context.destination)
  }

  pause() {
    const now = this.context.currentTime
    this.bus.gain.setTargetAtTime(0, now, 0.025)
    this.next = 0
  }

  update(tension: boolean) {
    if (this.context.state !== 'running') return
    const now = this.context.currentTime
    if (this.next < now) {
      this.next = now + 0.035
      this.bus.gain.setTargetAtTime(1.65, now, 0.03)
    }
    const theme = themes[this.track ?? 'suspense']
    while (this.next < now + 0.1) {
      const beat = this.step % 8
      this.note(this.next, theme.bass[beat], 0.19, beat % 2 ? 0.041 : 0.063, 'triangle')
      if (beat === 0 || beat === 4) this.note(this.next, 84, 0.21, 0.10, 'sine', 38)
      if (tension || beat % 2 === 1) this.note(this.next + 0.026, theme.high[(this.step + Math.floor(this.step / 8)) % 4], 0.095, tension ? 0.038 : 0.025, theme.wave)
      this.step++
      this.next += theme.beat * (tension ? 0.77 : 1)
    }
  }

  private note(time: number, pitch: number, duration: number, gain: number, wave: OscillatorType, endPitch = pitch) {
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = wave
    oscillator.frequency.setValueAtTime(pitch, time)
    oscillator.frequency.exponentialRampToValueAtTime(endPitch, time + duration)
    envelope.gain.setValueAtTime(0.001, time)
    envelope.gain.exponentialRampToValueAtTime(gain, time + 0.013)
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration)
    oscillator.connect(envelope)
    envelope.connect(this.bus)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
    oscillator.start(time)
    oscillator.stop(time + duration)
  }
}
