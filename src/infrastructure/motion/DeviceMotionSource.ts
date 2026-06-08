import type { MotionSample } from '@/domain/motion/dsp'
import { TARGET_FPS } from '@/domain/motion/dsp'
import type { IMotionSource, MotionPermission } from './IMotionSource'

/**
 * DeviceMotion-backed source.
 *
 * Listens to `window`'s 'devicemotion' events. It prefers `event.acceleration`
 * (gravity already removed); when that is null it falls back to
 * `accelerationIncludingGravity` and relies on the DSP to detrend gravity out.
 * The nominal rate is derived from `event.interval` (seconds between samples),
 * falling back to TARGET_FPS when the platform does not report it.
 *
 * Privacy: samples are handed straight to the callback and kept only in memory
 * by the consumer; nothing here stores or sends anything. The event listener is
 * removed on stop() so there are no leaks once measuring ends.
 *
 * iOS 13+: DeviceMotion requires `DeviceMotionEvent.requestPermission()` called
 * from a user gesture. Both the feature-detection and the request are handled
 * here; Android/desktop need no prompt and report 'granted'.
 */

/** iOS exposes a non-standard static requestPermission on DeviceMotionEvent. */
interface DeviceMotionEventStatic {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>
}

function deviceMotionStatic(): DeviceMotionEventStatic | undefined {
  if (typeof DeviceMotionEvent === 'undefined') return undefined
  return DeviceMotionEvent as unknown as DeviceMotionEventStatic
}

export class DeviceMotionSource implements IMotionSource {
  private cb: ((s: MotionSample) => void) | null = null
  private rate = TARGET_FPS
  private handler: ((e: DeviceMotionEvent) => void) | null = null

  needsPermission(): boolean {
    return typeof deviceMotionStatic()?.requestPermission === 'function'
  }

  async requestPermission(): Promise<MotionPermission> {
    const req = deviceMotionStatic()?.requestPermission
    if (typeof req !== 'function') return 'granted'
    try {
      const result = await req()
      return result === 'granted' ? 'granted' : 'denied'
    } catch {
      // The call must come from a user gesture; failures count as denied.
      return 'denied'
    }
  }

  start(onSample: (sample: MotionSample) => void): Promise<void> {
    this.cb = onSample

    const handler = (e: DeviceMotionEvent): void => {
      // Derive the rate from the reported interval (s) the first time we see one.
      if (e.interval && e.interval > 0) {
        const hz = 1 / e.interval
        if (Number.isFinite(hz) && hz > 0) this.rate = hz
      }

      const acc = e.acceleration ?? e.accelerationIncludingGravity
      if (!acc) return

      this.cb?.({
        t: performance.now(),
        x: acc.x ?? 0,
        y: acc.y ?? 0,
        z: acc.z ?? 0,
      })
    }

    this.handler = handler
    window.addEventListener('devicemotion', handler)
    return Promise.resolve()
  }

  stop(): void {
    if (this.handler) {
      window.removeEventListener('devicemotion', this.handler)
      this.handler = null
    }
    this.cb = null
  }

  fps(): number {
    return this.rate
  }
}
