import { useTranslation } from 'react-i18next'
import type { BreathePhase } from './breathingTimeline'

const PHASE_LABEL: Record<BreathePhase, string> = {
  inhale: 'calm.phaseInhale',
  hold: 'calm.phaseHold',
  exhale: 'calm.phaseExhale',
  rest: 'calm.phaseRest',
}

interface BreathingPacerProps {
  phase: BreathePhase
  countdown: number
  /** 0..1 progress through the current phase. */
  phaseProgress: number
  reducedMotion: boolean
}

/**
 * The breathing visual. With motion: a soft circle that scales 0.55 -> 1 on
 * inhale, holds large, contracts on exhale, holds small on rest. With
 * reduced motion: a static ring with a quiet opacity shift only; phase text +
 * countdown carry the pacing.
 */
export function BreathingPacer({
  phase,
  countdown,
  phaseProgress,
  reducedMotion,
}: BreathingPacerProps) {
  const { t } = useTranslation()

  // Map phase + progress to a target scale (0.55 small … 1 large).
  const scale =
    phase === 'inhale'
      ? 0.55 + 0.45 * phaseProgress
      : phase === 'exhale'
        ? 1 - 0.45 * phaseProgress
        : phase === 'hold'
          ? 1
          : 0.55

  return (
    <div
      className="relative flex aspect-square w-72 max-w-[80vw] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      {/* Outer halo */}
      <div
        className="absolute inset-0 rounded-full bg-calm/15"
        style={reducedMotion ? undefined : { transform: `scale(${0.7 + 0.3 * scale})` }}
        aria-hidden="true"
      />
      {/* Breathing disc */}
      <div
        className="absolute h-3/4 w-3/4 rounded-full bg-gradient-to-b from-calm to-calm-deep shadow-[0_20px_50px_-16px_rgba(44,140,133,0.6)]"
        style={
          reducedMotion
            ? { opacity: phase === 'inhale' || phase === 'hold' ? 0.95 : 0.7 }
            : {
                transform: `scale(${scale})`,
                transition:
                  phase === 'hold' || phase === 'rest'
                    ? 'transform 0.4s ease-in-out'
                    : 'transform 0.9s linear',
              }
        }
        aria-hidden="true"
      />
      {/* Centre text */}
      <div className="relative flex flex-col items-center gap-1 text-white">
        <span className="text-2xl font-semibold tracking-tight">{t(PHASE_LABEL[phase])}</span>
        <span className="text-4xl font-light tabular-nums" aria-hidden="true">
          {countdown}
        </span>
        <span className="sr-only">{countdown}</span>
      </div>
    </div>
  )
}
