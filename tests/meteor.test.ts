import { describe, expect, it } from 'vitest'
import { meteorPosition, shouldCurveMeteor } from '../src/game/meteor'

describe('kiểu rơi thiên thạch', () => {
  const path = { startX: 300, startY: -26, endX: 340, endY: 440 }

  it('cho mỗi viên rơi hỗn hợp một lượt chọn kiểu rơi', () => {
    const samples = [0.3, 0.8, 0.2]
    const random = () => samples.shift()!
    expect(shouldCurveMeteor('straight', random)).toBe(false)
    expect(shouldCurveMeteor('curve', random)).toBe(true)
    expect(shouldCurveMeteor('mixed', random)).toBe(true)
    expect(shouldCurveMeteor('mixed', random)).toBe(false)
    expect(shouldCurveMeteor('mixed', random)).toBe(true)
  })

  it('giữ hướng rơi thẳng trong suốt quỹ đạo', () => {
    const straight = { ...path, bend: 0 }
    expect(meteorPosition(straight, 0).nx).toBe(meteorPosition(straight, 0.7).nx)
    expect(meteorPosition(straight, 1)).toMatchObject({ x: 340, y: 440 })
  })

  it('đổi hướng ngang khi lượn và vẫn đến điểm va chạm', () => {
    const curved = { ...path, bend: 190 }
    expect(meteorPosition(curved, 0).nx).toBeGreaterThan(0)
    expect(meteorPosition(curved, 0.55).x).toBeGreaterThan(path.endX)
    expect(meteorPosition(curved, 1).nx).toBeLessThan(0)
    expect(meteorPosition(curved, 1).x).toBeCloseTo(path.endX)
    expect(meteorPosition(curved, 1).y).toBe(path.endY)
  })
})
