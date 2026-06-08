import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PpgLabPage } from '@/presentation/components/features/ppg/PpgLabPage'
import { FakeSignalSource } from '@/infrastructure/ppg/FakeSignalSource'
import '@/presentation/i18n/config'

/** A clean pulsatile signal at 72 bpm, 30 fps, so the lab shows a real reading. */
function cleanSignal(): number[] {
  const fps = 30
  const out: number[] = []
  for (let i = 0; i < fps * 12; i++) {
    out.push(130 + 8 * Math.sin(2 * Math.PI * (72 / 60) * (i / fps)))
  }
  return out
}

describe('PpgLabPage (lab UI with a fake signal source)', () => {
  it('shows the permission explanation and a start button before measuring', () => {
    render(<PpgLabPage createSource={() => new FakeSignalSource([], 30)} />)
    expect(screen.getByText(/Place a fingertip/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start measuring' })).toBeInTheDocument()
  })

  it('measures a clean signal and reports a plausible bpm and passing quality', async () => {
    const user = userEvent.setup()
    const source = new FakeSignalSource(cleanSignal(), 30)
    render(<PpgLabPage createSource={() => source} />)

    await user.click(screen.getByRole('button', { name: 'Start measuring' }))
    // The page subscribed; drain the fake's samples to drive analysis.
    source.flush()

    await waitFor(() => {
      expect(screen.getByText('Heart rate')).toBeInTheDocument()
    })
    const progressbar = await screen.findByRole('progressbar')
    const quality = Number(progressbar.getAttribute('aria-valuenow'))
    expect(quality).toBeGreaterThanOrEqual(50)
  })

  it('warns on a weak (noisy) signal and does not fake a number', async () => {
    const user = userEvent.setup()
    let seed = 7
    const noise: number[] = []
    for (let i = 0; i < 30 * 12; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      noise.push(130 + (seed / 0x7fffffff) * 2 - 1)
    }
    const source = new FakeSignalSource(noise, 30)
    render(<PpgLabPage createSource={() => source} />)

    await user.click(screen.getByRole('button', { name: 'Start measuring' }))
    source.flush()

    await waitFor(() => {
      expect(screen.getByText(/Weak signal/i)).toBeInTheDocument()
    })
  })
})
