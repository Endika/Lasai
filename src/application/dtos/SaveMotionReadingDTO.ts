import { z } from 'zod'

/**
 * Input to save a chest-motion breathing verdict. `breathsPerMin` is always
 * present (the reliable respiratory signal). `bcgBpm` is supplied only when the
 * experimental heart-rate quality cleared the bar during analysis; otherwise it
 * is null and is never fabricated. `quality` is the breathing quality 0..1.
 */
export const SaveMotionReadingSchema = z.object({
  breathsPerMin: z.number().min(1).max(60),
  bcgBpm: z.number().min(30).max(240).nullable().default(null),
  quality: z.number().min(0).max(1),
  now: z.string().optional(),
})

export type SaveMotionReadingInput = z.input<typeof SaveMotionReadingSchema>
