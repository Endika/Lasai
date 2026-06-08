import { uuidv7 } from 'uuidv7'
import type { StressBand } from '@/domain/value-objects/StressBand'
import type { ReadingQuality } from '@/domain/ppg/dsp'

/**
 * One saved camera-PPG measurement. Heart rate is always present; the HRV
 * (RMSSD) and the derived stress band are present only when the capture was
 * clean enough to trust them — otherwise they are null and the UI shows heart
 * rate alone. No frames or raw samples are ever stored, only the verdict.
 */
export interface HeartReading {
  id: string
  createdAt: string // ISO-8601
  bpm: number // beats per minute, rounded
  rmssd: number | null // ms, null when HRV was not reliable
  stressBand: StressBand | null // null when no trustworthy HRV estimate
  quality: ReadingQuality
}

export interface CreateHeartReadingInput {
  bpm: number
  rmssd?: number | null
  stressBand?: StressBand | null
  quality: ReadingQuality
  id?: string
  now?: string
}

const MIN_BPM = 30
const MAX_BPM = 240

/**
 * Build a validated HeartReading. bpm must be a finite, physiologically
 * plausible integer. A stress band is only allowed alongside a real rmssd —
 * we never store a band without the HRV that produced it.
 */
export function createHeartReading(input: CreateHeartReadingInput): HeartReading {
  const bpm = Math.round(input.bpm)
  if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    throw new Error(`HeartReading: bpm must be a finite value in ${MIN_BPM}..${MAX_BPM}`)
  }

  const rmssd = input.rmssd != null && Number.isFinite(input.rmssd) ? input.rmssd : null
  // A band only makes sense when it was derived from a real RMSSD.
  const stressBand = rmssd !== null ? (input.stressBand ?? null) : null

  return {
    id: input.id ?? uuidv7(),
    createdAt: input.now ?? new Date().toISOString(),
    bpm,
    rmssd,
    stressBand,
    quality: input.quality,
  }
}
