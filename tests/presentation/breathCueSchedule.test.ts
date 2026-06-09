import { describe, it, expect } from 'vitest'
import { buildBreathCues } from '@/presentation/components/features/breathe-chest/breathCueSchedule'

describe('buildBreathCues', () => {
  it('lays out one box cycle as inhale/hold/exhale/rest at 4s offsets', () => {
    const cues = buildBreathCues('box', 16)
    expect(cues.map((c) => c.phase)).toEqual(['inhale', 'hold', 'exhale', 'rest'])
    expect(cues.map((c) => c.atSec)).toEqual([0, 4, 8, 12])
    expect(cues.map((c) => c.durationSec)).toEqual([4, 4, 4, 4])
  })

  it('repeats the cycle to fill the session length', () => {
    const cues = buildBreathCues('box', 32)
    expect(cues).toHaveLength(8)
    expect(cues.map((c) => c.phase)).toEqual([
      'inhale',
      'hold',
      'exhale',
      'rest',
      'inhale',
      'hold',
      'exhale',
      'rest',
    ])
    expect(cues.at(-1)?.atSec).toBe(28)
  })

  it('drops the zero-length rest of 4-7-8 (inhale/hold/exhale only)', () => {
    const cues = buildBreathCues('four-seven-eight', 19)
    expect(cues.map((c) => c.phase)).toEqual(['inhale', 'hold', 'exhale'])
    expect(cues.map((c) => c.atSec)).toEqual([0, 4, 11])
    expect(cues.map((c) => c.durationSec)).toEqual([4, 7, 8])
  })

  it('clamps the final phase so it never runs past the session end', () => {
    const cues = buildBreathCues('box', 10)
    // inhale 0-4, hold 4-8, exhale starts at 8 but only 2s remain.
    expect(cues.map((c) => c.phase)).toEqual(['inhale', 'hold', 'exhale'])
    expect(cues.at(-1)).toMatchObject({ atSec: 8, durationSec: 2 })
  })

  it('returns no cues for a non-positive duration', () => {
    expect(buildBreathCues('box', 0)).toEqual([])
  })
})
