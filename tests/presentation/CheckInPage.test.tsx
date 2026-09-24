import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContainerProvider } from '@/presentation/context/ContainerProvider'
import { CheckInPage } from '@/presentation/components/features/checkin/CheckInPage'
import { buildContainer } from '@/shared/di/wiring'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'
import '@/presentation/i18n/config'

/** A repo whose write path fails, like a full or blocked localStorage would. */
class FailingCheckInRepository extends InMemoryEntryRepository {
  override async addCheckInWithJournal(): Promise<void> {
    throw new Error('write failed')
  }
}

/** Fails the check-in+journal write exactly once, then behaves normally. */
class FlakyOnceCheckInRepository extends InMemoryEntryRepository {
  private failNext = true
  override async addCheckInWithJournal(
    ...args: Parameters<InMemoryEntryRepository['addCheckInWithJournal']>
  ): Promise<void> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('write failed')
    }
    return super.addCheckInWithJournal(...args)
  }
}

function renderCheckIn() {
  const container = buildContainer({ inMemory: true })
  render(
    <ContainerProvider container={container}>
      <CheckInPage onCalm={() => {}} onDone={() => {}} />
    </ContainerProvider>,
  )
  return container
}

describe('CheckInPage', () => {
  it('shows the score and band after completing the PSS-10', async () => {
    const user = userEvent.setup()
    renderCheckIn()

    // Answer every item with "Very often" (value 4) -> reverse items flip -> score 24, moderate.
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(10)
    for (const item of items) {
      const veryOften = within(item).getByRole('button', { name: 'Very often' })
      await user.click(veryOften)
    }

    await user.click(screen.getByRole('button', { name: 'See my reflection' }))

    // Result screen: score 24 and the moderate band copy.
    expect(await screen.findByText('24')).toBeInTheDocument()
    expect(screen.getByText('Moderate stress right now')).toBeInTheDocument()
    // Attribution + disclaimer are present.
    expect(screen.getByText('Perceived Stress Scale, Cohen et al.')).toBeInTheDocument()
    expect(screen.getByText('This is for self-reflection, not a diagnosis.')).toBeInTheDocument()
  })

  it('blocks submit until every item is answered', async () => {
    const user = userEvent.setup()
    const container = renderCheckIn()

    await user.click(screen.getByRole('button', { name: 'See my reflection' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Nothing was stored.
    const repo = container.resolve<{ listCheckIns: () => Promise<unknown[]> }>('entryRepo')
    expect(await repo.listCheckIns()).toEqual([])
  })

  it('persists the check-in via the handler', async () => {
    const user = userEvent.setup()
    const container = renderCheckIn()

    for (const item of screen.getAllByRole('listitem')) {
      await user.click(within(item).getByRole('button', { name: 'Never' }))
    }
    await user.click(screen.getByRole('button', { name: 'See my reflection' }))
    await screen.findByText(/of 40/)

    const repo = container.resolve<{ listCheckIns: () => Promise<{ score: number }[]> }>(
      'entryRepo',
    )
    const stored = await repo.listCheckIns()
    expect(stored).toHaveLength(1)
    // All "Never" (0); reverse items (4) contribute 4 each -> score 16.
    expect(stored[0]?.score).toBe(16)
  })

  it('never shows the result when the write fails, and surfaces the failure', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    container.register<IEntryRepository>('entryRepo', () => new FailingCheckInRepository())
    render(
      <ContainerProvider container={container}>
        <CheckInPage onCalm={() => {}} onDone={() => {}} />
      </ContainerProvider>,
    )

    for (const item of screen.getAllByRole('listitem')) {
      await user.click(within(item).getByRole('button', { name: 'Never' }))
    }
    await user.click(screen.getByRole('button', { name: 'See my reflection' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't save/i))
    // Stayed on the form: no result screen, submit is available again.
    expect(screen.queryByText(/of 40/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See my reflection' })).toBeEnabled()

    const repo = container.resolve<{ listCheckIns: () => Promise<unknown[]> }>('entryRepo')
    expect(await repo.listCheckIns()).toEqual([])
  })

  it('a retry after a failed save stores exactly one check-in, never a duplicate', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    container.register<IEntryRepository>('entryRepo', () => new FlakyOnceCheckInRepository())
    render(
      <ContainerProvider container={container}>
        <CheckInPage onCalm={() => {}} onDone={() => {}} />
      </ContainerProvider>,
    )

    for (const item of screen.getAllByRole('listitem')) {
      await user.click(within(item).getByRole('button', { name: 'Never' }))
    }
    await user.click(screen.getByRole('button', { name: 'See my reflection' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't save/i))

    // Retry, same form state: the failed attempt must not have stored anything.
    await user.click(screen.getByRole('button', { name: 'See my reflection' }))
    await screen.findByText(/of 40/)

    const repo = container.resolve<{ listCheckIns: () => Promise<unknown[]> }>('entryRepo')
    expect(await repo.listCheckIns()).toHaveLength(1)
  })
})
