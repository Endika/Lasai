import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'
import type { CheckIn } from '@/domain/entities/CheckIn'
import type { JournalEntry } from '@/domain/entities/JournalEntry'
import type { CalmSession } from '@/domain/entities/CalmSession'
import {
  emptyStore,
  parseEntryStore,
  type EntryStore,
} from '@/infrastructure/persistence/EntrySnapshotSchema'
import { SCHEMA_VERSION } from '@/infrastructure/persistence/schemaVersion'

export const ENTRY_STORE_KEY = 'lasai.entries.v1'
/** Newest-N cap per list, to bound localStorage growth. */
export const ENTRY_LIST_CAP = 500

/** Keep the newest `cap` items, assuming `items` is ordered oldest -> newest. */
function capNewest<T>(items: T[], cap: number): T[] {
  return items.length > cap ? items.slice(items.length - cap) : items
}

/**
 * Local-only repository: a single JSON blob under one key, zod-validated on
 * read (corruption tolerated → empty), each list capped to the newest N.
 * No network, ever.
 */
export class LocalStorageEntryRepository implements IEntryRepository {
  constructor(private readonly storage: Storage = window.localStorage) {}

  private read(): EntryStore {
    try {
      const raw = this.storage.getItem(ENTRY_STORE_KEY)
      if (!raw) return emptyStore()
      return parseEntryStore(JSON.parse(raw))
    } catch {
      // Malformed JSON or unavailable storage — start clean rather than throw.
      return emptyStore()
    }
  }

  private write(store: EntryStore): void {
    const bounded: EntryStore = {
      checkIns: capNewest(store.checkIns, ENTRY_LIST_CAP),
      journal: capNewest(store.journal, ENTRY_LIST_CAP),
      sessions: capNewest(store.sessions, ENTRY_LIST_CAP),
      _schemaVersion: SCHEMA_VERSION,
    }
    try {
      this.storage.setItem(ENTRY_STORE_KEY, JSON.stringify(bounded))
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }

  async addCheckIn(checkIn: CheckIn): Promise<void> {
    const store = this.read()
    this.write({ ...store, checkIns: [...store.checkIns, checkIn] })
  }

  async listCheckIns(): Promise<CheckIn[]> {
    return this.read().checkIns
  }

  async addJournal(entry: JournalEntry): Promise<void> {
    const store = this.read()
    this.write({ ...store, journal: [...store.journal, entry] })
  }

  async listJournal(): Promise<JournalEntry[]> {
    return this.read().journal
  }

  async addSession(session: CalmSession): Promise<void> {
    const store = this.read()
    this.write({ ...store, sessions: [...store.sessions, session] })
  }

  async listSessions(): Promise<CalmSession[]> {
    return this.read().sessions
  }

  async deleteAll(): Promise<void> {
    try {
      this.storage.removeItem(ENTRY_STORE_KEY)
    } catch {
      /* unavailable — non-fatal */
    }
  }
}
