import {
  AddJournalEntrySchema,
  type AddJournalEntryInput,
} from '@/application/dtos/AddJournalEntryDTO'
import { createJournalEntry, type JournalEntry } from '@/domain/entities/JournalEntry'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'

/** Records a standalone (or check-in-linked) journal note. */
export class AddJournalEntryHandler {
  constructor(private readonly repo: IEntryRepository) {}

  async execute(input: AddJournalEntryInput): Promise<JournalEntry> {
    const parsed = AddJournalEntrySchema.parse(input)
    const entry = createJournalEntry({
      text: parsed.text,
      checkInId: parsed.checkInId ?? null,
      now: parsed.now,
    })
    await this.repo.addJournal(entry)
    return entry
  }
}
