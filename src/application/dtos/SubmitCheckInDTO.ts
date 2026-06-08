import { z } from 'zod'

export const SubmitCheckInSchema = z.object({
  answers: z.array(z.number().int().min(0).max(4)).length(10),
  /** Optional journal note attached to this check-in. Trimmed; empty -> no note. */
  journalText: z.string().max(1000).optional(),
  now: z.string().optional(),
})

export type SubmitCheckInInput = z.input<typeof SubmitCheckInSchema>
