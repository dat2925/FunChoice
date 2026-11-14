import Phaser from 'phaser'

export type Motion = 'Idle' | 'Walk' | 'Run' | 'ScaredRun' | 'Panic' | 'Dazed'

const motion: Record<Motion, [number, number, number, number]> = {
  Idle: [3, 4, 2, 1], Walk: [9, 31, 26, 2], Run: [14, 39, 49, 4],
  ScaredRun: [17, 48, 65, 5], Panic: [23, 55, 40, 6],
  Dazed: [3, 1, 3, 1],
}

export class Actor {
  readonly object: Phaser.GameObjects.Container
  readonly body: Phaser.Physics.Arcade.Body
  readonly label: Phaser.GameObjects.Text
  private shadow: Phaser.GameObjects.Ellipse
  private rig: Phaser.GameObjects.Container
  private limbs: [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image]
  private torso: Phaser.GameObjects.Image
  private head: Phaser.GameObjects.Image
  private clock = Math.random() * 10
  private facing = Math.random() < 0.5 ? -1 : 1
  heading = Math.random() * Math.PI * 2
  rethink = Math.random()
  pace = 0.77 + Math.random() * 0.46
  dustAt = Math.random()
  state: Motion = 'Idle'
  baseScale = 1

  constructor(scene: Phaser.Scene, public id: string, private variant: string, name: string, gender: string | null, x: number, y: number) {
    const part = (name: string, px: number, py: number, ox = 0.5, oy = 0.5) =>
      scene.add.image(px, py, variant + '-' + name).setOrigin(ox, oy)
    this.shadow = scene.add.ellipse(0, 0, 35, 9, 0x654450, 0.36)
    const leftLeg = part('leg', -8, -22, 0.4, 0.1)
    const rightLeg = part('leg', 6, -22, 0.4, 0.1)
    const leftArm = part('arm', -12, -41, 0.45, 0.15)
    const rightArm = part('arm', 12, -41, 0.45, 0.15)
    this.limbs = [leftLeg, rightLeg, leftArm, rightArm]
    this.torso = part('body', 0, -34)
    this.head = part('head', 1, -49, 0.5, 0.84)
    this.rig = scene.add.container(0, 0, [leftLeg, rightLeg, leftArm, this.torso, rightArm, this.head])
    this.label = scene.add.text(0, -90, name, {
      fontFamily: '"Segoe UI", sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: gender === 'male' ? '#24477ce8' : gender === 'female' ? '#64327fe8' : '#463b56df',
      padding: { x: 2, y: 1 }, align: 'center', wordWrap: { width: 145, useAdvancedWrap: true },
    }).setOrigin(0.5, 1).setResolution(2)
    this.object = scene.add.container(x, y, [this.shadow, this.rig, this.label])
    scene.physics.add.existing(this.object)
    this.body = this.object.body as Phaser.Physics.Arcade.Body
    this.body.setSize(12, 10).setOffset(-6, -5)
  }

  scorch() {
    this.state = 'Dazed'
    for (const part of [...this.limbs, this.torso]) part.setTint(0x99868b)
    this.head.setTexture(this.variant + '-dazed')
  }

  recover() {
    this.state = 'Run'
    for (const part of [...this.limbs, this.torso]) part.clearTint()
    this.head.setTexture(this.variant + '-head')
  }

  animate(delta: number, runVelocityX = this.body.velocity.x) {
    const [rate, legs, arms, bounce] = motion[this.state]
    this.clock += delta * rate * this.pace
    const wave = Math.sin(this.clock)
    const stride = Math.cos(this.clock)
    if (Math.abs(runVelocityX) > 15) this.facing = Math.sign(runVelocityX)
    const [left, right, a, b] = this.limbs
    left.setAngle(legs * wave).setY(-19 - Math.max(0, stride) * bounce)
    right.setAngle(-legs * wave).setY(-19 - Math.max(0, -stride) * bounce)

    // Shoe sole endpoints in the leg texture, relative to its rotation origin.
    const soleY = (leg: Phaser.GameObjects.Image) => leg.y + 16.9 * Math.cos(leg.rotation) +
      Math.max(-4 * Math.sin(leg.rotation), 7 * Math.sin(leg.rotation))
    const ground = -Math.max(soleY(left), soleY(right))
    const bob = Math.abs(stride) * Math.min(bounce, 2)
    const lifted = this.state === 'Panic' ? 84 : this.state === 'ScaredRun' ? 45 : 0
    a.setAngle(lifted - arms * wave).setY(-41 + bob)
    b.setAngle(-lifted + arms * wave).setY(-41 + bob)
    this.rig.setY(ground).setScale(this.facing, 1)
    this.label.setY(-90 + ground + bob).setScale(1 / Math.max(0.86, this.object.scaleX))
    this.torso.setY(-34 + bob).setAngle(3 * wave)
    this.head.setY(-49 + bob).setAngle((this.state === 'ScaredRun' ? 11 : 5) * wave + (this.state === 'Dazed' ? -10 : 0))
    const scared = this.state === 'ScaredRun' || this.state === 'Panic'
    const texture = this.variant + (this.state === 'Dazed' ? '-dazed' : scared ? '-scared' : '-head')
    if (this.head.texture.key !== texture) this.head.setTexture(texture)
  }
}
