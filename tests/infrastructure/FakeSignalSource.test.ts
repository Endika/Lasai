import { describe, it, expect } from 'vitest'
import { FakeSignalSource } from '@/infrastructure/ppg/FakeSignalSource'

describe('FakeSignalSource', () => {
  it('replays the given data at the given fps via flush()', async () => {
    const src = new FakeSignalSource([1, 2, 3], 30)
    const received: number[] = []
    await src.start((s) => received.push(s.value))
    src.flush()
    expect(received).toEqual([1, 2, 3])
  })

  it('stamps samples at the nominal sample interval', async () => {
    const src = new FakeSignalSource([0, 0, 0], 10)
    const times: number[] = []
    await src.start((s) => times.push(s.t))
    src.flush()
    expect(times).toEqual([0, 100, 200])
  })

  it('reports torch capability and tracks setTorch', async () => {
    const src = new FakeSignalSource([], 30, { torch: true })
    expect(src.capabilities().torch).toBe(true)
    await src.setTorch(true)
    expect(src.torchOn).toBe(true)
  })

  it('stops cleanly with no callback afterwards', async () => {
    const src = new FakeSignalSource([1, 2], 30)
    const received: number[] = []
    await src.start((s) => received.push(s.value))
    src.stop()
    src.flush()
    expect(received).toEqual([])
  })
})
