import { describe, it, expect } from 'vitest'
import { cycleSlices, pacerAt } from '@/presentation/components/features/calm/breathingTimeline'

describe('breathingTimeline', () => {
  it('drops zero-length phases (4-7-8 has no rest)', () => {
    const slices = cycleSlices('four-seven-eight')
    expect(slices.map((s) => s.phase)).toEqual(['inhale', 'hold', 'exhale'])
    expect(slices.map((s) => s.durationSec)).toEqual([4, 7, 8])
  })

  it('keeps all four phases for box breathing', () => {
    const slices = cycleSlices('box')
    expect(slices.map((s) => s.phase)).toEqual(['inhale', 'hold', 'exhale', 'rest'])
  })

  it('resolves the active phase + countdown across a box cycle', () => {
    expect(pacerAt('box', 0).phase).toBe('inhale')
    expect(pacerAt('box', 0).countdown).toBe(4)
    expect(pacerAt('box', 5).phase).toBe('hold')
    expect(pacerAt('box', 9).phase).toBe('exhale')
    expect(pacerAt('box', 13).phase).toBe('rest')
    // Wraps to the next cycle.
    expect(pacerAt('box', 16).phase).toBe('inhale')
  })

  it('reports a 0..1 phase progress', () => {
    expect(pacerAt('box', 0).phaseProgress).toBeCloseTo(0, 5)
    expect(pacerAt('box', 2).phaseProgress).toBeCloseTo(0.5, 5)
  })
})
