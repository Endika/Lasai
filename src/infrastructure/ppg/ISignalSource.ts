/**
 * Port for a PPG signal source: anything that emits a stream of scalar samples
 * (mean RED-channel intensity per frame) at a roughly fixed rate.
 *
 * The camera adapter and the in-memory fake both implement this, so the lab UI
 * and tests run against the same contract. Samples live only in memory while the
 * source is running — nothing here persists or transmits them.
 */
export interface SignalSample {
  /** Mean RED-channel intensity of the ROI for this frame. */
  value: number
  /** Frame timestamp in ms (performance.now()-style monotonic clock). */
  t: number
}

export interface SignalSourceCapabilities {
  /** Whether the underlying device exposes torch control. */
  torch: boolean
}

export interface ISignalSource {
  /**
   * Start producing samples. `onSample` is called once per frame.
   * Rejects if acquisition fails (e.g. permission denied).
   */
  start(onSample: (sample: SignalSample) => void): Promise<void>
  /** Stop producing and release all underlying resources (camera tracks). */
  stop(): void
  /** Nominal sample rate in frames per second. */
  fps(): number
  /** Feature-detected capabilities (e.g. torch). */
  capabilities(): SignalSourceCapabilities
  /** Toggle the torch where supported; a no-op otherwise. */
  setTorch(on: boolean): Promise<void>
}
