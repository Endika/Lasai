import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeviceMotionSource } from '@/infrastructure/motion/DeviceMotionSource'
import type { MotionSample } from '@/domain/motion/dsp'

/**
 * jsdom has no real DeviceMotion. We exercise the adapter by dispatching plain
 * Event objects augmented with the acceleration fields the handler reads, and
 * by spying on add/removeEventListener to assert teardown leaves no listener.
 */
function motionEvent(fields: Partial<DeviceMotionEvent>): DeviceMotionEvent {
  const e = new Event('devicemotion') as DeviceMotionEvent
  return Object.assign(e, fields)
}

describe('DeviceMotionSource', () => {
  let addSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener')
    removeSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Ensure the real DeviceMotionEvent static is untouched between tests.
    delete (globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent
  })

  it('emits gravity-removed acceleration and derives fps from interval', async () => {
    const src = new DeviceMotionSource()
    const received: MotionSample[] = []
    await src.start((s) => received.push(s))

    window.dispatchEvent(
      motionEvent({
        interval: 0.02, // 50 Hz
        acceleration: { x: 0.1, y: 0.2, z: 0.3 } as DeviceMotionEventAcceleration,
        accelerationIncludingGravity: { x: 9, y: 9, z: 9 } as DeviceMotionEventAcceleration,
      }),
    )

    expect(received).toHaveLength(1)
    expect(received[0]?.x).toBeCloseTo(0.1)
    expect(received[0]?.z).toBeCloseTo(0.3)
    expect(src.fps()).toBeCloseTo(50)
    src.stop()
  })

  it('falls back to accelerationIncludingGravity when acceleration is null', async () => {
    const src = new DeviceMotionSource()
    const received: MotionSample[] = []
    await src.start((s) => received.push(s))

    window.dispatchEvent(
      motionEvent({
        interval: 0.02,
        acceleration: null,
        accelerationIncludingGravity: { x: 1, y: 2, z: 9.8 } as DeviceMotionEventAcceleration,
      }),
    )

    expect(received).toHaveLength(1)
    expect(received[0]?.z).toBeCloseTo(9.8)
    src.stop()
  })

  it('removes the devicemotion listener on stop (no leak)', async () => {
    const src = new DeviceMotionSource()
    await src.start(() => {})
    expect(addSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function))

    src.stop()
    expect(removeSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function))

    // After stop, further events reach no callback.
    const received: MotionSample[] = []
    await src.start((s) => received.push(s))
    src.stop()
    window.dispatchEvent(
      motionEvent({ acceleration: { x: 1, y: 1, z: 1 } as DeviceMotionEventAcceleration }),
    )
    expect(received).toEqual([])
  })

  it('reports no permission needed when DeviceMotionEvent.requestPermission is absent', () => {
    ;(globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent = function () {}
    const src = new DeviceMotionSource()
    expect(src.needsPermission()).toBe(false)
  })

  it('detects the iOS permission API and forwards granted/denied', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    ;(globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent = Object.assign(
      function () {},
      { requestPermission },
    )
    const src = new DeviceMotionSource()
    expect(src.needsPermission()).toBe(true)
    await expect(src.requestPermission()).resolves.toBe('granted')

    requestPermission.mockResolvedValueOnce('denied')
    await expect(src.requestPermission()).resolves.toBe('denied')
  })

  it('treats a thrown permission request as denied', async () => {
    const requestPermission = vi.fn().mockRejectedValue(new Error('needs a gesture'))
    ;(globalThis as { DeviceMotionEvent?: unknown }).DeviceMotionEvent = Object.assign(
      function () {},
      { requestPermission },
    )
    const src = new DeviceMotionSource()
    await expect(src.requestPermission()).resolves.toBe('denied')
  })
})
