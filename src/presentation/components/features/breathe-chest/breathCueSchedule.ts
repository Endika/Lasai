import {
  cycleSlices,
  type BreathePhase,
} from '@/presentation/components/features/calm/breathingTimeline'
import { cycleDurationSec, type BreathingPatternId } from '@/domain/value-objects/BreathingPattern'

export type { BreathePhase }

/**
 * One scheduled breathing cue: a phase that begins at `atSec` into the session
 * and lasts `durationSec`. The audio cue (rising tone on inhale, falling on
 * exhale, tick on hold/rest) and the vibration pulse fire at `atSec`.
 */
export interface BreathCue {
  phase: BreathePhase
  /** Seconds into the session this phase starts. */
  atSec: number
  /** Length of this phase in seconds. */
  durationSec: number
}

/**
 * Build the full, ordered cue timeline for a session of `totalSec` seconds of
 * the given pattern. The pattern's cycle is repeated until the session length is
 * reached; the final phase is clamped so it never runs past the session end.
 *
 * Pure (no clocks, no audio): the session driver schedules audio/vibration from
 * this list, and it is directly unit-testable.
 */
export function buildBreathCues(id: BreathingPatternId, totalSec: number): BreathCue[] {
  if (totalSec <= 0) return []
  const slices = cycleSlices(id)
  if (slices.length === 0) return []
  const cycle = cycleDurationSec(id)
  if (cycle <= 0) return []

  const cues: BreathCue[] = []
  let at = 0
  let i = 0
  // Guard against pathological loops; a session is bounded so this is generous.
  const maxCues = Math.ceil((totalSec / cycle) * slices.length) + slices.length + 1
  while (at < totalSec && cues.length < maxCues) {
    const slice = slices[i % slices.length]!
    const remaining = totalSec - at
    const durationSec = Math.min(slice.durationSec, remaining)
    cues.push({ phase: slice.phase, atSec: at, durationSec })
    at += slice.durationSec
    i++
  }
  return cues
}
