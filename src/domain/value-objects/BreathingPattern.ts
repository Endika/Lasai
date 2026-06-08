export const BREATHING_PATTERN_IDS = ['box', 'four-seven-eight'] as const
export type BreathingPatternId = (typeof BREATHING_PATTERN_IDS)[number]

export interface BreathingPhases {
  /** Seconds for each phase. A 0 means the phase is skipped. */
  inhale: number
  holdAfterInhale: number
  exhale: number
  holdAfterExhale: number
}

export interface BreathingPattern {
  id: BreathingPatternId
  phases: BreathingPhases
}

/** Pacing data for the supported breathing patterns. Phase durations are in seconds. */
export const BREATHING_PATTERNS: readonly BreathingPattern[] = [
  { id: 'box', phases: { inhale: 4, holdAfterInhale: 4, exhale: 4, holdAfterExhale: 4 } },
  {
    id: 'four-seven-eight',
    phases: { inhale: 4, holdAfterInhale: 7, exhale: 8, holdAfterExhale: 0 },
  },
] as const

export function isBreathingPatternId(value: string): value is BreathingPatternId {
  return (BREATHING_PATTERN_IDS as readonly string[]).includes(value)
}

export function getBreathingPattern(id: BreathingPatternId): BreathingPattern {
  const pattern = BREATHING_PATTERNS.find((p) => p.id === id)
  if (!pattern) throw new Error(`BreathingPattern: unknown id "${id}"`)
  return pattern
}

/** Total seconds of one full cycle of the given pattern. */
export function cycleDurationSec(id: BreathingPatternId): number {
  const { phases } = getBreathingPattern(id)
  return phases.inhale + phases.holdAfterInhale + phases.exhale + phases.holdAfterExhale
}
