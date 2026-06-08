import { SubmitCheckInSchema, type SubmitCheckInInput } from '@/application/dtos/SubmitCheckInDTO'
import { createCheckIn, type CheckIn } from '@/domain/entities/CheckIn'
import { createJournalEntry } from '@/domain/entities/JournalEntry'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'

/**
 * Records a PSS-10 check-in: builds the CheckIn (score + band), persists it, and
 * — when a non-empty journal note is supplied — persists a JournalEntry linked
 * to it. Returns the stored CheckIn.
 */
export class SubmitCheckInHandler {
  constructor(private readonly repo: IEntryRepository) {}

  async execute(input: SubmitCheckInInput): Promise<CheckIn> {
    const parsed = SubmitCheckInSchema.parse(input)
    const now = parsed.now ?? new Date().toISOString()
    const checkIn = createCheckIn({ answers: parsed.answers, now })
    await this.repo.addCheckIn(checkIn)

    const text = parsed.journalText?.trim()
    if (text) {
      const entry = createJournalEntry({ text, checkInId: checkIn.id, now })
      await this.repo.addJournal(entry)
    }
    return checkIn
  }
}
