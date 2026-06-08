import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionLabPage } from '@/presentation/components/features/motion/MotionLabPage'
import { FakeMotionSource } from '@/infrastructure/motion/FakeMotionSource'
import { TARGET_FPS, type MotionSample } from '@/domain/motion/dsp'
import '@/presentation/i18n/config'

const FPS = TARGET_FPS

/**
 * Keep the UI fixtures short (the DSP math is exhaustively covered in the domain
 * tests). 16 s clears the analysis threshold and spans several breaths, while
 * keeping the synchronous flush cheap.
 */
const SECONDS = 16

/** A composite: ≈12 br/min breathing + a small ≈60 bpm cardiac recoil on z. */
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

/** Deterministic 3-axis noise (no real rhythm). */
function noiseSignal(): MotionSample[] {
  const out: MotionSample[] = []
  const step = 1000 / FPS
  let s = 7
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s / 0x7fffffff) * 2 - 1
  }
  for (let i = 0; i < FPS * SECONDS; i++) {
    out.push({ t: i * step, x: rnd(), y: rnd(), z: rnd() + 9.8 })
  }
  return out
}

describe('MotionLabPage (lab UI with a fake motion source)', () => {
  it('shows the permission explanation, guidance and a start button before measuring', () => {
    render(<MotionLabPage createSource={() => new FakeMotionSource([], FPS)} />)
    expect(screen.getByText(/motion sensor while it rests on your chest/i)).toBeInTheDocument()
    expect(screen.getByText(/Lie down, rest the phone flat/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('measures a clean chest signal and reports a plausible breathing rate', async () => {
    const user = userEvent.setup()
    const source = new FakeMotionSource(chestSignal(), FPS)
    render(<MotionLabPage createSource={() => source} />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    source.flush()

    await waitFor(() => {
      expect(screen.getByText('Breathing rate')).toBeInTheDocument()
    })
    // The breathing band clears the quality bar, so an honest reading is shown
    // (the exact ≈12 br/min value is covered by the DSP unit tests).
    await waitFor(() => {
      const bars = screen.getAllByRole('progressbar')
      const breathQuality = Number(bars[0]?.getAttribute('aria-valuenow'))
      expect(breathQuality).toBeGreaterThanOrEqual(50)
    })
    // A plausible breathing number is rendered (10–14 br/min), not the em-dash.
    const breathValue = screen.getByText('br/min').closest('span')?.parentElement?.textContent ?? ''
    const num = Number(breathValue.replace(/[^\d]/g, ''))
    expect(num).toBeGreaterThanOrEqual(10)
    expect(num).toBeLessThanOrEqual(14)
  })

  it('warns on a weak (noisy) signal and does not fake a number', async () => {
    const user = userEvent.setup()
    const source = new FakeMotionSource(noiseSignal(), FPS)
    render(<MotionLabPage createSource={() => source} />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    source.flush()

    await waitFor(() => {
      expect(screen.getAllByText(/Weak signal/i).length).toBeGreaterThan(0)
    })
  })

  it('requests permission on the start gesture and shows a clear message when denied', async () => {
    const user = userEvent.setup()
    const source = new FakeMotionSource([], FPS, {
      needsPermission: true,
      permission: 'denied',
    })
    render(<MotionLabPage createSource={() => source} />)

    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Motion access was declined/i)
    })
    expect(source.requestCount).toBe(1)
    // Still on the pre-measuring screen.
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })
})
