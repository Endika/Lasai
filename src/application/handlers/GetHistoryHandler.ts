import type { CheckIn } from '@/domain/entities/CheckIn'
import type { CalmSession } from '@/domain/entities/CalmSession'
import type { HeartReading } from '@/domain/entities/HeartReading'
import type { MotionReading } from '@/domain/entities/MotionReading'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'

/** One point of the PSS trend chart: a calendar date and that day's score. */
export interface TrendPoint {
  date: string // YYYY-MM-DD (from the check-in's createdAt)
  score: number
}

export interface HistoryResult {
  /** Check-ins, newest first. */
  checkIns: CheckIn[]
  /** Calm sessions, newest first. */
  sessions: CalmSession[]
  /** Camera-PPG heart readings, newest first. */
  readings: HeartReading[]
  /** Chest-motion breathing readings, newest first. */
  motionReadings: MotionReading[]
  /** PSS scores over time, oldest -> newest, for a line/sparkline chart. */
  trend: TrendPoint[]
}

function byCreatedAtDesc(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt)
}

/** Reads stored history and derives a chronological PSS trend series. */
export class GetHistoryHandler {
  constructor(private readonly repo: IEntryRepository) {}

  async execute(): Promise<HistoryResult> {
    const [checkIns, sessions, readings, motionReadings] = await Promise.all([
      this.repo.listCheckIns(),
      this.repo.listSessions(),
      this.repo.listReadings(),
      this.repo.listMotionReadings(),
    ])

    const sortedCheckIns = [...checkIns].sort(byCreatedAtDesc)
    const sortedSessions = [...sessions].sort(byCreatedAtDesc)
    const sortedReadings = [...readings].sort(byCreatedAtDesc)
    const sortedMotionReadings = [...motionReadings].sort(byCreatedAtDesc)

    // Trend is oldest -> newest so a chart reads left to right.
    const trend: TrendPoint[] = [...checkIns]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ date: c.createdAt.slice(0, 10), score: c.score }))

    return {
      checkIns: sortedCheckIns,
      sessions: sortedSessions,
      readings: sortedReadings,
      motionReadings: sortedMotionReadings,
      trend,
    }
  }
}
