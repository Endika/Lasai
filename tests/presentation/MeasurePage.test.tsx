import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MeasurePage } from '@/presentation/components/features/measure/MeasurePage'
import { ContainerProvider } from '@/presentation/context/ContainerProvider'
import { buildContainer } from '@/shared/di/wiring'
import { FakeSignalSource } from '@/infrastructure/ppg/FakeSignalSource'
import type { Container } from '@/shared/di/Container'
import type { GetHistoryHandler } from '@/application/handlers/GetHistoryHandler'
import '@/presentation/i18n/config'

const FPS = 30

/** A clean pulsatile signal at `bpm` over `seconds` (steady, so HRV is reliable). */
function cleanSignal(seconds: number, bpm = 72): number[] {
  const out: number[] = []
  for (let i = 0; i < FPS * seconds; i++) {
    out.push(130 + 8 * Math.sin(2 * Math.PI * (bpm / 60) * (i / FPS)))
  }
  return out
}

/** Deterministic noise (no Math.random) at amplitude `amp`. */
function noise(seconds: number, amp: number): number[] {
  let seed = 7
  const out: number[] = []
  for (let i = 0; i < FPS * seconds; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    out.push(130 + ((seed / 0x7fffffff) * 2 - 1) * amp)
  }
  return out
}

/** Pure noise — rejected entirely (poor quality), drives the retry/fail path. */
function noisySignal(seconds: number): number[] {
  return noise(seconds, 1)
}

/**
 * A clean pulse with heavy additive noise: heart rate is still recoverable and
 * quality clears the floor, but too many beats are artifacts (clean-beat ratio
 * below the HRV threshold) — so HRV is not reliable. This is the honest
 * "heart rate only, no stress estimate" path.
 */
function hrOnlySignal(seconds: number): number[] {
  const clean = cleanSignal(seconds)
  const n = noise(seconds, 26)
  return clean.map((v, i) => v + ((n[i] ?? 130) - 130))
}

function renderWithContainer(ui: React.ReactElement, container: Container) {
  return render(<ContainerProvider container={container}>{ui}</ContainerProvider>)
}

describe('MeasurePage (measure flow with a fake signal source)', () => {
  it('shows guidance and a start control before measuring', () => {
    const container = buildContainer({ inMemory: true })
    renderWithContainer(
      <MeasurePage onCheckIn={() => {}} onDone={() => {}} createSource={() => new FakeSignalSource([], FPS)} />,
      container,
    )
    expect(screen.getByText(/Before you start/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('a clean 60s capture yields HR + a reliable HRV stress band, and saves it', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    const source = new FakeSignalSource(cleanSignal(60), FPS)
    renderWithContainer(
      <MeasurePage onCheckIn={() => {}} onDone={() => {}} createSource={() => source} />,
      container,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))
    source.flush() // drain the full capture synchronously -> result computed once

    await waitFor(() => expect(screen.getByText('Your reading')).toBeInTheDocument())
    // Heart rate is shown.
    expect(screen.getByText('Heart rate')).toBeInTheDocument()
    // A reliable reading shows the experimental stress estimate.
    expect(screen.getByText('Stress estimate')).toBeInTheDocument()
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save to history' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument())

    const history = await container.resolve<GetHistoryHandler>('getHistory').execute()
    expect(history.readings).toHaveLength(1)
    expect(history.readings[0]?.bpm).toBeGreaterThan(0)
    // The reliable path persists a real HRV-derived band, never a faked one.
    expect(history.readings[0]?.rmssd).not.toBeNull()
    expect(history.readings[0]?.stressBand).not.toBeNull()
  })

  it('a noisy capture takes the HR-only path and never fakes a stress number', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    const onCheckIn = vi.fn()
    const source = new FakeSignalSource(noisySignal(60), FPS)
    renderWithContainer(
      <MeasurePage onCheckIn={onCheckIn} onDone={() => {}} createSource={() => source} />,
      container,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))
    source.flush()

    // Noise is rejected entirely -> the "couldn't get a clean reading" retry.
    await waitFor(() =>
      expect(screen.getByText(/Couldn't get a clean reading/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText('Stress estimate')).not.toBeInTheDocument()
  })

  it('a HR-recoverable but HRV-unreliable capture shows HR only and links to the check-in', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    const onCheckIn = vi.fn()
    // Full-length capture: heart rate is clear, but too many beats are artifacts
    // for a trustworthy HRV estimate -> the honest HR-only path.
    const source = new FakeSignalSource(hrOnlySignal(52), FPS)
    renderWithContainer(
      <MeasurePage onCheckIn={onCheckIn} onDone={() => {}} createSource={() => source} />,
      container,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))
    source.flush()

    await waitFor(() => expect(screen.getByText('Your reading')).toBeInTheDocument())
    expect(screen.getByText('Heart rate')).toBeInTheDocument()
    // No stress estimate; instead the honest HR-only message + check-in link.
    expect(screen.queryByText('Stress estimate')).not.toBeInTheDocument()
    expect(screen.getByText(/couldn't get a steady enough reading/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open the stress check-in' }))
    expect(onCheckIn).toHaveBeenCalledOnce()

    // Saving stores HR with no HRV/band (never a faked stress number).
    await user.click(screen.getByRole('button', { name: 'Save to history' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument())
    const history = await container.resolve<GetHistoryHandler>('getHistory').execute()
    expect(history.readings).toHaveLength(1)
    expect(history.readings[0]?.rmssd).toBeNull()
    expect(history.readings[0]?.stressBand).toBeNull()
  })

  it('a dark/uncovered capture fails and hints to cover the lens', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    // Near-zero raw level over the whole capture = lens dark/uncovered. It both
    // fails the reading AND drives the "cover the lens" coverage hint.
    const dark = new Array(FPS * 60).fill(3)
    const source = new FakeSignalSource(dark, FPS)
    renderWithContainer(
      <MeasurePage onCheckIn={() => {}} onDone={() => {}} createSource={() => source} />,
      container,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))
    source.flush()

    await waitFor(() =>
      expect(screen.getByText(/Couldn't get a clean reading/i)).toBeInTheDocument(),
    )
    // The specific coverage hint is surfaced alongside the generic guidance.
    expect(screen.getByText(/Cover the lens fully/i)).toBeInTheDocument()
  })

  it('the preview no-ops gracefully when the source exposes no stream', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    // The fake source has no previewStream(); the capture UI must still render.
    const source = new FakeSignalSource(cleanSignal(60), FPS)
    expect((source as { previewStream?: unknown }).previewStream).toBeUndefined()
    renderWithContainer(
      <MeasurePage onCheckIn={() => {}} onDone={() => {}} createSource={() => source} />,
      container,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))
    // Capturing UI mounts (including the preview <video>) without throwing.
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('stops the camera (calls stop) when cancelled mid-capture', async () => {
    const user = userEvent.setup()
    const container = buildContainer({ inMemory: true })
    const source = new FakeSignalSource(cleanSignal(60), FPS)
    const stopSpy = vi.spyOn(source, 'stop')
    renderWithContainer(
      <MeasurePage onCheckIn={() => {}} onDone={() => {}} createSource={() => source} />,
      container,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))
    // Now in the capturing phase (do not flush): cancel and assert teardown.
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(stopSpy).toHaveBeenCalled()
  })
})
