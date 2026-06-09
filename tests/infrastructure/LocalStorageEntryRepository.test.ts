import { describe, it, expect, beforeEach } from 'vitest'
import {
  ENTRY_LIST_CAP,
  ENTRY_STORE_KEY,
  LocalStorageEntryRepository,
} from '@/infrastructure/persistence/LocalStorageEntryRepository'
import { createCheckIn } from '@/domain/entities/CheckIn'
import { createJournalEntry } from '@/domain/entities/JournalEntry'
import { createCalmSession } from '@/domain/entities/CalmSession'
import { createHeartReading } from '@/domain/entities/HeartReading'
import { createMotionReading } from '@/domain/entities/MotionReading'

const ANSWERS = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]

describe('LocalStorageEntryRepository', () => {
  let repo: LocalStorageEntryRepository

  beforeEach(() => {
    window.localStorage.clear()
    repo = new LocalStorageEntryRepository()
  })

  it('round-trips check-ins, journal, sessions, heart and motion readings', async () => {
    const c = createCheckIn({ answers: ANSWERS })
    const j = createJournalEntry({ text: 'a note', checkInId: c.id })
    const s = createCalmSession({ pattern: 'four-seven-eight', durationSec: 300 })
    const r = createHeartReading({ bpm: 66, rmssd: 38, stressBand: 'moderate', quality: 'good' })
    const m = createMotionReading({ breathsPerMin: 12, bcgBpm: 62, quality: 0.7 })
    await repo.addCheckIn(c)
    await repo.addJournal(j)
    await repo.addSession(s)
    await repo.addReading(r)
    await repo.addMotionReading(m)

    expect(await repo.listCheckIns()).toEqual([c])
    expect(await repo.listJournal()).toEqual([j])
    expect(await repo.listSessions()).toEqual([s])
    expect(await repo.listReadings()).toEqual([r])
    expect(await repo.listMotionReadings()).toEqual([m])

    // Survives a fresh instance reading the same backing store.
    const repo2 = new LocalStorageEntryRepository()
    expect((await repo2.listReadings())[0]?.id).toBe(r.id)
    expect((await repo2.listMotionReadings())[0]?.id).toBe(m.id)
  })

  it('migrates an old (pre-motion) blob: motionReadings defaults to empty', async () => {
    window.localStorage.setItem(
      ENTRY_STORE_KEY,
      JSON.stringify({
        checkIns: [],
        journal: [],
        sessions: [],
        readings: [],
        _schemaVersion: 2,
      }),
    )
    expect(await repo.listMotionReadings()).toEqual([])
    // And a new motion reading can be added on top without losing the rest.
    const m = createMotionReading({ breathsPerMin: 10, quality: 0.6 })
    await repo.addMotionReading(m)
    expect((await repo.listMotionReadings())[0]?.id).toBe(m.id)
  })

  it('deleteAll clears the key', async () => {
    await repo.addCheckIn(createCheckIn({ answers: ANSWERS }))
    await repo.addReading(createHeartReading({ bpm: 70, quality: 'fair' }))
    await repo.addMotionReading(createMotionReading({ breathsPerMin: 11, quality: 0.6 }))
    await repo.deleteAll()
    expect(await repo.listCheckIns()).toEqual([])
    expect(await repo.listReadings()).toEqual([])
    expect(await repo.listMotionReadings()).toEqual([])
    expect(window.localStorage.getItem(ENTRY_STORE_KEY)).toBeNull()
  })

  it('tolerates corrupt JSON in storage (reads as empty, no throw)', async () => {
    window.localStorage.setItem(ENTRY_STORE_KEY, '{ this is : not json')
    expect(await repo.listCheckIns()).toEqual([])
    expect(await repo.listJournal()).toEqual([])
    expect(await repo.listSessions()).toEqual([])
  })

  it('tolerates a valid-JSON-but-wrong-shape blob and drops bad items', async () => {
    window.localStorage.setItem(
      ENTRY_STORE_KEY,
      JSON.stringify({
        checkIns: [
          { id: 'bad' }, // invalid -> dropped
          { id: 'ok', createdAt: '2026-06-08', answers: ANSWERS, score: 20, band: 'moderate' },
        ],
        journal: 'not-an-array',
        sessions: 42,
      }),
    )
    const checkIns = await repo.listCheckIns()
    expect(checkIns.map((c) => c.id)).toEqual(['ok'])
    expect(await repo.listJournal()).toEqual([])
    expect(await repo.listSessions()).toEqual([])
  })

  it('caps each list to the newest ENTRY_LIST_CAP items', async () => {
    const total = ENTRY_LIST_CAP + 5
    for (let i = 0; i < total; i++) {
      await repo.addSession(
        createCalmSession({
          pattern: 'box',
          durationSec: 60,
          now: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        }),
      )
    }
    const sessions = await repo.listSessions()
    expect(sessions).toHaveLength(ENTRY_LIST_CAP)
    // Oldest 5 were trimmed; the last-added one survives.
    const last = new Date(2026, 0, 1, 0, 0, total - 1).toISOString()
    expect(sessions.at(-1)?.createdAt).toBe(last)
  })
})
