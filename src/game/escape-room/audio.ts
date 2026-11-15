const effects = {
  inspect: [360], drawer: [180, 235], book: [310, 470, 625], keypad: [460], lock: [155, 330, 525],
  item: [520, 660, 780], win: [392, 523, 659, 784, 1047], timeout: [392, 293, 196], wrong: [245, 185],
}

export function createRoomAudio(enabled: boolean) {
  let context: AudioContext | undefined
  return {
    play(effect: keyof typeof effects) {
      if (!enabled) return
      try {
        context ??= new AudioContext()
        const audio = context
        if (audio.state === 'suspended') void audio.resume().catch(() => undefined)
        const start = audio.currentTime
        effects[effect].forEach((frequency, index) => {
          const oscillator = audio.createOscillator()
          const envelope = audio.createGain()
          const at = start + index * .078
          oscillator.type = effect === 'drawer' || effect === 'lock' ? 'triangle' : 'sine'
          oscillator.frequency.value = frequency
          envelope.gain.setValueAtTime(.0001, at)
          envelope.gain.exponentialRampToValueAtTime(.08, at + .015)
          envelope.gain.exponentialRampToValueAtTime(.0001, at + .20)
          oscillator.connect(envelope).connect(audio.destination)
          oscillator.start(at)
          oscillator.stop(at + .21)
          oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
        })
      } catch { /* Audio availability does not interrupt the game. */ }
    },
    close() { if (context) void context.close().catch(() => undefined); context = undefined },
  }
}
