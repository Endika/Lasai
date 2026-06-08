import { describe, it, expect } from 'vitest'
import {
  BREATHING_PATTERNS,
  cycleDurationSec,
  getBreathingPattern,
  isBreathingPatternId,
} from '@/domain/value-objects/BreathingPattern'

describe('BreathingPattern data', () => {
  it('box is 4-4-4-4 (16s cycle)', () => {
    expect(getBreathingPattern('box').phases).toEqual({
      inhale: 4,
      holdAfterInhale: 4,
      exhale: 4,
      holdAfterExhale: 4,
    })
    expect(cycleDurationSec('box')).toBe(16)
  })

  it('four-seven-eight is 4-7-8-0 (19s cycle)', () => {
    expect(getBreathingPattern('four-seven-eight').phases).toEqual({
      inhale: 4,
      holdAfterInhale: 7,
      exhale: 8,
      holdAfterExhale: 0,
    })
    expect(cycleDurationSec('four-seven-eight')).toBe(19)
  })

  it('exposes exactly the two M1 patterns', () => {
    expect(BREATHING_PATTERNS.map((p) => p.id)).toEqual(['box', 'four-seven-eight'])
  })

  it('guards unknown ids', () => {
    expect(isBreathingPatternId('box')).toBe(true)
    expect(isBreathingPatternId('nope')).toBe(false)
  })
})
