import { describe, expect, it } from 'vitest'
import { drawTime, fallDuration, Round, type Phase } from '../src/game/round'

describe('lượt chơi', () => {
  it('đợi SQLite xác nhận trước khi chuyển sang lần rơi tiếp theo', () => {
    const log: [Phase, number][] = []
    const round = new Round({ count: 2, revealed: 0, lead: 0, gap: 1, speed: 1 }, (phase, order) => log.push([phase, order]), () => 0.9)
    const advance = () => { for (let i = 0; i < 20; i++) round.advance(1000) }
    advance()
    expect(log.map(([phase]) => phase)).toEqual(['COUNTDOWN','RUNNING','METEOR_WARNING'])
    expect(round.elapsed).toBe(drawTime)
    round.aim()
    advance()
    expect(log.at(-1)).toEqual(['REVEAL', 1])
    round.acknowledge()
    advance()
    expect(log.at(-1)).toEqual(['METEOR_WARNING', 2])
    round.aim()
    advance()
    expect(log.at(-1)).toEqual(['REVEAL', 2])
    round.acknowledge()
    round.advance(1100)
    expect(log.at(-1)).toEqual(['FINISHED', 2])
  })

  it('rơi hụt rồi thử lại cùng lượt, trước khi chọn học sinh', () => {
    const round = new Round({ count: 1, revealed: 0, lead: 0, gap: 0, speed: 1 }, () => {}, () => 0.1)
    for (let i = 0; i < 3; i++) round.advance(3000)
    expect(round.phase).toBe('METEOR_WARNING')
    expect(round.nearMiss).toBe(true)
    round.advance(drawTime)
    expect(round.phase).toBe('METEOR_FALLING')
    round.advance(fallDuration - 1)
    expect(round.phase).toBe('METEOR_FALLING')
    round.advance(1)
    expect(round.phase).toBe('MISS')
    round.advance(1100)
    expect(round.phase).toBe('METEOR_WARNING')
    expect(round.nearMiss).toBe(false)
    expect(round.order).toBe(1)
    round.advance(drawTime)
    expect(round.phase).toBe('METEOR_WARNING')
    round.aim()
    round.advance(1)
    expect(round.phase).toBe('METEOR_FALLING')
    round.advance(fallDuration)
    expect(round.phase).toBe('IMPACT')
  })

  it('tiếp tục với học sinh chưa được công bố', () => {
    const round = new Round({ count: 5, revealed: 3, lead: 3, gap: 2, speed: 2 }, () => {})
    round.advance(125)
    expect(round.phase).toBe('COUNTDOWN')
    expect(round.order).toBe(4)
  })
})
