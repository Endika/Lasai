import {
  SaveMotionReadingSchema,
  type SaveMotionReadingInput,
} from '@/application/dtos/SaveMotionReadingDTO'
import { createMotionReading, type MotionReading } from '@/domain/entities/MotionReading'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'

/**
 * Persists a chest-motion breathing reading. breaths/min is always stored; the
 * experimental BCG heart rate is stored only when supplied (the UI passes it
 * solely when its quality cleared the bar) — we never invent a heart number.
 */
export class SaveMotionReadingHandler {
  constructor(private readonly repo: IEntryRepository) {}

  async execute(input: SaveMotionReadingInput): Promise<MotionReading> {
    const parsed = SaveMotionReadingSchema.parse(input)

    const reading = createMotionReading({
      breathsPerMin: parsed.breathsPerMin,
      bcgBpm: parsed.bcgBpm,
      quality: parsed.quality,
      now: parsed.now,
    })
    await this.repo.addMotionReading(reading)
    return reading
  }
}
