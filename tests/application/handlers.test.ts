import { describe, it, expect } from 'vitest'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import { SubmitCheckInHandler } from '@/application/handlers/SubmitCheckInHandler'
import { AddJournalEntryHandler } from '@/application/handlers/AddJournalEntryHandler'
import { LogCalmSessionHandler } from '@/application/handlers/LogCalmSessionHandler'
import { SaveHeartReadingHandler } from '@/application/handlers/SaveHeartReadingHandler'
import { SaveMotionReadingHandler } from '@/application/handlers/SaveMotionReadingHandler'
import { GetHistoryHandler } from '@/application/handlers/GetHistoryHandler'
import { DeleteAllDataHandler } from '@/application/handlers/DeleteAllDataHandler'

const ANSWERS = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4] // -> score 24, moderate

describe('SubmitCheckInHandler', () => {
  it('persists a dated check-in with correct score/band', async () => {
    const repo = new InMemoryEntryRepository()
    const checkIn = await new SubmitCheckInHandler(repo).execute({
      answers: ANSWERS,
      now: '2026-06-08T09:00:00.000Z',
    })
    expect(checkIn.score).toBe(24)
    expect(checkIn.band).toBe('moderate')
    expect(checkIn.createdAt).toBe('2026-06-08T09:00:00.000Z')

    const stored = await repo.listCheckIns()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).toBe(checkIn.id)
    // No journal note supplied -> none stored.
    expect(await repo.listJournal()).toEqual([])
  })

  it('links a journal note to the check-in when text is supplied', async () => {
    const repo = new InMemoryEntryRepository()
    const checkIn = await new SubmitCheckInHandler(repo).execute({
      answers: ANSWERS,
      journalText: '  rough week  ',
    })
    const journal = await repo.listJournal()
    expect(journal).toHaveLength(1)
    expect(journal[0]?.text).toBe('rough week')
    expect(journal[0]?.checkInId).toBe(checkIn.id)
  })

  it('treats a whitespace-only note as no note', async () => {
    const repo = new InMemoryEntryRepository()
    await new SubmitCheckInHandler(repo).execute({ answers: ANSWERS, journalText: '   ' })
    expect(await repo.listJournal()).toEqual([])
  })

  it('rejects an invalid answer vector', async () => {
    const repo = new InMemoryEntryRepository()
    await expect(
      new SubmitCheckInHandler(repo).execute({ answers: [0, 1, 2] }),
    ).rejects.toBeTruthy()
  })
})

describe('AddJournalEntryHandler', () => {
  it('stores a standalone note', async () => {
    const repo = new InMemoryEntryRepository()
    const entry = await new AddJournalEntryHandler(repo).execute({ text: 'a thought' })
    expect(entry.checkInId).toBeNull()
    expect((await repo.listJournal())[0]?.text).toBe('a thought')
  })
})

describe('LogCalmSessionHandler', () => {
  it('stores a calm session', async () => {
    const repo = new InMemoryEntryRepository()
    const s = await new LogCalmSessionHandler(repo).execute({
      pattern: 'four-seven-eight',
      durationSec: 180,
    })
    expect(s.pattern).toBe('four-seven-eight')
    expect((await repo.listSessions())[0]?.id).toBe(s.id)
  })

  it('rejects an unknown pattern', async () => {
    const repo = new InMemoryEntryRepository()
    await expect(
      // @ts-expect-error invalid pattern id at runtime
      new LogCalmSessionHandler(repo).execute({ pattern: 'nope', durationSec: 60 }),
    ).rejects.toBeTruthy()
  })
})

describe('SaveHeartReadingHandler', () => {
  it('stores heart rate only when no reliable rmssd is supplied (no faked band)', async () => {
    const repo = new InMemoryEntryRepository()
    const reading = await new SaveHeartReadingHandler(repo).execute({
      bpm: 72,
      rmssd: null,
      quality: 'fair',
    })
    expect(reading.bpm).toBe(72)
    expect(reading.rmssd).toBeNull()
    expect(reading.stressBand).toBeNull()
    expect((await repo.listReadings())[0]?.id).toBe(reading.id)
  })

  it('derives a stress band from rmssd via coarse absolute bands for a new user', async () => {
    const repo = new InMemoryEntryRepository()
    const reading = await new SaveHeartReadingHandler(repo).execute({
      bpm: 64,
      rmssd: 12, // low HRV -> high stress, no history yet
      quality: 'good',
    })
    expect(reading.stressBand).toBe('high')
  })

  it('bands relative to the user own rmssd history once enough readings exist', async () => {
    const repo = new InMemoryEntryRepository()
    const handler = new SaveHeartReadingHandler(repo)
    for (const r of [20, 30, 40, 50, 60]) {
      await handler.execute({ bpm: 65, rmssd: r, quality: 'good' })
    }
    // 22 ms is in this user's bottom tertile -> high, even though 22 > absolute 20.
    const reading = await handler.execute({ bpm: 66, rmssd: 22, quality: 'good' })
    expect(reading.stressBand).toBe('high')
  })

  it('rejects an implausible bpm', async () => {
    const repo = new InMemoryEntryRepository()
    await expect(
      new SaveHeartReadingHandler(repo).execute({ bpm: 5, quality: 'good' }),
    ).rejects.toBeTruthy()
  })
})

describe('SaveMotionReadingHandler', () => {
  it('stores a breathing reading with breaths/min only (no faked heart rate)', async () => {
    const repo = new InMemoryEntryRepository()
    const reading = await new SaveMotionReadingHandler(repo).execute({
      breathsPerMin: 12,
      bcgBpm: null,
      quality: 0.7,
    })
    expect(reading.breathsPerMin).toBe(12)
    expect(reading.bcgBpm).toBeNull()
    expect((await repo.listMotionReadings())[0]?.id).toBe(reading.id)
  })

  it('keeps a supplied experimental bcg bpm', async () => {
    const repo = new InMemoryEntryRepository()
    const reading = await new SaveMotionReadingHandler(repo).execute({
      breathsPerMin: 10,
      bcgBpm: 64,
      quality: 0.8,
    })
    expect(reading.bcgBpm).toBe(64)
  })

  it('rejects an implausible breathing rate', async () => {
    const repo = new InMemoryEntryRepository()
    await expect(
      new SaveMotionReadingHandler(repo).execute({ breathsPerMin: 0, quality: 0.5 }),
    ).rejects.toBeTruthy()
  })
})

describe('GetHistoryHandler', () => {
  it('returns check-ins + sessions newest-first and a chronological trend', async () => {
    const repo = new InMemoryEntryRepository()
    const submit = new SubmitCheckInHandler(repo)
    await submit.execute({ answers: ANSWERS, now: '2026-06-01T08:00:00.000Z' }) // score 24
    await submit.execute({ answers: new Array(10).fill(0), now: '2026-06-03T08:00:00.000Z' }) // score 16
    await new LogCalmSessionHandler(repo).execute({
      pattern: 'box',
      durationSec: 60,
      now: '2026-06-02T08:00:00.000Z',
    })
    await new SaveHeartReadingHandler(repo).execute({
      bpm: 70,
      rmssd: 45,
      quality: 'good',
      now: '2026-06-02T09:00:00.000Z',
    })
    await new SaveMotionReadingHandler(repo).execute({
      breathsPerMin: 12,
      bcgBpm: 62,
      quality: 0.7,
      now: '2026-06-02T10:00:00.000Z',
    })

    const history = await new GetHistoryHandler(repo).execute()

    expect(history.checkIns.map((c) => c.createdAt)).toEqual([
      '2026-06-03T08:00:00.000Z',
      '2026-06-01T08:00:00.000Z',
    ])
    expect(history.sessions).toHaveLength(1)
    expect(history.readings).toHaveLength(1)
    expect(history.readings[0]?.bpm).toBe(70)
    expect(history.motionReadings).toHaveLength(1)
    expect(history.motionReadings[0]?.breathsPerMin).toBe(12)
    expect(history.motionReadings[0]?.bcgBpm).toBe(62)
    // Trend is oldest -> newest, one point per check-in, with the date only.
    expect(history.trend).toEqual([
      { date: '2026-06-01', score: 24 },
      { date: '2026-06-03', score: 16 },
    ])
  })

  it('returns empty structures when nothing is stored', async () => {
    const history = await new GetHistoryHandler(new InMemoryEntryRepository()).execute()
    expect(history).toEqual({
      checkIns: [],
      sessions: [],
      readings: [],
      motionReadings: [],
      trend: [],
    })
  })
})

describe('DeleteAllDataHandler', () => {
  it('wipes everything', async () => {
    const repo = new InMemoryEntryRepository()
    await new SubmitCheckInHandler(repo).execute({ answers: ANSWERS, journalText: 'note' })
    await new LogCalmSessionHandler(repo).execute({ pattern: 'box', durationSec: 60 })
    await new SaveHeartReadingHandler(repo).execute({ bpm: 70, rmssd: 40, quality: 'good' })
    await new SaveMotionReadingHandler(repo).execute({ breathsPerMin: 12, quality: 0.6 })

    await new DeleteAllDataHandler(repo).execute()

    expect(await repo.listCheckIns()).toEqual([])
    expect(await repo.listJournal()).toEqual([])
    expect(await repo.listSessions()).toEqual([])
    expect(await repo.listReadings()).toEqual([])
    expect(await repo.listMotionReadings()).toEqual([])
  })
})
