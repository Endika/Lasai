import { describe, it, expect } from 'vitest'
import { createCheckIn } from '@/domain/entities/CheckIn'
import { createJournalEntry } from '@/domain/entities/JournalEntry'
import { createCalmSession } from '@/domain/entities/CalmSession'

describe('createCheckIn', () => {
  it('computes score + band and stamps id/createdAt', () => {
    const c = createCheckIn({ answers: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], now: '2026-06-08T10:00:00.000Z' })
    expect(c.score).toBe(24)
    expect(c.band).toBe('moderate')
    expect(c.id).toMatch(/[0-9a-f-]{36}/)
    expect(c.createdAt).toBe('2026-06-08T10:00:00.000Z')
  })

  it('rejects invalid answers', () => {
    expect(() => createCheckIn({ answers: [0, 0, 0] })).toThrow()
  })
})

describe('createJournalEntry', () => {
  it('trims text and defaults checkInId to null', () => {
    const j = createJournalEntry({ text: '  busy day  ' })
    expect(j.text).toBe('busy day')
    expect(j.checkInId).toBeNull()
  })

  it('rejects empty and over-long text', () => {
    expect(() => createJournalEntry({ text: '   ' })).toThrow()
    expect(() => createJournalEntry({ text: 'x'.repeat(1001) })).toThrow()
  })
})

describe('createCalmSession', () => {
  it('accepts a valid pattern + duration', () => {
    const s = createCalmSession({ pattern: 'box', durationSec: 180 })
    expect(s.pattern).toBe('box')
    expect(s.durationSec).toBe(180)
  })

  it('rejects unknown pattern and bad duration', () => {
    // @ts-expect-error testing runtime guard on an invalid pattern id
    expect(() => createCalmSession({ pattern: 'nope', durationSec: 60 })).toThrow()
    expect(() => createCalmSession({ pattern: 'box', durationSec: 0 })).toThrow()
    expect(() => createCalmSession({ pattern: 'box', durationSec: 1.5 })).toThrow()
  })
})
