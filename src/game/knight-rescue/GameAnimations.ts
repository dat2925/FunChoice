import Phaser from 'phaser'

// Original vector artwork, generated locally. No downloaded textures or fonts.
export class KnightCharacter extends Phaser.GameObjects.Container {
  legs: Phaser.GameObjects.Rectangle[]; sword: Phaser.GameObjects.Container
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y); scene.add.existing(this)
    const ellipse = (x: number, y: number, w: number, h: number, color: number) => scene.add.ellipse(x, y, w, h, color)
    this.legs = [-12, 12].map(x => scene.add.rectangle(x, 0, 18, 32, 0x475575).setOrigin(.5, 0))
    this.add([ellipse(0, 32, 80, 15, 0x233e48).setAlpha(.25), scene.add.triangle(-23, -15, 0, 0, 0, 60, 46, 45, 0xe15b77), ...this.legs,
      scene.add.rectangle(0, -23, 49, 48, 0xaacbdf).setStrokeStyle(3, 0x435675), ellipse(0, -62, 62, 58, 0xdceaf4),
      scene.add.rectangle(5, -59, 45, 19, 0x415578), scene.add.rectangle(15, -60, 3, 12, 0xc8edf5),
      scene.add.rectangle(3, -93, 12, 22, 0xee6584), ellipse(-26, -20, 31, 39, 0x779dc6).setStrokeStyle(3, 0xe1c783)])
    this.sword = scene.add.container(27, -23, [scene.add.rectangle(0, -28, 9, 59, 0xe4faff).setStrokeStyle(2, 0x8fc3dd), scene.add.rectangle(0, -1, 28, 7, 0xf7cc75), scene.add.rectangle(0, 9, 8, 15, 0x725b75)])
    this.add(this.sword)
  }
  run(time: number, running: boolean) {
    this.legs.forEach((leg, i) => { leg.rotation = running ? Math.sin(time / 90 + i * Math.PI) * .65 : 0 })
    if (running) this.sword.rotation = .3 + Math.sin(time / 140) * .12
  }
}
export class CatCharacter extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y); scene.add.existing(this)
    this.add([scene.add.ellipse(0, 0, 40, 34, 0xffc17e), scene.add.ellipse(21, 0, 27, 12, 0xffc17e).setAngle(-35),
      scene.add.triangle(-12, -24, 0, 20, 2, 0, 20, 20, 0xffc17e), scene.add.triangle(12, -24, 0, 20, 18, 0, 20, 20, 0xffc17e),
      scene.add.ellipse(0, -14, 42, 33, 0xffd399), scene.add.circle(-10, -16, 4, 0x344660), scene.add.circle(10, -16, 4, 0x344660),
      scene.add.triangle(0, -6, 0, 0, 8, 0, 4, 5, 0xdc758d)])
  }
}
export class EnemyManager extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y); scene.add.existing(this)
    this.add([scene.add.ellipse(0, 15, 100, 19, 0x203846).setAlpha(.25), scene.add.ellipse(0, -26, 90, 83, 0x9a7ad1).setStrokeStyle(4, 0x70569e),
      scene.add.triangle(-30, -72, 0, 23, 6, 0, 25, 23, 0xcdb3f0), scene.add.triangle(30, -72, 0, 23, 20, 0, 25, 23, 0xcdb3f0),
      scene.add.ellipse(-20, -34, 22, 28, 0xffffff), scene.add.ellipse(20, -34, 22, 28, 0xffffff),
      scene.add.circle(-24, -31, 6, 0x354766), scene.add.circle(16, -31, 6, 0x354766), scene.add.ellipse(0, -7, 27, 10, 0x634a91)])
  }
}
