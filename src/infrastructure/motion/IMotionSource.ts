import type { MotionSample } from '@/domain/motion/dsp'

/**
 * Port for a device-motion source: anything that emits a stream of 3-axis
 * acceleration samples (gravity-removed where possible) at a roughly fixed rate.
 *
 * The DeviceMotion adapter and the in-memory fake both implement this, so the
 * chest-breathing UI and tests run against the same contract. Samples live only
 * in memory while the source is running — nothing here persists or transmits them.
 */
export type MotionPermission = 'granted' | 'denied'

export interface IMotionSource {
  /**
   * Start producing samples. `onSample` is called once per motion event.
   * Rejects if acquisition fails. Caller must have permission first on iOS.
   */
  start(onSample: (sample: MotionSample) => void): Promise<void>
  /** Stop producing and remove the underlying listener (no leaks). */
  stop(): void
  /** Nominal sample rate in Hz, derived from the event interval where known. */
  fps(): number
  /** Whether this platform requires an explicit motion permission (iOS 13+). */
  needsPermission(): boolean
  /**
   * Request motion permission. MUST be called from a user gesture on iOS.
   * Returns 'granted' or 'denied'. Resolves 'granted' where no prompt applies.
   */
  requestPermission(): Promise<MotionPermission>
}
