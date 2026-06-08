import { describe, it, expect } from 'vitest'
import { buildContainer } from '@/shared/di/wiring'
import { SubmitCheckInHandler } from '@/application/handlers/SubmitCheckInHandler'
import { GetHistoryHandler } from '@/application/handlers/GetHistoryHandler'
import { DeleteAllDataHandler } from '@/application/handlers/DeleteAllDataHandler'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import { LocalStorageEntryRepository } from '@/infrastructure/persistence/LocalStorageEntryRepository'

describe('wiring', () => {
  it('resolves handlers backed by the in-memory repo in test mode', () => {
    const c = buildContainer({ inMemory: true })
    expect(c.resolve('submitCheckIn')).toBeInstanceOf(SubmitCheckInHandler)
    expect(c.resolve('getHistory')).toBeInstanceOf(GetHistoryHandler)
    expect(c.resolve('deleteAllData')).toBeInstanceOf(DeleteAllDataHandler)
    expect(c.resolve('entryRepo')).toBeInstanceOf(InMemoryEntryRepository)
  })

  it('uses the localStorage repo by default', () => {
    const c = buildContainer()
    expect(c.resolve('entryRepo')).toBeInstanceOf(LocalStorageEntryRepository)
  })

  it('shares one repo singleton across handlers', async () => {
    const c = buildContainer({ inMemory: true })
    const submit = c.resolve<SubmitCheckInHandler>('submitCheckIn')
    const history = c.resolve<GetHistoryHandler>('getHistory')
    await submit.execute({ answers: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4] })
    expect((await history.execute()).checkIns).toHaveLength(1)
  })
})
