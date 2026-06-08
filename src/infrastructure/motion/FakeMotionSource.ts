import type { MotionSample } from '@/domain/motion/dsp'
import type { IMotionSource, MotionPermission } from './IMotionSource'

/**
 * Replays a fixed 3-axis array at a given fps, for tests and offline demos.
 * No sensor, no timers required: `flush()` drains all samples synchronously so
 * tests stay deterministic.
 */
export class FakeMotionSource implements IMotionSource {
  private readonly data: MotionSample[]
  private readonly rate: number
  private readonly requiresPermission: boolean
  private readonly permissionResult: MotionPermission
  private cb: ((s: MotionSample) => void) | null = null
  private idx = 0
  public requestCount = 0

  constructor(
    data: MotionSample[],
    fps: number,
    opts?: { needsPermission?: boolean; permission?: MotionPermission },
  ) {
    this.data = data
    this.rate = fps
    this.requiresPermission = opts?.needsPermission ?? false
    this.permissionResult = opts?.permission ?? 'granted'
  }

  needsPermission(): boolean {
    return this.requiresPermission
  }

  requestPermission(): Promise<MotionPermission> {
    this.requestCount++
    return Promise.resolve(this.permissionResult)
  }

  start(onSample: (sample: MotionSample) => void): Promise<void> {
    this.cb = onSample
    this.idx = 0
    return Promise.resolve()
  }

  /** Synchronously emit all remaining samples (deterministic, for tests). */
  flush(): void {
    for (; this.idx < this.data.length; this.idx++) {
      if (!this.cb) return
      const s = this.data[this.idx]
      if (s) this.cb(s)
    }
  }

  stop(): void {
    this.cb = null
  }

  fps(): number {
    return this.rate
  }
}
