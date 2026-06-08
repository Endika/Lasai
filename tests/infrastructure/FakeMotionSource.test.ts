import { describe, it, expect } from 'vitest'
import { FakeMotionSource } from '@/infrastructure/motion/FakeMotionSource'
import type { MotionSample } from '@/domain/motion/dsp'

const samples: MotionSample[] = [
  { t: 0, x: 1, y: 2, z: 3 },
  { t: 20, x: 4, y: 5, z: 6 },
  { t: 40, x: 7, y: 8, z: 9 },
]

describe('FakeMotionSource', () => {
  it('replays the given 3-axis data via flush()', async () => {
    const src = new FakeMotionSource(samples, 50)
    const received: MotionSample[] = []
    await src.start((s) => received.push(s))
    src.flush()
    expect(received).toEqual(samples)
  })

  it('reports the configured fps', () => {
    expect(new FakeMotionSource([], 60).fps()).toBe(60)
  })

  it('defaults to no permission needed and granted', async () => {
    const src = new FakeMotionSource([], 50)
    expect(src.needsPermission()).toBe(false)
    await expect(src.requestPermission()).resolves.toBe('granted')
  })

  it('models an iOS-style denied permission', async () => {
    const src = new FakeMotionSource([], 50, { needsPermission: true, permission: 'denied' })
    expect(src.needsPermission()).toBe(true)
    await expect(src.requestPermission()).resolves.toBe('denied')
    expect(src.requestCount).toBe(1)
  })

  it('stops cleanly with no callback afterwards', async () => {
    const src = new FakeMotionSource(samples, 50)
    const received: MotionSample[] = []
    await src.start((s) => received.push(s))
    src.stop()
    src.flush()
    expect(received).toEqual([])
  })
})
