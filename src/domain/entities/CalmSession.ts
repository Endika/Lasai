import { uuidv7 } from 'uuidv7'
import {
  isBreathingPatternId,
  type BreathingPatternId,
} from '@/domain/value-objects/BreathingPattern'

export const CALM_SESSION_MAX_DURATION_SEC = 60 * 60 // 1 hour, a sane upper bound

export interface CalmSession {
  id: string
  createdAt: string // ISO-8601
  pattern: BreathingPatternId
  durationSec: number // seconds the session actually ran
}

export interface CreateCalmSessionInput {
  pattern: BreathingPatternId
  durationSec: number
  id?: string
  now?: string
}

/** Build a validated CalmSession. Duration must be a positive bounded integer. */
export function createCalmSession(input: CreateCalmSessionInput): CalmSession {
  if (!isBreathingPatternId(input.pattern)) {
    throw new Error(`CalmSession: unknown breathing pattern "${input.pattern}"`)
  }
  if (
    !Number.isInteger(input.durationSec) ||
    input.durationSec <= 0 ||
    input.durationSec > CALM_SESSION_MAX_DURATION_SEC
  ) {
    throw new Error(
      `CalmSession: durationSec must be an integer in 1..${CALM_SESSION_MAX_DURATION_SEC}`,
    )
  }
  return {
    id: input.id ?? uuidv7(),
    createdAt: input.now ?? new Date().toISOString(),
    pattern: input.pattern,
    durationSec: input.durationSec,
  }
}
