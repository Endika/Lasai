import { uuidv7 } from 'uuidv7'
import * as PssScore from '@/domain/value-objects/PssScore'
import { bandFromScore, type StressBand } from '@/domain/value-objects/StressBand'

export interface CheckIn {
  id: string
  createdAt: string // ISO-8601
  answers: number[] // exactly 10 items, each 0..4
  score: number // PSS-10 total, 0..40
  band: StressBand
}

export interface CreateCheckInInput {
  answers: readonly number[]
  id?: string
  now?: string
}

/**
 * Build a validated CheckIn from ten 0..4 PSS-10 answers, computing the score
 * (with reverse-scored items) and the derived stress band.
 */
export function createCheckIn(input: CreateCheckInInput): CheckIn {
  const score = PssScore.compute(input.answers) // throws on invalid answers
  return {
    id: input.id ?? uuidv7(),
    createdAt: input.now ?? new Date().toISOString(),
    answers: [...input.answers],
    score,
    band: bandFromScore(score),
  }
}
