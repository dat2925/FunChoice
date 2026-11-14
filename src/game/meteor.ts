import type { Settings } from '../api'

export function shouldCurveMeteor(style: Settings['meteorStyle'], random = Math.random) {
  return style === 'curve' || (style === 'mixed' && random() < 0.5)
}

export interface MeteorPath {
  startX: number
  startY: number
  endX: number
  endY: number
  bend: number
}

export function meteorPosition(path: MeteorPath, progress: number) {
  const t = progress * (0.64 + 0.36 * progress)
  const dx = path.endX - path.startX
  const dy = path.endY - path.startY
  const length = Math.hypot(dx + Math.PI * path.bend * Math.cos(Math.PI * t), dy)
  return {
    x: path.startX + dx * t + path.bend * Math.sin(Math.PI * t),
    y: path.startY + dy * t,
    nx: (dx + Math.PI * path.bend * Math.cos(Math.PI * t)) / length,
    ny: dy / length,
    t,
  }
}
