import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContainerProvider } from '@/presentation/context/ContainerProvider'
import { CalmSession } from '@/presentation/components/features/calm/CalmSession'
import { buildContainer } from '@/shared/di/wiring'
import { InMemoryEntryRepository } from '@/infrastructure/persistence/InMemoryEntryRepository'
import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'
import '@/presentation/i18n/config'

/** A repo whose write path fails, like a full or blocked localStorage would. */
class FailingSessionRepository extends InMemoryEntryRepository {
  override async addSession(): Promise<void> {
    throw new Error('write failed')
  }
}

function renderCalm() {
  const container = buildContainer({ inMemory: true })
  render(
    <ContainerProvider container={container}>
      <CalmSession onHome={() => {}} />
    </ContainerProvider>,
  )
  return container
}

describe('CalmSession', () => {
  it('starts a session, paces breathing, and logs it on finish', async () => {
    const user = userEvent.setup()
    const container = renderCalm()

    // Setup screen offers pattern + duration + sound toggle (off by default).
    expect(screen.getByText('Box breathing')).toBeInTheDocument()
    const soundSwitch = screen.getByRole('switch')
    expect(soundSwitch).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('button', { name: 'Begin' }))

    // Running: the pacer shows a phase label (live region).
    expect(await screen.findByText('Breathe in')).toBeInTheDocument()
    expect(screen.getByText('Time remaining')).toBeInTheDocument()

    // Finish early.
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    // Done screen + a logged session.
    expect(await screen.findByText('Well done')).toBeInTheDocument()
    const repo = container.resolve<{ listSessions: () => Promise<{ pattern: string }[]> }>(
      'entryRepo',
    )
    const sessions = await repo.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.pattern).toBe('box')
  })

  it('reaches the done screen and surfaces the failure when logging fails', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    container.register<IEntryRepository>('entryRepo', () => new FailingSessionRepository())
    render(
      <ContainerProvider container={container}>
        <CalmSession onHome={() => {}} />
      </ContainerProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Begin' }))
    await screen.findByText('Breathe in')
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    // The done screen still shows — logging failure never blocks it.
    expect(await screen.findByText('Well done')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save/i)
  })

  it('keeps ambient sound off by default and toggles it', async () => {
    const user = userEvent.setup()
    renderCalm()
    const soundSwitch = screen.getByRole('switch')
    expect(soundSwitch).toHaveAttribute('aria-checked', 'false')
    await user.click(soundSwitch)
    expect(soundSwitch).toHaveAttribute('aria-checked', 'true')
  })
})
