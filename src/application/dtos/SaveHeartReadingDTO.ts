import { z } from 'zod'

const READING_QUALITIES = ['good', 'fair', 'poor'] as const

/**
 * Input to save a sustained-capture verdict. `bpm` is always present; `rmssd`
 * is supplied only when the capture was clean enough to trust HRV (the UI gates
 * this via assessReading.hrvReliable). The stress band is derived server-side
 * from rmssd + the user's history, so it is not part of the input.
 */
export const SaveHeartReadingSchema = z.object({
  bpm: z.number().min(30).max(240),
  rmssd: z.number().min(0).nullable().default(null),
  quality: z.enum(READING_QUALITIES),
  now: z.string().optional(),
})

export type SaveHeartReadingInput = z.input<typeof SaveHeartReadingSchema>
