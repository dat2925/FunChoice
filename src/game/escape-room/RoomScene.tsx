import Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import roomArt from '../../assets/escape-classroom.png'
import { objects, roomHeight, roomWidth, type Item, type RoomObject } from './model'

const pieces = {
  drawer: [520, 716, 146, 67], book: [140, 293, 24, 58], painting: [1020, 194, 246, 186],
  safe: [1078, 503, 161, 168], door: [1380, 216, 250, 513],
} as const

class ClassroomScene extends Phaser.Scene {
  private facets = new Map<keyof typeof pieces, Phaser.GameObjects.Image>()
  private openings = new Map<keyof typeof pieces, Phaser.GameObjects.Graphics>()
  private outline?: Phaser.GameObjects.Graphics
  private roomReady = false
  private current: Item[] = []
  private focused?: RoomObject

  constructor(private ready: () => void, private unavailable: () => void) { super('escape-classroom') }

  preload() {
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, this.unavailable)
    this.load.image('classroom', roomArt)
  }

  create() {
    if (!this.textures.exists('classroom')) return
    this.add.image(0, 0, 'classroom', '__BASE').setOrigin(0)
    const texture = this.textures.get('classroom')
    for (const [key, rect] of Object.entries(pieces) as [keyof typeof pieces, readonly [number, number, number, number]][]) {
      const [x, y, width, height] = rect
      texture.add(key, 0, x, y, width, height)
      const opening = this.add.graphics().fillStyle(0x21160f, .96).fillRoundedRect(x + 2, y + 2, width - 4, height - 4, 5).setVisible(false)
      this.openings.set(key, opening)
      this.facets.set(key, this.add.image(x, y, 'classroom', key).setOrigin(0))
    }
    this.outline = this.add.graphics()
    const seconds = this.add.graphics({ x: 857, y: 244 }).lineStyle(1.8, 0x8c481c, .85)
      .beginPath().moveTo(0, 5).lineTo(0, -62).strokePath()
    this.tweens.add({ targets: seconds, angle: 360, ease: 'Linear', duration: 60_000, repeat: -1 })
    this.roomReady = true
    this.applyItems([], this.current, true)
    if (this.focused) this.focus(this.focused)
    this.game.events.once(Phaser.Core.Events.POST_RENDER, this.ready)
  }

  hover(target?: RoomObject) {
    this.outline?.clear()
    if (target && this.outline) {
      const [x, y, w, h] = objects[target].bounds
      this.outline.lineStyle(3, 0xffd280, .78).strokeRoundedRect(x, y, w, h, 15)
    }
  }

  focus(target?: RoomObject) {
    this.focused = target
    if (!this.roomReady) return
    const camera = this.cameras.main
    const [x, y, w, h] = target ? objects[target].bounds : [0, 0, roomWidth, roomHeight]
    const zoom = target === 'door' ? 1.15 : target ? 1.075 : 1
    const centerX = Phaser.Math.Clamp(x + w / 2, roomWidth / (2 * zoom), roomWidth - roomWidth / (2 * zoom))
    const centerY = Phaser.Math.Clamp(y + h / 2, roomHeight / (2 * zoom), roomHeight - roomHeight / (2 * zoom))
    camera.pan(centerX, centerY, 270, 'Cubic.easeOut', true)
    camera.zoomTo(zoom, 270, 'Cubic.easeOut', true)
    if (!this.current.includes('paintingNote')) {
      if (target === 'painting') this.open('painting', { x: 1063, angle: -13 }, false)
      else {
        const painting = this.facets.get('painting')
        if (painting && (painting.x !== pieces.painting[0] || painting.angle !== 0 || this.tweens.isTweening(painting))) {
          this.tweens.killTweensOf(painting)
          this.tweens.add({ targets: painting, x: pieces.painting[0], angle: 0, duration: 270,
            onComplete: () => { if (!this.current.includes('paintingNote')) this.openings.get('painting')?.setVisible(false) } })
        }
      }
    }
    if (target === 'book' && !this.current.includes('paper7')) {
      const book = this.facets.get('book')
      if (book) {
        book.setTint(0xffdb85)
        this.tweens.killTweensOf(book)
        this.tweens.add({ targets: book, angle: 7, duration: 105, yoyo: true, repeat: 2, onComplete: () => book.clearTint() })
      }
    }
  }

  private open(key: keyof typeof pieces, change: { x?: number; y?: number; angle?: number; scaleX?: number }, immediate: boolean) {
    const target = this.facets.get(key)
    if (!target) return
    this.openings.get(key)?.setVisible(true)
    this.tweens.killTweensOf(target)
    if (immediate) Object.assign(target, change)
    else this.tweens.add({ targets: target, ...change, duration: 480, ease: 'Cubic.easeOut' })
  }

  private applyItems(previous: Item[], current: Item[], immediate: boolean) {
    const acquired = (item: Item) => current.includes(item) && !previous.includes(item)
    if (acquired('paper4')) this.open('drawer', { y: 741 }, immediate)
    if (acquired('paper7')) this.open('book', { angle: -22, x: 148, y: 284 }, immediate)
    if (acquired('paintingNote')) this.open('painting', { x: 1063, angle: -13 }, immediate)
    if (acquired('key')) this.open('safe', { scaleX: .24, x: 1200 }, immediate)
    if (!immediate && acquired('paper2')) {
      const halo = this.add.circle(859, 243, 85, 0xffca62, .32).setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({ targets: halo, scale: 1.42, alpha: 0, duration: 650, onComplete: () => halo.destroy() })
    }
  }

  sync(inventory: Item[]) {
    const previous = this.current
    this.current = inventory
    if (this.roomReady) this.applyItems(previous, inventory, false)
  }

  openDoor() {
    if (!this.roomReady) return
    this.focus('door')
    this.time.delayedCall(260, () => {
      this.facets.get('door')?.setDepth(2)
      this.open('door', { scaleX: .12 }, false)
      const light = this.add.graphics().fillStyle(0xffd78a, .9).fillRect(1383, 217, 241, 510).setDepth(1).setAlpha(0)
      this.tweens.add({ targets: light, alpha: .9, duration: 500 })
      this.cameras.main.fadeOut(790, 255, 225, 151)
    })
  }
}

export default function RoomScene({ inventory, focus, hover, escaped, ready, failed }: {
  inventory: Item[]; focus?: RoomObject; hover?: RoomObject; escaped: boolean; ready: () => void; failed: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ClassroomScene>(null)
  useEffect(() => {
    const room = new ClassroomScene(ready, failed)
    scene.current = room
    const game = new Phaser.Game({ parent: host.current!, type: Phaser.CANVAS, width: roomWidth, height: roomHeight,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: room,
      // Tauri permits same-origin image loads but restricts XHR to IPC.
      loader: { imageLoadType: 'HTMLImageElement' },
      transparent: true, audio: { noAudio: true }, input: { mouse: false, touch: false, keyboard: false } })
    return () => { scene.current = null; game.destroy(true) }
  }, [ready, failed])
  useEffect(() => { scene.current?.sync(inventory) }, [inventory])
  useEffect(() => { scene.current?.focus(focus) }, [focus])
  useEffect(() => { scene.current?.hover(hover) }, [hover])
  useEffect(() => { if (escaped) scene.current?.openDoor() }, [escaped])
  return <div className="escape-canvas" ref={host} aria-hidden="true"/>
}
