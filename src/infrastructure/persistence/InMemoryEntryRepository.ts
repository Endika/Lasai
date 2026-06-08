import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'
import type { CheckIn } from '@/domain/entities/CheckIn'
import type { JournalEntry } from '@/domain/entities/JournalEntry'
import type { CalmSession } from '@/domain/entities/CalmSession'
import type { HeartReading } from '@/domain/entities/HeartReading'
import { ENTRY_LIST_CAP } from '@/infrastructure/persistence/LocalStorageEntryRepository'

function capNewest<T>(items: T[], cap: number): T[] {
  return items.length > cap ? items.slice(items.length - cap) : items
}

/**
 * Faithful in-memory fake of the local repository, including the newest-N cap,
 * so application-layer integration tests exercise real behavior. Snapshots are
 * cloned in/out to mirror the JSON round-trip of the localStorage impl.
 */
export class InMemoryEntryRepository implements IEntryRepository {
  private checkIns: CheckIn[] = []
  private journal: JournalEntry[] = []
  private sessions: CalmSession[] = []
  private readings: HeartReading[] = []

  async addCheckIn(checkIn: CheckIn): Promise<void> {
    this.checkIns = capNewest([...this.checkIns, structuredClone(checkIn)], ENTRY_LIST_CAP)
  }

  async listCheckIns(): Promise<CheckIn[]> {
    return structuredClone(this.checkIns)
  }

  async addJournal(entry: JournalEntry): Promise<void> {
    this.journal = capNewest([...this.journal, structuredClone(entry)], ENTRY_LIST_CAP)
  }

  async listJournal(): Promise<JournalEntry[]> {
    return structuredClone(this.journal)
  }

  async addSession(session: CalmSession): Promise<void> {
    this.sessions = capNewest([...this.sessions, structuredClone(session)], ENTRY_LIST_CAP)
  }

  async listSessions(): Promise<CalmSession[]> {
    return structuredClone(this.sessions)
  }

  async addReading(reading: HeartReading): Promise<void> {
    this.readings = capNewest([...this.readings, structuredClone(reading)], ENTRY_LIST_CAP)
  }

  async listReadings(): Promise<HeartReading[]> {
    return structuredClone(this.readings)
  }

  async deleteAll(): Promise<void> {
    this.checkIns = []
    this.journal = []
    this.sessions = []
    this.readings = []
  }
}
