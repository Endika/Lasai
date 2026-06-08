import {
  LogCalmSessionSchema,
  type LogCalmSessionInput,
} from '@/application/dtos/LogCalmSessionDTO'
import { createCalmSession, type CalmSession } from '@/domain/entities/CalmSession'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'

/** Records a completed (or closed) breathing/calm session. */
export class LogCalmSessionHandler {
  constructor(private readonly repo: IEntryRepository) {}

  async execute(input: LogCalmSessionInput): Promise<CalmSession> {
    const parsed = LogCalmSessionSchema.parse(input)
    const session = createCalmSession({
      pattern: parsed.pattern,
      durationSec: parsed.durationSec,
      now: parsed.now,
    })
    await this.repo.addSession(session)
    return session
  }
}
