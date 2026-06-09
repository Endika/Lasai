import { uuidv7 } from 'uuidv7'

/**
 * One saved chest-motion reading from an audio-guided breathing session.
 * Breaths/min is always present (the reliable respiratory signal). The
 * experimental BCG heart rate is present ONLY when its quality cleared the bar
 * during analysis — otherwise it is null and is never fabricated. No raw
 * accelerometer samples are ever stored, only the final verdict.
 */
export interface MotionReading {
  id: string
  createdAt: string // ISO-8601
  breathsPerMin: number // breaths per minute, rounded
  bcgBpm: number | null // experimental heart rate, null when quality failed
  quality: number // breathing quality 0..1
}

export interface CreateMotionReadingInput {
  breathsPerMin: number
  bcgBpm?: number | null
  quality: number
  id?: string
  now?: string
}

const MIN_BREATHS = 1
const MAX_BREATHS = 60
const MIN_BCG = 30
const MAX_BCG = 240

/**
 * Build a validated MotionReading. breathsPerMin must be a finite, plausible
 * integer. A bcgBpm is only kept when it is a finite, plausible integer —
 * we never store an invented heart number.
 */
export function createMotionReading(input: CreateMotionReadingInput): MotionReading {
  const breathsPerMin = Math.round(input.breathsPerMin)
  if (
    !Number.isFinite(breathsPerMin) ||
    breathsPerMin < MIN_BREATHS ||
    breathsPerMin > MAX_BREATHS
  ) {
    throw new Error(
      `MotionReading: breathsPerMin must be a finite value in ${MIN_BREATHS}..${MAX_BREATHS}`,
    )
  }

  let bcgBpm: number | null = null
  if (input.bcgBpm != null && Number.isFinite(input.bcgBpm)) {
    const rounded = Math.round(input.bcgBpm)
    if (rounded >= MIN_BCG && rounded <= MAX_BCG) bcgBpm = rounded
  }

  const quality = Number.isFinite(input.quality) ? Math.min(1, Math.max(0, input.quality)) : 0

  return {
    id: input.id ?? uuidv7(),
    createdAt: input.now ?? new Date().toISOString(),
    breathsPerMin,
    bcgBpm,
    quality,
  }
}
