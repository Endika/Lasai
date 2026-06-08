import { describe, it, expect } from 'vitest'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import { ENTRY_LIST_CAP } from '@/infrastructure/persistence/LocalStorageEntryRepository'
import { createCheckIn } from '@/domain/entities/CheckIn'
import { createCalmSession } from '@/domain/entities/CalmSession'
import { createHeartReading } from '@/domain/entities/HeartReading'

const ANSWERS = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]

describe('InMemoryEntryRepository', () => {
  it('round-trips and isolates stored data (returns clones)', async () => {
    const repo = new InMemoryEntryRepository()
    const c = createCheckIn({ answers: ANSWERS })
    await repo.addCheckIn(c)
    const listed = await repo.listCheckIns()
    listed[0]!.score = 999 // mutating the returned copy must not affect storage
    expect((await repo.listCheckIns())[0]?.score).toBe(c.score)
  })

  it('round-trips a heart reading and isolates stored data', async () => {
    const repo = new InMemoryEntryRepository()
    const reading = createHeartReading({
      bpm: 68,
      rmssd: 42,
      stressBand: 'moderate',
      quality: 'good',
    })
    await repo.addReading(reading)
    const listed = await repo.listReadings()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.bpm).toBe(68)
    expect(listed[0]?.rmssd).toBe(42)
    expect(listed[0]?.stressBand).toBe('moderate')
    listed[0]!.bpm = 999 // mutating the returned copy must not affect storage
    expect((await repo.listReadings())[0]?.bpm).toBe(68)
  })

  it('deleteAll wipes every list', async () => {
    const repo = new InMemoryEntryRepository()
    await repo.addCheckIn(createCheckIn({ answers: ANSWERS }))
    await repo.addSession(createCalmSession({ pattern: 'box', durationSec: 60 }))
    await repo.addReading(createHeartReading({ bpm: 70, quality: 'fair' }))
    await repo.deleteAll()
    expect(await repo.listCheckIns()).toEqual([])
    expect(await repo.listSessions()).toEqual([])
    expect(await repo.listReadings()).toEqual([])
  })

  it('enforces the same newest-N cap as the local repo', async () => {
    const repo = new InMemoryEntryRepository()
    for (let i = 0; i < ENTRY_LIST_CAP + 3; i++) {
      await repo.addCheckIn(createCheckIn({ answers: ANSWERS, now: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z` }))
    }
    expect(await repo.listCheckIns()).toHaveLength(ENTRY_LIST_CAP)
  })
})
