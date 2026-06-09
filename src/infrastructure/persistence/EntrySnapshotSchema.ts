import { z } from 'zod'
import { STRESS_BANDS } from '@/domain/value-objects/StressBand'
import { BREATHING_PATTERN_IDS } from '@/domain/value-objects/BreathingPattern'
import { CALM_SESSION_MAX_DURATION_SEC } from '@/domain/entities/CalmSession'
import { SCHEMA_VERSION } from '@/infrastructure/persistence/schemaVersion'
import type { CheckIn } from '@/domain/entities/CheckIn'
import type { JournalEntry } from '@/domain/entities/JournalEntry'
import type { CalmSession } from '@/domain/entities/CalmSession'
import type { HeartReading } from '@/domain/entities/HeartReading'
import type { MotionReading } from '@/domain/entities/MotionReading'

const READING_QUALITIES = ['good', 'fair', 'poor'] as const

export const CheckInSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  answers: z.array(z.number().int().min(0).max(4)).length(10),
  score: z.number().int().min(0).max(40),
  band: z.enum(STRESS_BANDS),
})

export const JournalEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  text: z.string().min(1).max(1000),
  checkInId: z.string().min(1).nullable().default(null),
})

export const CalmSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  pattern: z.enum(BREATHING_PATTERN_IDS),
  durationSec: z.number().int().min(1).max(CALM_SESSION_MAX_DURATION_SEC),
})

export const HeartReadingSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  bpm: z.number().int().min(30).max(240),
  rmssd: z.number().min(0).nullable().default(null),
  stressBand: z.enum(STRESS_BANDS).nullable().default(null),
  quality: z.enum(READING_QUALITIES),
})

export const MotionReadingSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  breathsPerMin: z.number().int().min(1).max(60),
  bcgBpm: z.number().int().min(30).max(240).nullable().default(null),
  quality: z.number().min(0).max(1),
})

/**
 * Top-level stored shape. Every list is independently tolerant: a single
 * corrupt element is dropped (catch → never via per-item parsing in the repo),
 * and a wholly invalid blob falls back to empty defaults.
 */
export const EntryStoreSchema = z.object({
  checkIns: z.array(CheckInSchema).default([]),
  journal: z.array(JournalEntrySchema).default([]),
  sessions: z.array(CalmSessionSchema).default([]),
  readings: z.array(HeartReadingSchema).default([]),
  motionReadings: z.array(MotionReadingSchema).default([]),
  _schemaVersion: z.number().int().default(SCHEMA_VERSION),
})

export type EntryStore = z.infer<typeof EntryStoreSchema>

export function emptyStore(): EntryStore {
  return {
    checkIns: [],
    journal: [],
    sessions: [],
    readings: [],
    motionReadings: [],
    _schemaVersion: SCHEMA_VERSION,
  }
}

/**
 * Parse a raw stored value into an EntryStore, tolerating corruption: a missing
 * or malformed blob yields empty defaults rather than throwing. Within a valid
 * blob, individual malformed items are dropped so one bad record never wipes the rest.
 */
export function parseEntryStore(raw: unknown): EntryStore {
  if (raw === null || typeof raw !== 'object') return emptyStore()
  const obj = raw as Record<string, unknown>
  return {
    checkIns: parseList(obj.checkIns, CheckInSchema),
    journal: parseList(obj.journal, JournalEntrySchema),
    sessions: parseList(obj.sessions, CalmSessionSchema),
    readings: parseList(obj.readings, HeartReadingSchema),
    // Old (pre-v3) blobs lack this list; it defaults to [] so they migrate cleanly.
    motionReadings: parseList(obj.motionReadings, MotionReadingSchema),
    _schemaVersion: typeof obj._schemaVersion === 'number' ? obj._schemaVersion : SCHEMA_VERSION,
  }
}

function parseList<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return []
  const out: T[] = []
  for (const item of value) {
    const result = schema.safeParse(item)
    if (result.success) out.push(result.data)
  }
  return out
}

// Re-exported so consumers don't reach across to the entity modules just for types.
export type { CheckIn, JournalEntry, CalmSession, HeartReading, MotionReading }
