import { uuidv7 } from 'uuidv7'

export const JOURNAL_MIN_LENGTH = 1
export const JOURNAL_MAX_LENGTH = 1000

export interface JournalEntry {
  id: string
  createdAt: string // ISO-8601
  text: string // trimmed, 1..1000 chars
  checkInId: string | null // optional link to the check-in it was attached to
}

export interface CreateJournalEntryInput {
  text: string
  checkInId?: string | null
  id?: string
  now?: string
}

/** Build a validated JournalEntry. Text is trimmed and must be 1..1000 chars. */
export function createJournalEntry(input: CreateJournalEntryInput): JournalEntry {
  const text = input.text.trim()
  if (text.length < JOURNAL_MIN_LENGTH || text.length > JOURNAL_MAX_LENGTH) {
    throw new Error(`JournalEntry: text must be ${JOURNAL_MIN_LENGTH}..${JOURNAL_MAX_LENGTH} chars`)
  }
  return {
    id: input.id ?? uuidv7(),
    createdAt: input.now ?? new Date().toISOString(),
    text,
    checkInId: input.checkInId ?? null,
  }
}
