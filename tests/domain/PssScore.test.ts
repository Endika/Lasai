import { describe, it, expect } from 'vitest'
import { compute, PSS_REVERSE_INDICES } from '@/domain/value-objects/PssScore'
import { bandFromScore } from '@/domain/value-objects/StressBand'

describe('PSS-10 scoring', () => {
  it('sums direct items and reverse-scores Q4/Q5/Q7/Q8 for a known vector', () => {
    // answers: indices 3,4,6,7 are reverse-scored (0->4, etc.)
    const answers = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]
    // direct  (i in 0,1,2,5,8,9): 0+1+2 + 0 + 3+4 = 10
    // reverse (i in 3,4,6,7):     (4-3)+(4-4)+(4-1)+(4-2) = 1+0+3+2 = 6
    expect(compute(answers)).toBe(16)
  })

  it('all zeros -> 16 because the four reverse items each flip 0->4', () => {
    expect(compute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(16)
  })

  it('all fours -> 24 because the four reverse items each flip 4->0', () => {
    expect(compute([4, 4, 4, 4, 4, 4, 4, 4, 4, 4])).toBe(24)
  })

  it('flips EACH reverse-scored item individually', () => {
    // Baseline all-zeros is 16 (each of the 4 reverse items contributes 4-0=4).
    const base = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (const i of PSS_REVERSE_INDICES) {
      const answers = [...base]
      answers[i] = 4 // a 4 on a reverse item contributes 0 instead of 4 -> total drops to 12
      expect(compute(answers)).toBe(12)
      answers[i] = 1 // contributes 4-1=3 instead of 4 -> total drops by 1 to 15
      expect(compute(answers)).toBe(15)
    }
  })

  it('flips a single direct item as a control (no reverse)', () => {
    const answers = [4, 0, 0, 0, 0, 0, 0, 0, 0, 0] // index 0 is direct
    expect(compute(answers)).toBe(16 + 4)
  })

  it('rejects wrong length and out-of-range answers', () => {
    expect(() => compute([0, 0, 0])).toThrow()
    expect(() => compute([5, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow()
    expect(() => compute([-1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow()
    expect(() => compute([1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow()
  })
})

describe('StressBand boundaries', () => {
  it('bands at the 13/14 and 26/27 edges', () => {
    expect(bandFromScore(0)).toBe('low')
    expect(bandFromScore(13)).toBe('low')
    expect(bandFromScore(14)).toBe('moderate')
    expect(bandFromScore(26)).toBe('moderate')
    expect(bandFromScore(27)).toBe('high')
    expect(bandFromScore(40)).toBe('high')
  })

  it('rejects out-of-range scores', () => {
    expect(() => bandFromScore(-1)).toThrow()
    expect(() => bandFromScore(41)).toThrow()
    expect(() => bandFromScore(1.5)).toThrow()
  })
})
