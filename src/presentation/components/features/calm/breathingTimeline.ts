import {
  getBreathingPattern,
  cycleDurationSec,
  type BreathingPatternId,
} from '@/domain/value-objects/BreathingPattern'

export type BreathePhase = 'inhale' | 'hold' | 'exhale' | 'rest'

export interface PhaseSlice {
  phase: BreathePhase
  /** Seconds into the cycle this slice starts. */
  startSec: number
  /** Length of this slice in seconds. */
  durationSec: number
}

/**
 * Ordered, non-empty phase slices for one cycle of a pattern. Zero-length
 * phases (e.g. 4-7-8 has no hold-after-exhale) are dropped so the pacer never
 * shows a phase for 0 seconds.
 */
export function cycleSlices(id: BreathingPatternId): PhaseSlice[] {
  const { phases } = getBreathingPattern(id)
  const raw: { phase: BreathePhase; durationSec: number }[] = [
    { phase: 'inhale', durationSec: phases.inhale },
    { phase: 'hold', durationSec: phases.holdAfterInhale },
    { phase: 'exhale', durationSec: phases.exhale },
    { phase: 'rest', durationSec: phases.holdAfterExhale },
  ]
  const slices: PhaseSlice[] = []
  let start = 0
  for (const r of raw) {
    if (r.durationSec <= 0) continue
    slices.push({ phase: r.phase, startSec: start, durationSec: r.durationSec })
    start += r.durationSec
  }
  return slices
}

export interface PacerState {
  phase: BreathePhase
  /** Whole seconds remaining in the current phase, counting down (e.g. 4,3,2,1). */
  countdown: number
  /** 0..1 progress through the current phase, for the visual scale. */
  phaseProgress: number
}

/** Resolve the active phase + countdown for a given elapsed time within a session. */
export function pacerAt(id: BreathingPatternId, elapsedSec: number): PacerState {
  const slices = cycleSlices(id)
  const cycle = cycleDurationSec(id)
  const within = ((elapsedSec % cycle) + cycle) % cycle

  let active = slices[slices.length - 1] as PhaseSlice
  for (const s of slices) {
    if (within >= s.startSec && within < s.startSec + s.durationSec) {
      active = s
      break
    }
  }
  const into = within - active.startSec
  const phaseProgress = Math.min(1, Math.max(0, into / active.durationSec))
  const countdown = Math.max(1, Math.ceil(active.durationSec - into))
  return { phase: active.phase, countdown, phaseProgress }
}
