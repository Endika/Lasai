import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContainerProvider } from '@/presentation/context/ContainerProvider'
import { HistoryPage } from '@/presentation/components/features/history/HistoryPage'
import { buildContainer } from '@/shared/di/wiring'
import { SubmitCheckInHandler } from '@/application/handlers/SubmitCheckInHandler'
import '@/presentation/i18n/config'

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
})
