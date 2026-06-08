import type { ISignalSource, SignalSample, SignalSourceCapabilities } from './ISignalSource'

/**
 * Replays a fixed number[] at a given fps, for tests and offline demos.
 * No camera, no timers required: `flush()` drains all samples synchronously so
 * tests stay deterministic. Calling start() also schedules a real-time replay
 * for manual use, but tests should drive it via flush().
 */
export class FakeSignalSource implements ISignalSource {
  private readonly data: number[]
  private readonly rate: number
  private readonly hasTorch: boolean
  private cb: ((s: SignalSample) => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private idx = 0
  public torchOn = false

  constructor(data: number[], fps: number, opts?: { torch?: boolean }) {
    this.data = data
    this.rate = fps
    this.hasTorch = opts?.torch ?? false
  }

  start(onSample: (sample: SignalSample) => void): Promise<void> {
    this.cb = onSample
    this.idx = 0
    return Promise.resolve()
  }

  /**
   * Synchronously emit all remaining samples (deterministic, for tests). Stops
   * early if a consumer calls stop() from within its own callback (the real
   * Measure flow tears the source down the moment it has enough samples).
   */
  flush(): void {
    const step = 1000 / this.rate
    for (; this.idx < this.data.length; this.idx++) {
      if (!this.cb) return
      this.cb({ value: this.data[this.idx] ?? 0, t: this.idx * step })
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.cb = null
  }

  fps(): number {
    return this.rate
  }

  capabilities(): SignalSourceCapabilities {
    return { torch: this.hasTorch }
  }

  setTorch(on: boolean): Promise<void> {
    this.torchOn = on
    return Promise.resolve()
  }
}
