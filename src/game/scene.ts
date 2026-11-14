import Phaser from 'phaser'
import type { Session, Student } from '../api'
import { Actor } from './actor'
import { asImage, characterKey, parts } from './characters'
import { drawTime, fallDuration, slowMotionScale, Round, type Phase } from './round'
import { fieldWidth, schoolSign, schoolyards } from './yard'
import { meteorPosition, shouldCurveMeteor, type MeteorPath } from './meteor'
import { SuspenseMusic } from './music'
import helpShout from './help-shout.wav?inline'

const conversations = [
  ['Chơi đuổi bắt không?', 'Chơi luôn!'],
  ['Bạn chạy nhanh thế!', 'Đuổi kịp mình đi!'],
  ['Ra giữa sân đi!', 'Đợi mình với!'],
]

export interface SceneEvents {
  phase: (phase: Phase, count?: number) => void
  draw: (order: number) => Promise<string>
  reveal: (order: number) => Promise<void>
  question: (order: number, studentId: string, continueGame: () => void) => void
  done: () => void
  failure: (error: unknown) => void
}

export class Yard extends Phaser.Scene {
  private actors: Actor[] = []
  private byId = new Map<string, Actor>()
  private round!: Round
  private meteor!: Phaser.GameObjects.Graphics
  private effects!: Phaser.GameObjects.Particles.ParticleEmitter
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter
  private music?: SuspenseMusic
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter
  private cells = new Map<number, Actor[]>()
  private countdown = 0
  private stopped = false
  private paused = false
  private meteorPath?: MeteorPath
  private targetRun?: { x: number; y: number; endX: number; endY: number }
  private targetActor?: Actor
  private drawRequested = false
  private audio?: AudioContext
  private shout?: AudioBuffer
  private speech: { text: Phaser.GameObjects.Text; actor?: Actor; until: number }[] = []

  constructor(private roster: Student[], private session: Session, private eventsOut: SceneEvents, audio?: AudioContext) {
    super('schoolyard')
    this.audio = audio
    if (audio && session.settings.sound && session.settings.music !== 'mp3') this.music = new SuspenseMusic(audio, session.settings.music)
  }

  preload() {
    this.load.image('schoolyard', asImage(schoolyards[this.session.schoolTheme] ?? schoolyards.rural))
    const variants = new Map(this.roster.map((student) => [characterKey(student.characterVariant, student.gender), student]))
    for (const [variant, student] of variants) {
      const textures = parts(student.characterVariant, student.gender)
      for (const [name, source] of Object.entries(textures)) { if (name !== 'preview') this.load.image(variant + '-' + name, asImage(source)) }
      this.load.image(variant + '-scared', asImage(parts(student.characterVariant, student.gender, true).head))
      this.load.image(variant + '-dazed', asImage(parts(student.characterVariant, student.gender, 'dazed').head))
    }
  }

  create() {
    this.add.image(0, 0, 'schoolyard').setOrigin(0)
    const { x, y, width, height } = schoolSign
    const sign = this.add.text(x + width / 2, y + height / 2, this.session.schoolName, {
      fontFamily: '"Segoe UI", sans-serif', fontSize: '17px', fontStyle: 'bold',
      color: '#713c2f', align: 'center', padding: { top: 2, bottom: 2 },
      wordWrap: { width: width - 16, useAdvancedWrap: true },
    }).setOrigin(0.5).setResolution(2)
    for (let fontSize = 16; fontSize >= 9 && (sign.height > height - 6 || sign.width > width - 16); fontSize--) {
      sign.setFontSize(fontSize)
    }
    sign.setScale(Math.min(1, (width - 16) / sign.width, (height - 6) / sign.height))
    const dot = this.make.graphics({ x: 0, y: 0 }, false)
    dot.fillStyle(0xffffff).fillCircle(5, 5, 5).generateTexture('particle', 10, 10)
    dot.destroy()
    this.meteor = this.add.graphics().setDepth(2000)
    this.effects = this.add.particles(0, 0, 'particle', {
      emitting: false, lifespan: { min: 280, max: 660 }, gravityY: 330,
      speed: { min: 95, max: 380 }, angle: { min: 188, max: 352 },
      scale: { start: 1.5, end: 0.12 }, alpha: { start: 0.95, end: 0 },
      tint: [0xffdf83, 0xff9667, 0xf9f5d8, 0xeab399, 0xffc964],
    }).setDepth(1990)
    this.smoke = this.add.particles(0, 0, 'particle', {
      emitting: false, lifespan: { min: 420, max: 900 }, gravityY: -46,
      speed: { min: 20, max: 42 }, angle: { min: 230, max: 310 },
      scale: { start: 0.7, end: 1.9 }, alpha: { start: 0.65, end: 0 },
      tint: [0x473b52, 0x635564, 0x9b8586],
    }).setDepth(1989)
    this.dust = this.add.particles(0, 0, 'particle', {
      emitting: false, lifespan: { min: 250, max: 470 }, gravityY: -34,
      speed: { min: 7, max: 25 }, scale: { start: 0.68, end: 1.65 },
      alpha: { start: 0.48, end: 0 }, tint: [0xffe6c5, 0xd7a88f],
    }).setDepth(2)
    this.speech = [0, 1].map(() => ({
      text: this.add.text(0, 0, '', {
        fontFamily: '"Segoe UI", sans-serif', fontSize: '14px', fontStyle: 'bold',
        color: '#392e48', backgroundColor: '#fff7e5', padding: { x: 7, y: 4 },
      }).setDepth(2005).setOrigin(0.5, 1).setResolution(2).setVisible(false),
      until: 0,
    }))
    if (this.audio) {
      const encoded = helpShout.slice(helpShout.indexOf(',') + 1)
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      void this.audio.decodeAudioData(bytes.buffer).then((buffer) => { this.shout = buffer }).catch(() => undefined)
    }
    const placed: {x: number; y: number}[] = []
    const revealed = this.session.results.filter((result) => result.selectedAt)
    const picked = new Set(revealed.map((result) => result.studentId))
    const running = this.roster.filter((student) => this.session.settings.repeatStudents || !picked.has(student.id))
    const scale = Phaser.Math.Clamp(Math.sqrt(65 / Math.max(running.length, 1)), 0.49, 1.14)
    running.forEach((student) => {
      let x = 0, y = 0
      for (let attempts = 0; attempts < 18; attempts++) {
        y = Phaser.Math.Between(402, 625)
        const left = this.leftEdge(y)
        x = Phaser.Math.Between(left, fieldWidth - left)
        if (placed.every((p) => Math.hypot(p.x - x, (p.y - y) * 1.5) > 38 * scale)) break
      }
      placed.push({ x, y })
      const actor = new Actor(this, student.id, characterKey(student.characterVariant, student.gender), student.fullName, student.gender, x, y)
      actor.baseScale = scale
      this.actors.push(actor)
      this.byId.set(student.id, actor)
    })
    this.round = new Round({
      count: this.session.targetCount, revealed: revealed.length,
      lead: this.session.settings.lead, gap: this.session.settings.gap, speed: this.session.settings.speed,
    }, (phase, order) => this.enter(phase, order))
    this.hold(this.paused)
  }

  hold(paused: boolean) {
    this.paused = paused
    if (!this.round) return
    if (paused) { this.music?.pause(); this.scene.pause() }
    else this.scene.resume()
  }

  private leftEdge(y: number) { return Math.round(160 - (y - 400) * 0.32) }

  private drawTarget() {
    this.drawRequested = true
    void this.eventsOut.draw(this.round.order).then((id) => {
      const actor = this.byId.get(id)
      if (!actor?.object.visible) throw new Error('Không tìm thấy nhân vật của học sinh được chọn.')
      this.targetActor = actor
      this.round.aim()
    }).catch((error: unknown) => {
      this.stopped = true
      this.eventsOut.failure(error)
    })
  }

  private tone(start: number, end: number, duration: number, gain = 0.065, type: OscillatorType = 'sine') {
    if (!this.audio || this.audio.state !== 'running') return
    const t = this.audio.currentTime
    const osc = this.audio.createOscillator()
    const volume = this.audio.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(start, t)
    osc.frequency.exponentialRampToValueAtTime(end, t + duration)
    volume.gain.setValueAtTime(gain * 1.65, t)
    volume.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(volume)
    volume.connect(this.audio.destination)
    osc.start(t)
    osc.stop(t + duration)
  }

  private say(slot: number, actor: Actor, words: string, duration: number) {
    const bubble = this.speech[slot]
    bubble.actor = actor
    bubble.until = this.time.now + duration
    bubble.text.setText(words)
  }

  private converse(phase: Phase) {
    const speakers = this.actors.filter((actor) => actor.object.visible && actor.state !== 'Dazed')
    const speaker = Phaser.Utils.Array.GetRandom(speakers)
    if (!speaker || speakers.length < 2) return
    const { x, y } = speaker.object
    let friend = speaker
    let nearest = Infinity
    for (const actor of speakers) {
      if (actor === speaker) continue
      const distance = Phaser.Math.Distance.Squared(x, y, actor.object.x, actor.object.y)
      if (distance < nearest) { friend = actor; nearest = distance }
    }
    const [line, reply] = Phaser.Utils.Array.GetRandom(conversations)
    this.say(0, speaker, line, 1150)
    this.time.delayedCall(1150, () => {
      if (this.round.phase === phase) this.say(1, friend, reply, 1120)
    })
  }

  private cryForHelp() {
    const audio = this.audio
    if (!audio || audio.state !== 'running' || !this.shout) return
    for (const [delay, pitch] of [[0, 1.1], [0.33, 0.92]]) {
      const source = audio.createBufferSource()
      const gain = audio.createGain()
      source.buffer = this.shout
      source.playbackRate.value = pitch
      gain.gain.value = 0.62
      source.connect(gain).connect(audio.destination)
      source.onended = () => { source.disconnect(); gain.disconnect() }
      source.start(audio.currentTime + delay)
    }
  }

  private aimMeteor(endX: number, endY: number) {
    const curved = shouldCurveMeteor(this.session.settings.meteorStyle)
    const direction = endX < 280 ? 1 : endX > fieldWidth - 280 ? -1 : Phaser.Math.Between(0, 1) ? 1 : -1
    const range = curved ? 80 : 330
    this.meteorPath = {
      startX: Phaser.Math.Clamp(endX + Phaser.Math.Between(-range, range), -30, fieldWidth + 30),
      startY: -26, endX, endY,
      bend: curved ? direction * Phaser.Math.Between(160, 235) : 0,
    }
  }

  private enter(phase: Phase, order: number) {
    const target = this.targetActor
    this.eventsOut.phase(phase)
    switch (phase) {
      case 'COUNTDOWN':
        this.countdown = 0
        for (const actor of this.actors) actor.state = 'Walk'
        this.converse(phase)
        break
      case 'RUNNING':
        for (const actor of this.actors) actor.state = 'Run'
        this.converse(phase)
        break
      case 'METEOR_WARNING':
        this.targetActor = undefined
        this.targetRun = undefined
        this.drawRequested = false
        for (const bubble of this.speech) bubble.actor = undefined
        {
          const runners = this.actors.filter((actor) => actor.object.visible && actor.state !== 'Dazed')
          for (const actor of runners) {
            actor.state = 'Panic'
            actor.heading += Phaser.Math.FloatBetween(-2.1, 2.1)
            actor.rethink = Phaser.Math.FloatBetween(0.1, 0.35)
          }
          const calls = ['Cứu với!', 'Chạy mau!']
          Phaser.Utils.Array.Shuffle(runners).slice(0, 2).forEach((actor, index) => this.say(index, actor, calls[index], 1220))
        }
        this.tone(500, 820, 0.35, 0.045, 'triangle')
        this.cryForHelp()
        break
      case 'METEOR_FALLING':
        for (const actor of this.actors) if (actor.state === 'Panic') actor.state = 'ScaredRun'
        if (target) {
          const { x, y } = target.object
          const vx = Math.cos(target.heading)
          const vy = Math.sin(target.heading)
          const distance = 148 * target.pace * fallDuration * slowMotionScale / 1000
          const endY = Phaser.Math.Clamp(y + (y > 580 ? -Math.abs(vy) : y < 444 ? Math.abs(vy) : vy) * distance * 0.66, 391, 633)
          const left = Math.max(this.leftEdge(y), this.leftEdge(endY))
          const right = fieldWidth - left
          const dx = x < left + distance ? Math.abs(vx) : x > right - distance ? -Math.abs(vx) : vx
          const endX = Phaser.Math.Clamp(x + dx * distance, this.leftEdge(endY), fieldWidth - this.leftEdge(endY))
          this.targetRun = { x, y, endX, endY }
          this.aimMeteor(endX, endY - 31 * this.actorScale(target, endY))
        } else if (this.round.nearMiss) {
          // Both margins are outside the runners' movement bounds at this depth.
          this.aimMeteor(Phaser.Math.RND.sign() < 0 ? 72 : fieldWidth - 72, 466)
        }
        this.tone(145, 540, 0.88, 0.05, 'triangle')
        break
      case 'MISS':
        this.meteor.clear()
        if (this.meteorPath) this.impact(this.meteorPath.endX, this.meteorPath.endY, false)
        {
          const runner = Phaser.Utils.Array.GetRandom(this.actors.filter((actor) => actor.object.visible && actor.state !== 'Dazed'))
          if (runner) this.say(0, runner, 'Suýt nữa!', 990)
        }
        break
      case 'IMPACT':
        this.meteor.clear()
        if (!target) {
          this.stopped = true
          this.eventsOut.failure('Không tìm thấy nhân vật của học sinh được chọn.')
          return
        }
        this.tweens.add({
          targets: this.actors.filter((actor) => actor !== target && actor.object.visible).map((actor) => actor.object),
          alpha: 0.24, duration: 145, ease: 'Sine.Out',
        })
        this.moveTarget(target, 1)
        target.scorch()
        target.body.stop()
        this.impact(target.object.x, target.object.y, true)
        break
      case 'REVEAL': {
        const confirm = () => {
          this.eventsOut.reveal(order).then(() => this.round.acknowledge()).catch((error: unknown) => {
            this.stopped = true
            this.eventsOut.failure(error)
          })
        }
        if (target && this.session.settings.withQuestions) {
          const camera = this.cameras.main
          camera.pan(target.object.x, target.object.y - 48, 520, Phaser.Math.Easing.Sine.InOut)
          camera.zoomTo(2.3, 520, Phaser.Math.Easing.Sine.InOut)
          this.time.delayedCall(540, () => this.eventsOut.question(order, target.id, confirm))
        } else {
          if (target && !this.session.settings.repeatStudents) {
            this.tweens.add({ targets: target.object, alpha: 0, delay: 500, duration: 320, onComplete: () => target.object.setVisible(false) })
          }
          confirm()
        }
        break
      }
      case 'NEXT_TARGET':
        if (this.session.settings.withQuestions) {
          const camera = this.cameras.main
          camera.pan(camera.width / 2, camera.height / 2, 440, Phaser.Math.Easing.Sine.InOut)
          camera.zoomTo(1, 440, Phaser.Math.Easing.Sine.InOut)
        }
        if (this.session.settings.repeatStudents) target?.recover()
        else if (target && this.session.settings.withQuestions) target.object.setVisible(false)
        this.tweens.add({
          targets: this.actors.filter((actor) => actor.state !== 'Dazed').map((actor) => actor.object),
          alpha: 1, duration: 190, ease: 'Sine.Out',
        })
        for (const actor of this.actors) if (actor.state === 'ScaredRun') actor.state = 'Run'
        break
      case 'FINISHED':
        this.music?.pause()
        this.eventsOut.done()
        break
    }
  }

  private impact(x: number, y: number, hit: boolean) {
    const high = this.session.settings.quality === 'high'
    const flame = this.add.graphics().setPosition(x, y - 14).setDepth(1992)
    flame.fillStyle(0xf56a42, 0.92).fillPoints([
      {x: -24, y: 10}, {x: -30, y: -12}, {x: -18, y: -28}, {x: -14, y: -12},
      {x: 1, y: -46}, {x: 10, y: -22}, {x: 20, y: -33}, {x: 27, y: -5}, {x: 17, y: 10},
    ], true)
    flame.fillStyle(0xffc466, 0.95).fillPoints([
      {x: -14, y: 9}, {x: -18, y: -6}, {x: -6, y: -17}, {x: 0, y: -9},
      {x: 7, y: -25}, {x: 17, y: -7}, {x: 12, y: 9},
    ], true)
    this.tweens.add({ targets: flame, scale: 1.4, alpha: 0, duration: 390, onComplete: () => flame.destroy() })
    this.smoke.explode(high ? 12 : 6, x, y - 45)
    if (hit) this.time.addEvent({ delay: 185, repeat: 5, callback: () => this.smoke.emitParticleAt(x, y - 62, 2) })
    this.effects.explode(high ? 34 : 13, x, y)
    const ring = this.add.circle(x, y, 18, 0xffe3a0, 0.7).setScale(1, 0.43).setDepth(4)
    ring.setStrokeStyle(3, 0xfff7d7, 0.9)
    this.tweens.add({ targets: ring, scaleX: 4.7, scaleY: 1.65, alpha: 0, duration: 390, onComplete: () => ring.destroy() })
    for (let i = 0; hit && i < (high ? 6 : 3); i++) {
      const star = this.add.star(x, y - 29, 5, 4, 11, i % 2 ? 0xffab75 : 0xffe371).setDepth(1995)
      star.setStrokeStyle(2, 0xfff5cf)
      const angle = i * 1.07
      this.tweens.add({ targets: star, x: x + Math.cos(angle) * 72, y: y - 78 + Math.sin(angle) * 40,
        rotation: angle, scale: 0.5, alpha: 0, duration: 640, ease: 'Quad.Out', onComplete: () => star.destroy() })
    }
    if (this.session.settings.shake) this.cameras.main.shake(165, 0.005)
    this.cameras.main.flash(135, 255, 221, 164, false)
    this.tone(260, 42, 0.32, 0.11, 'triangle')
    this.tone(710, 220, 0.27, 0.04)
  }

  private approach(progress: number) {
    if (!this.meteorPath) return
    this.meteor.clear()
    const { x: mx, y: my, nx, ny, t } = meteorPosition(this.meteorPath, progress)
    const radius = 28 + t * 8
    const g = this.meteor
    const tail = (len: number, width: number, color: number, alpha: number) => {
      g.fillStyle(color, alpha).beginPath()
      g.moveTo(mx - ny * width, my + nx * width)
      g.lineTo(mx - nx * len + ny * width * 0.17, my - ny * len - nx * width * 0.17)
      g.lineTo(mx + ny * width, my - nx * width)
      g.closePath().fillPath()
    }
    tail(250, radius, 0xe96a61, 0.55)
    tail(167, radius * 0.84, 0xff9863, 0.9)
    tail(104, radius * 0.52, 0xffe184, 0.94)
    g.fillStyle(0xff9256, 0.27).fillCircle(mx, my, radius * 1.5)
    g.fillStyle(0xffd48a, 0.91).fillCircle(mx, my, radius * 1.13)
    g.fillStyle(0x713a58).beginPath()
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9 + t
      const r = radius * (i % 3 === 0 ? 0.83 : 1)
      const px = mx + Math.cos(angle) * r, py = my + Math.sin(angle) * r
      if (i === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.closePath().fillPath()
    g.fillStyle(0xe17b69).fillCircle(mx + radius * 0.27, my - radius * 0.26, radius * 0.36)
    g.fillStyle(0xab5c66).fillCircle(mx - radius * 0.35, my + radius * 0.12, radius * 0.24)
    g.lineStyle(2, 0xfbb887).strokeCircle(mx + radius * 0.29, my - radius * 0.24, radius * 0.36)
    if (this.session.settings.quality === 'high' && Math.random() < 0.65) this.effects.emitParticleAt(mx - nx * 28, my - ny * 28, 1)
  }

  update(_time: number, delta: number) {
    if (!this.round || this.stopped || this.paused) return
    this.music?.update(this.round.phase === 'METEOR_WARNING' || this.round.phase === 'METEOR_FALLING')
    const dt = Math.min(delta, 48) / 1000
    this.round.advance(dt * 1000)
    if (this.round.phase === 'FINISHED') return
    const motionScale = this.round.phase === 'METEOR_FALLING' ? slowMotionScale : 1
    const step = dt * this.session.settings.speed * motionScale
    if (this.round.phase === 'COUNTDOWN') {
      const count = 3 - Math.floor(this.round.progress * 3)
      if (count !== this.countdown) {
        this.countdown = count
        this.eventsOut.phase('COUNTDOWN', count)
        this.tone(510, 410, 0.16)
      }
    }
    this.cells.clear()
    for (const actor of this.actors) {
      if (!actor.object.visible || actor.state === 'Dazed') continue
      const { x, y } = actor.object
      const key = Math.floor(x / 42) + 64 * Math.floor(y / 42)
      const cell = this.cells.get(key)
      if (cell) cell.push(actor)
      else this.cells.set(key, [actor])
    }
    for (const actor of this.actors) {
      if (!actor.object.visible) continue
      const runningToImpact = actor === this.targetActor && this.round.phase === 'METEOR_FALLING'
      if (runningToImpact) this.moveTarget(actor, this.round.progress)
      else this.steer(actor, step, motionScale)
      const { y } = actor.object
      actor.object.setDepth(actor.state === 'Dazed' ? 1900 : y + 5).setScale(this.actorScale(actor, y))
      actor.animate(step, runningToImpact && this.targetRun ? (this.targetRun.endX - this.targetRun.x) * 2 : undefined)
    }
    for (const { actor, text, until } of this.speech) {
      text.setVisible(!!actor?.object.visible && this.time.now < until)
      if (actor && text.visible) text.setPosition(
        Phaser.Math.Clamp(actor.object.x, text.width / 2 + 6, fieldWidth - text.width / 2 - 6),
        actor.object.y + (actor.label.y - actor.label.displayHeight) * actor.object.scaleY - 4,
      )
    }
    if (this.round.phase === 'METEOR_WARNING' && !this.round.nearMiss && !this.drawRequested && this.round.elapsed >= drawTime) {
      this.drawTarget()
    }
    if (this.round.phase === 'METEOR_FALLING') this.approach(this.round.progress)
  }

  private actorScale(actor: Actor, y: number) {
    return actor.baseScale * (0.77 + (y - 400) / 660)
  }

  private moveTarget(actor: Actor, progress: number) {
    if (!this.targetRun) return
    const { x, y, endX, endY } = this.targetRun
    actor.body.reset(Phaser.Math.Linear(x, endX, progress), Phaser.Math.Linear(y, endY, progress))
  }

  private steer(actor: Actor, dt: number, motionScale: number) {
    if (actor.state === 'Idle' || actor.state === 'Dazed') return
    const { x, y } = actor.object
    const left = this.leftEdge(y)
    const right = fieldWidth - left
    const boundedX = Phaser.Math.Clamp(x, left, right)
    const boundedY = Phaser.Math.Clamp(y, 391, 633)
    if (boundedX !== x || boundedY !== y) actor.body.reset(boundedX, boundedY)
    actor.rethink -= dt
    if (actor.rethink < 0) {
      actor.rethink = actor.state === 'Panic' ? Phaser.Math.FloatBetween(0.17, 0.42) : Phaser.Math.FloatBetween(0.45, 1.75)
      actor.heading += (Math.random() - 0.5) * (Math.random() < 0.22 ? 7 : 2.3)
      actor.pace = 0.73 + Math.random() * 0.55
    }
    if (x < left + 12 || x > right - 12 || y < 401 || y > 623) {
      const vx = Math.cos(actor.heading)
      const vy = Math.sin(actor.heading)
      actor.heading = Math.atan2(y < 401 ? Math.abs(vy) + 0.12 : y > 623 ? -Math.abs(vy) - 0.12 : vy,
        x < left + 12 ? Math.abs(vx) + 0.16 : x > right - 12 ? -Math.abs(vx) - 0.16 : vx)
    }
    let dx = Math.cos(actor.heading)
    let dy = Math.sin(actor.heading)
    const ix = Math.floor(x / 42), iy = Math.floor(y / 42)
    const space = 46 * actor.baseScale
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        for (const other of this.cells.get(ix + i + 64 * (iy + j)) ?? []) {
          if (other === actor) continue
          const ox = x - other.object.x, oy = (y - other.object.y) * 1.4
          const distance = Math.hypot(ox, oy)
          if (distance > 0.01 && distance < space) {
            const push = (1 - distance / space) * 2.1 / distance
            dx += ox * push
            dy += oy * push
          }
        }
      }
    }
    const max = Math.max(1, Math.hypot(dx, dy))
    const pace = (actor.state === 'Walk' ? 38 : actor.state === 'Panic' ? 218 : actor.state === 'Run' ? 108 : 148)
      * actor.pace * this.session.settings.speed * motionScale / max
    const smooth = Math.min(dt * 10 / motionScale, 1)
    actor.body.setVelocity(Phaser.Math.Linear(actor.body.velocity.x, dx * pace, smooth),
      Phaser.Math.Linear(actor.body.velocity.y, dy * pace * 0.66, smooth))
    if ((actor.state === 'ScaredRun' || actor.state === 'Panic') && this.session.settings.quality === 'high') {
      actor.dustAt -= dt
      if (actor.dustAt <= 0) {
        this.dust.emitParticleAt(x - Math.sign(actor.body.velocity.x) * 10, y, 1)
        actor.dustAt = 0.13 + Math.random() * 0.23
      }
    }
  }
}


