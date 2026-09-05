import { describe, it, expect } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChestBreathePage } from '@/presentation/components/features/breathe-chest/ChestBreathePage'
import { ContainerProvider } from '@/presentation/context/ContainerProvider'
import { buildContainer } from '@/shared/di/wiring'
import { FakeMotionSource } from '@/infrastructure/motion/FakeMotionSource'
import { TARGET_FPS, type MotionSample } from '@/domain/motion/dsp'
import type { Container } from '@/shared/di/Container'
import type { GetHistoryHandler } from '@/application/handlers/GetHistoryHandler'
import '@/presentation/i18n/config'

const FPS = TARGET_FPS

/**
 * The 1-min session ends when the timestamp-driven elapsed reaches 60 s, so the
 * fixture must exceed that. The DSP math itself is covered in the domain tests;
 * here we only need to reach the frozen result + save a reading. Web Audio is a
 * no-op in jsdom (the audio module swallows it), so no audio mock is needed.
 */
const SECONDS = 64

/** ≈12 br/min breathing + a small ≈60 bpm cardiac recoil on z. */
function chestSignal(): MotionSample[] {
  const out: MotionSample[] = []
  const step = 1000 / FPS
  for (let i = 0; i < FPS * SECONDS; i++) {
    const tSec = i / FPS
    const breath = Math.sin(2 * Math.PI * (12 / 60) * tSec)
    const heart = 0.35 * Math.sin(2 * Math.PI * (60 / 60) * tSec)
    out.push({ t: i * step, x: 0, y: 0, z: breath + heart + 9.8 })
  }
  return out
}

function renderWithContainer(ui: React.ReactElement, container: Container) {
  return render(<ContainerProvider container={container}>{ui}</ContainerProvider>)
}

async function selectOneMinute(user: ReturnType<typeof userEvent.setup>) {
  // The 1-min duration button is the shortest selectable session.
  await user.click(screen.getByRole('button', { name: '1 min' }))
}

describe('ChestBreathePage (audio-guided session with a fake motion source)', () => {
  it('shows the safety notice, guidance and a start control before the session', () => {
    const container = buildContainer({ inMemory: true })
    renderWithContainer(
      <ChestBreathePage onDone={() => {}} createSource={() => new FakeMotionSource([], FPS)} />,
      container,
    )
    expect(screen.getByText(/Not a medical device/i)).toBeInTheDocument()
    expect(screen.getByText(/rest the phone flat on your chest/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('runs a session, freezes a breaths/min result and saves a reading', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    const source = new FakeMotionSource(chestSignal(), FPS)
    renderWithContainer(
      <ChestBreathePage onDone={() => {}} createSource={() => source} />,
      container,
    )

    await selectOneMinute(user)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    // The replay drives React state outside any event handler; act() flushes the
    // resulting render before we assert, instead of leaving it to the scheduler.
    await act(async () => {
      source.flush()
    })

    await screen.findByText('Your reading')

    // A plausible breathing number is rendered (10–14 br/min), not the em-dash.
    const breathBlock = screen.getByText('br/min').closest('div')?.textContent ?? ''
    const num = Number(breathBlock.replace(/[^\d]/g, ''))
    expect(num).toBeGreaterThanOrEqual(10)
    expect(num).toBeLessThanOrEqual(14)

    // Save persists a motion reading via the wired handler.
    await user.click(screen.getByRole('button', { name: 'Save to history' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
    })

    const history = await container.resolve<GetHistoryHandler>('getHistory').execute()
    expect(history.motionReadings).toHaveLength(1)
    expect(history.motionReadings[0]?.breathsPerMin).toBe(num)
  })

  it('requests permission on the start gesture and shows a clear message when denied', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    const source = new FakeMotionSource([], FPS, { needsPermission: true, permission: 'denied' })
    renderWithContainer(
      <ChestBreathePage onDone={() => {}} createSource={() => source} />,
      container,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Motion access was declined/i)
    })
    expect(source.requestCount).toBe(1)
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })
})
