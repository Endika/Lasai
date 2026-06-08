import { z } from 'zod'

export const AddJournalEntrySchema = z.object({
  text: z.string().min(1).max(1000),
  checkInId: z.string().min(1).nullable().optional(),
  now: z.string().optional(),
})

export type AddJournalEntryInput = z.input<typeof AddJournalEntrySchema>
