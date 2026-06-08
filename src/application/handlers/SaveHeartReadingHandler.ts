import {
  SaveHeartReadingSchema,
  type SaveHeartReadingInput,
} from '@/application/dtos/SaveHeartReadingDTO'
import { createHeartReading, type HeartReading } from '@/domain/entities/HeartReading'
import { stressBandFromRmssd } from '@/domain/ppg/dsp'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'

/**
 * Persists a camera-PPG reading. When a trustworthy RMSSD is supplied, derives
 * the stress band relative to the user's own RMSSD history (falling back to
 * coarse absolute bands for new users); otherwise stores heart rate only and
 * leaves the band null. We never fabricate a stress estimate without HRV.
 */
export class SaveHeartReadingHandler {
  constructor(private readonly repo: IEntryRepository) {}

  async execute(input: SaveHeartReadingInput): Promise<HeartReading> {
    const parsed = SaveHeartReadingSchema.parse(input)

    let stressBand = null
    if (parsed.rmssd !== null) {
      const history = (await this.repo.listReadings())
        .map((r) => r.rmssd)
        .filter((v): v is number => v !== null)
      stressBand = stressBandFromRmssd(parsed.rmssd, history)
    }

    const reading = createHeartReading({
      bpm: parsed.bpm,
      rmssd: parsed.rmssd,
      stressBand,
      quality: parsed.quality,
      now: parsed.now,
    })
    await this.repo.addReading(reading)
    return reading
  }
}
