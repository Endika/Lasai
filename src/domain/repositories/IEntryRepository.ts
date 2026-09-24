import type { CheckIn } from '@/domain/entities/CheckIn'
import type { JournalEntry } from '@/domain/entities/JournalEntry'
import type { CalmSession } from '@/domain/entities/CalmSession'
import type { HeartReading } from '@/domain/entities/HeartReading'
import type { MotionReading } from '@/domain/entities/MotionReading'

/**
 * The single port for persisting wellbeing data. Everything stays on the
 * device (localStorage for M1); the interface is async so an IndexedDB or
 * other backend can replace it without touching the application layer.
 * An addX call rejects if the underlying write failed — callers must not
 * treat a resolved-without-checking call as proof the data was saved.
 * deleteAll follows the same contract: it rejects if the erasure failed.
 */
export interface IEntryRepository {
  addCheckIn(checkIn: CheckIn): Promise<void>
  listCheckIns(): Promise<CheckIn[]>
  addJournal(entry: JournalEntry): Promise<void>
  listJournal(): Promise<JournalEntry[]>
  /**
   * Persists a check-in and its optional journal note as one atomic write —
   * both land or neither does. Use this (not addCheckIn+addJournal) whenever
   * the two belong together, so a retry after a failure can't ever produce a
   * check-in with no note, or a second check-in for the same submission.
   */
  addCheckInWithJournal(checkIn: CheckIn, journal: JournalEntry | null): Promise<void>
  addSession(session: CalmSession): Promise<void>
  listSessions(): Promise<CalmSession[]>
  addReading(reading: HeartReading): Promise<void>
  listReadings(): Promise<HeartReading[]>
  addMotionReading(reading: MotionReading): Promise<void>
  listMotionReadings(): Promise<MotionReading[]>
  /** Erasure: wipe everything we stored. */
  deleteAll(): Promise<void>
}
