import { z } from 'zod'
import { BREATHING_PATTERN_IDS } from '@/domain/value-objects/BreathingPattern'
import { CALM_SESSION_MAX_DURATION_SEC } from '@/domain/entities/CalmSession'

export const LogCalmSessionSchema = z.object({
  pattern: z.enum(BREATHING_PATTERN_IDS),
  durationSec: z.number().int().min(1).max(CALM_SESSION_MAX_DURATION_SEC),
  now: z.string().optional(),
})

export type LogCalmSessionInput = z.input<typeof LogCalmSessionSchema>
