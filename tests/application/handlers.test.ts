import { describe, it, expect } from 'vitest'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import { SubmitCheckInHandler } from '@/application/handlers/SubmitCheckInHandler'
import { AddJournalEntryHandler } from '@/application/handlers/AddJournalEntryHandler'
import { LogCalmSessionHandler } from '@/application/handlers/LogCalmSessionHandler'
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

    const history = await new GetHistoryHandler(repo).execute()

    expect(history.checkIns.map((c) => c.createdAt)).toEqual([
      '2026-06-03T08:00:00.000Z',
      '2026-06-01T08:00:00.000Z',
    ])
    expect(history.sessions).toHaveLength(1)
    // Trend is oldest -> newest, one point per check-in, with the date only.
    expect(history.trend).toEqual([
      { date: '2026-06-01', score: 24 },
      { date: '2026-06-03', score: 16 },
    ])
  })

  it('returns empty structures when nothing is stored', async () => {
    const history = await new GetHistoryHandler(new InMemoryEntryRepository()).execute()
    expect(history).toEqual({ checkIns: [], sessions: [], trend: [] })
  })
})

describe('DeleteAllDataHandler', () => {
  it('wipes everything', async () => {
    const repo = new InMemoryEntryRepository()
    await new SubmitCheckInHandler(repo).execute({ answers: ANSWERS, journalText: 'note' })
    await new LogCalmSessionHandler(repo).execute({ pattern: 'box', durationSec: 60 })

    await new DeleteAllDataHandler(repo).execute()

    expect(await repo.listCheckIns()).toEqual([])
    expect(await repo.listJournal()).toEqual([])
    expect(await repo.listSessions()).toEqual([])
  })
})
