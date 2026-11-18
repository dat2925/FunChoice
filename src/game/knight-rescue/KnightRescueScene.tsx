import Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import type { GameState } from './GameState'
import { CatCharacter, EnemyManager, KnightCharacter } from './GameAnimations'

const zones = ['Rừng phép thuật', 'Cầu gỗ cổ', 'Hang động bí ẩn', 'Đường đến lâu đài', 'Lâu đài quái vật']
export class KnightRescueScene extends Phaser.Scene {
  snapshot: GameState; knight!: KnightCharacter; enemy!: EnemyManager; cat!: CatCharacter
  chest!: Phaser.GameObjects.Container; cage!: Phaser.GameObjects.Container; key!: Phaser.GameObjects.Text
  zone!: Phaser.GameObjects.Text; previous = ''; travelX = 180; ready: () => void
  constructor(state: GameState, ready: () => void) { super('knight-rescue'); this.snapshot = state; this.ready = ready }
  create() {
    const colors = [0x225f62, 0x5b8181, 0x55476e, 0x455b77, 0x44395f]
    this.cameras.main.setBounds(0, 0, 8400, 420)
    for (let layer = 0; layer < 3; layer++) {
      const g = this.add.graphics().setScrollFactor(.15 + layer * .25)
      for (let i = 0; i < 70; i++) {
        const x = i * 160 + layer * 52; const y = 180 + layer * 60
        g.fillStyle(colors[Math.min(4, Math.floor(i / 14))], .35 + layer * .2)
        g.fillTriangle(x - 120, 350, x + 70, y - 130 - (i % 3) * 30, x + 230, 350)
        if (layer === 2) { g.fillStyle(0x224d50, .9); g.fillRoundedRect(x + 60, y - 65, 15, 150, 6); g.fillStyle(0x3d8980, .9); g.fillEllipse(x + 67, y - 80, 110, 115) }
      }
    }
    for (let x = 0; x < 8500; x += 80) {
      this.add.rectangle(x, 384, 81, 75, 0x536a56)
      this.add.rectangle(x, 349, 81, 13, x > 1600 && x < 3300 ? 0xc6a578 : 0x8fba74)
      if (x > 1600 && x < 3300) { this.add.rectangle(x, 325, 8, 65, 0x98765d); this.add.rectangle(x, 306, 85, 6, 0xccad86) }
    }
    // Cave stalactites, glowing crystals and castle-road lanterns distinguish the five areas.
    for (let x = 3300; x < 4850; x += 140) {
      this.add.triangle(x, 45, 0, 0, 80, 0, 45, 80 + x % 70, 0x4c4863).setDepth(3)
      this.add.triangle(x + 40, 325, 0, 35, 15, 0, 30, 35, 0x94d8d2).setDepth(4)
      this.add.circle(x + 55, 330, 20, 0x98e8e1, .1).setDepth(4)
    }
    for (let x = 5000; x < 6600; x += 280) {
      this.add.rectangle(x, 300, 8, 95, 0x49536b)
      this.add.rectangle(x, 249, 26, 36, 0xffd58c).setStrokeStyle(4, 0x697087)
      this.add.circle(x, 249, 40, 0xffd58c, .12)
    }
    const castleX = 6900
    this.add.rectangle(castleX + 250, 210, 480, 290, 0x656788).setStrokeStyle(5, 0x9c9bb1)
    for (const dx of [10, 170, 330, 490]) {
      this.add.rectangle(castleX + dx, 155, 85, 290, 0x7e819f)
      this.add.triangle(castleX + dx, 0, 0, 70, 45, 0, 90, 70, 0x514475)
      this.add.rectangle(castleX + dx, 130, 22, 40, 0xffd58c)
    }
    this.add.rectangle(castleX + 250, 290, 110, 130, 0x313650)
    this.knight = new KnightCharacter(this, 180, 318).setDepth(10)
    this.enemy = new EnemyManager(this, 780, 330).setDepth(9)
    this.chest = this.add.container(780, 325, [this.add.rectangle(0, 0, 78, 47, 0xb57e55).setStrokeStyle(4, 0xffd883), this.add.rectangle(0, -25, 80, 21, 0xf1bd6b).setStrokeStyle(3, 0xffe3a0), this.add.rectangle(0, -6, 12, 20, 0xffebaa)]).setDepth(9)
    this.cat = new CatCharacter(this, 740, 322).setDepth(11)
    this.cage = this.add.container(740, 296, [-34, -17, 0, 17, 34].map(x => this.add.rectangle(x, 0, 5, 83, 0xd6e4ee))).setDepth(12)
    this.key = this.add.text(260, 230, '⚿', { fontSize: '55px', color: '#ffe49c' }).setDepth(15).setVisible(false)
    this.zone = this.add.text(600, 32, '', { fontFamily: 'sans-serif', fontSize: '23px', color: '#eef7de', backgroundColor: '#263c5966', padding: { x: 22, y: 9 } }).setOrigin(.5).setScrollFactor(0).setDepth(20)
    for (let i = 0; i < 26; i++) {
      const mote = this.add.circle(i * 48, 70 + (i * 37) % 240, 2 + i % 3, 0xf4e4a4, .5).setScrollFactor(0).setDepth(5)
      this.tweens.add({ targets: mote, y: mote.y + 45, x: mote.x + 30, alpha: .1, duration: 1900 + i * 80, yoyo: true, repeat: -1 })
    }
    this.ready()
  }
  sparkle(x: number, y: number, color: number, count = 22) {
    for (let i = 0; i < count; i++) {
      const p = this.add.star(x, y, 4, 3, 7, color).setDepth(30)
      this.tweens.add({ targets: p, x: x + Phaser.Math.Between(-160, 160), y: y + Phaser.Math.Between(-130, 60), angle: 180, alpha: 0, duration: 1100, onComplete: () => p.destroy() })
    }
  }
  update(time: number, delta: number) {
    if (!this.knight) return
    const s = this.snapshot
    if (s.paused) { this.tweens.pauseAll(); return }
    this.tweens.resumeAll()
    const target = 180 + s.index / Math.max(1, s.encounters.length - 1) * 6500
    if (s.phase === 'travel' || s.phase === 'rescue') this.travelX = Phaser.Math.Linear(this.travelX, s.phase === 'rescue' ? 7100 : target, Math.min(1, delta / 350))
    else this.travelX = target
    this.knight.x = this.travelX
    this.knight.y = 318 + (s.phase === 'travel' ? Math.sin(time / 85) * 3 : 0)
    this.knight.run(time, s.phase === 'travel')
    const zoom = this.scale.width / 1200
    this.cameras.main.setZoom(zoom).centerOn(this.travelX + 350, 275)
    const kind = s.encounters[s.index].kind
    const visible = s.phase === 'question' || s.phase === 'travel' || s.phase === 'feedback'
    this.enemy.setVisible(visible && kind !== 'chest').setPosition(this.travelX + 500, 325 + Math.sin(time / 220) * 6)
    this.enemy.setScale(kind === 'boss' ? 1.6 : 1)
    this.chest.setVisible(visible && kind === 'chest').setX(this.travelX + 500)
    const rescue = s.phase === 'rescue' || s.phase === 'completed'
    this.cat.setVisible(rescue || s.phase === 'failed'); this.cage.setVisible((rescue && s.phaseMs > 3500) || s.phase === 'failed')
    const run = Phaser.Math.Clamp((3500 - s.phaseMs) / 1700, 0, 1)
    const jump = Phaser.Math.Clamp((1800 - s.phaseMs) / 1300, 0, 1)
    this.cat.x = this.travelX + (s.phase === 'completed' ? 25 : 330 - run * 240 - jump * 65)
    this.cat.y = s.phase === 'completed' ? 267 : 322 - jump * 55 - Math.sin(jump * Math.PI) * 85
    if (rescue && run > 0 && jump === 0) this.cat.y += Math.sin(time / 70) * 5
    this.cage.setAlpha(rescue ? Phaser.Math.Clamp((s.phaseMs - 3000) / 500, 0, 1) : 1)
    if (rescue && jump === 1 || s.phase === 'completed') this.knight.sword.setAngle(-45)
    this.cage.setX(this.travelX + 330)
    this.zone.setText(zones[rescue || kind === 'boss' ? 4 : Math.min(4, Math.floor(s.wavesDone / s.config.waves * 5))])
    this.zone.setPosition(this.scale.width / 2, this.scale.height / 2 + (28 - this.scale.height / 2) / zoom).setScale(1 / zoom)
    this.key.setVisible(rescue && s.phaseMs > 2000).setPosition(this.travelX + 130, 230 + Math.sin(time / 200) * 9)
    const signature = `${s.index}-${s.phase}`
    if (signature !== this.previous) {
      this.previous = signature
      this.knight.setAngle(0).setAlpha(1)
      if (s.phase === 'feedback') {
        const a = s.answers.at(-1)!
        if (a.correct) {
          if (kind === 'chest') this.tweens.add({ targets: this.chest.list[1], angle: -25, y: -45, duration: 650 })
          this.tweens.add({ targets: this.knight.sword, angle: 115, duration: 180, yoyo: true, repeat: 1 })
          this.sparkle(this.travelX + 490, 270, kind === 'chest' ? 0xffdc80 : 0xaff5e8, s.combo >= 5 ? 60 : 22)
          this.tweens.add({ targets: kind === 'chest' ? this.chest : this.enemy, alpha: 0, duration: 1500 })
          if (s.combo >= 3) this.cameras.main.flash(170, 180, 240, 255, false)
        } else if (kind !== 'chest' || s.config.hard) {
          this.tweens.add({ targets: this.enemy, angle: -22, duration: 220, yoyo: true, repeat: 1 })
          this.tweens.add({ targets: this.knight, alpha: .3, duration: 130, yoyo: true, repeat: 5 })
          this.cameras.main.shake(200, .004)
        }
      } else { this.enemy.alpha = 1; this.chest.alpha = 1; const lid = this.chest.list[1] as Phaser.GameObjects.Rectangle; lid.setAngle(0).setY(-25) }
      if (s.phase === 'failed') this.tweens.add({ targets: this.knight, angle: -85, duration: 600 })
      if (s.phase === 'completed') this.sparkle(this.travelX + 60, 190, 0xffd686, 100)
    }
  }
}
export default function KnightCanvas({ state, ready }: { state: GameState; ready: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<KnightRescueScene | null>(null)
  const initial = useRef(state)
  useEffect(() => {
    if (!host.current) return
    scene.current = new KnightRescueScene(initial.current, ready)
    const game = new Phaser.Game({ parent: host.current, type: Phaser.AUTO, width: 1200, height: 420,
      backgroundColor: '#9cc8c3', scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      audio: { noAudio: true }, scene: scene.current, render: { antialias: true } })
    return () => { game.destroy(true); scene.current = null }
  }, [ready])
  useEffect(() => { if (scene.current) scene.current.snapshot = state }, [state])
  return <div className="knight-canvas" ref={host} role="img" aria-label="Hiệp sĩ chạy qua rừng, cầu gỗ, hang động đến lâu đài giải cứu mèo"/>
}
