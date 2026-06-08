import { Container } from '@/shared/di/Container'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'
import { LocalStorageEntryRepository } from '@/infrastructure/persistence/LocalStorageEntryRepository'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import { SubmitCheckInHandler } from '@/application/handlers/SubmitCheckInHandler'
import { AddJournalEntryHandler } from '@/application/handlers/AddJournalEntryHandler'
import { LogCalmSessionHandler } from '@/application/handlers/LogCalmSessionHandler'
import { SaveHeartReadingHandler } from '@/application/handlers/SaveHeartReadingHandler'
import { GetHistoryHandler } from '@/application/handlers/GetHistoryHandler'
import { DeleteAllDataHandler } from '@/application/handlers/DeleteAllDataHandler'

export function buildContainer(opts: { inMemory?: boolean } = {}): Container {
  const c = new Container()
  c.register<IEntryRepository>('entryRepo', () =>
    opts.inMemory ? new InMemoryEntryRepository() : new LocalStorageEntryRepository(),
  )
  c.register('submitCheckIn', () => new SubmitCheckInHandler(c.resolve('entryRepo')))
  c.register('addJournalEntry', () => new AddJournalEntryHandler(c.resolve('entryRepo')))
  c.register('logCalmSession', () => new LogCalmSessionHandler(c.resolve('entryRepo')))
  c.register('saveHeartReading', () => new SaveHeartReadingHandler(c.resolve('entryRepo')))
  c.register('getHistory', () => new GetHistoryHandler(c.resolve('entryRepo')))
  c.register('deleteAllData', () => new DeleteAllDataHandler(c.resolve('entryRepo')))
  return c
}
