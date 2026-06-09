import type { CheckIn } from '@/domain/entities/CheckIn'
import type { JournalEntry } from '@/domain/entities/JournalEntry'
import type { CalmSession } from '@/domain/entities/CalmSession'
import type { HeartReading } from '@/domain/entities/HeartReading'
import type { MotionReading } from '@/domain/entities/MotionReading'

/**
 * The single port for persisting wellbeing data. Everything stays on the
 * device (localStorage for M1); the interface is async so an IndexedDB or
 * other backend can replace it without touching the application layer.
 */
export interface IEntryRepository {
  addCheckIn(checkIn: CheckIn): Promise<void>
  listCheckIns(): Promise<CheckIn[]>
  addJournal(entry: JournalEntry): Promise<void>
  listJournal(): Promise<JournalEntry[]>
  addSession(session: CalmSession): Promise<void>
  listSessions(): Promise<CalmSession[]>
  addReading(reading: HeartReading): Promise<void>
  listReadings(): Promise<HeartReading[]>
  addMotionReading(reading: MotionReading): Promise<void>
  listMotionReadings(): Promise<MotionReading[]>
  /** Erasure: wipe everything we stored. */
  deleteAll(): Promise<void>
}
