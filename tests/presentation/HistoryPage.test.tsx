import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContainerProvider } from '@/presentation/context/ContainerProvider'
import { HistoryPage } from '@/presentation/components/features/history/HistoryPage'
import { buildContainer } from '@/shared/di/wiring'
import { SubmitCheckInHandler } from '@/application/handlers/SubmitCheckInHandler'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'
import '@/presentation/i18n/config'

/** A repo whose erasure fails, like a blocked localStorage would. */
class FailingDeleteRepository extends InMemoryEntryRepository {
  override async deleteAll(): Promise<void> {
    throw new Error('erasure failed')
  }
}

describe('HistoryPage', () => {
  it('shows a gentle empty state when nothing is stored', async () => {
    render(
      <ContainerProvider container={buildContainer({ inMemory: true })}>
        <HistoryPage />
      </ContainerProvider>,
    )
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    // Privacy note is always present.
    expect(screen.getByText(/Everything stays on your device/)).toBeInTheDocument()
  })

  it('lists a stored check-in and clears it via delete-all', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    await new SubmitCheckInHandler(container.resolve('entryRepo')).execute({
      answers: new Array(10).fill(2),
      now: '2026-06-08T09:00:00.000Z',
    })

    render(
      <ContainerProvider container={container}>
        <HistoryPage />
      </ContainerProvider>,
    )

    // The stored check-in's score (20) appears.
    expect(await screen.findByText(/20 of 40/)).toBeInTheDocument()

    // Delete all -> confirm -> empty state.
    await user.click(screen.getByRole('button', { name: 'Delete all my data' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete it all' }))

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    const repo = container.resolve<{ listCheckIns: () => Promise<unknown[]> }>('entryRepo')
    expect(await repo.listCheckIns()).toEqual([])
  })

  it('keeps the data and surfaces the failure when erasure fails', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    container.register<IEntryRepository>('entryRepo', () => new FailingDeleteRepository())
    await new SubmitCheckInHandler(container.resolve('entryRepo')).execute({
      answers: new Array(10).fill(2),
      now: '2026-06-08T09:00:00.000Z',
    })

    render(
      <ContainerProvider container={container}>
        <HistoryPage />
      </ContainerProvider>,
    )
    expect(await screen.findByText(/20 of 40/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete all my data' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete it all' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't delete/i))
    // Nothing was actually erased, and the confirm dialog is still open for a retry.
    expect(screen.getByRole('button', { name: 'Yes, delete it all' })).toBeEnabled()
    const repo = container.resolve<{ listCheckIns: () => Promise<unknown[]> }>('entryRepo')
    expect(await repo.listCheckIns()).toHaveLength(1)
  })
})
