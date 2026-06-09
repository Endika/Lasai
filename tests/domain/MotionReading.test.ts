import { describe, it, expect } from 'vitest'
import { createMotionReading } from '@/domain/entities/MotionReading'

describe('createMotionReading', () => {
  it('rounds breaths/min and keeps a plausible bcg bpm', () => {
    const r = createMotionReading({ breathsPerMin: 12.4, bcgBpm: 61.6, quality: 0.7 })
    expect(r.breathsPerMin).toBe(12)
    expect(r.bcgBpm).toBe(62)
    expect(r.quality).toBeCloseTo(0.7, 5)
    expect(r.id).toBeTruthy()
    expect(r.createdAt).toBeTruthy()
  })

  it('stores null bcg when none is supplied (never faked)', () => {
    const r = createMotionReading({ breathsPerMin: 10, quality: 0.6 })
    expect(r.bcgBpm).toBeNull()
  })

  it('drops an implausible bcg bpm rather than storing it', () => {
    expect(createMotionReading({ breathsPerMin: 10, bcgBpm: 5, quality: 0.6 }).bcgBpm).toBeNull()
    expect(createMotionReading({ breathsPerMin: 10, bcgBpm: 999, quality: 0.6 }).bcgBpm).toBeNull()
  })

  it('clamps quality into 0..1', () => {
    expect(createMotionReading({ breathsPerMin: 10, quality: 1.5 }).quality).toBe(1)
    expect(createMotionReading({ breathsPerMin: 10, quality: -2 }).quality).toBe(0)
  })

  it('rejects an implausible breathing rate', () => {
    expect(() => createMotionReading({ breathsPerMin: 0, quality: 0.5 })).toThrow()
    expect(() => createMotionReading({ breathsPerMin: 99, quality: 0.5 })).toThrow()
  })

  it('honours an explicit id and timestamp', () => {
    const r = createMotionReading({
      breathsPerMin: 12,
      quality: 0.6,
      id: 'fixed',
      now: '2026-06-09T10:00:00.000Z',
    })
    expect(r.id).toBe('fixed')
    expect(r.createdAt).toBe('2026-06-09T10:00:00.000Z')
  })
})
