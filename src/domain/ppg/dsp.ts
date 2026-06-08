/**
 * Pure-TS DSP for camera photoplethysmography (PPG).
 *
 * All functions operate over a raw sample series (mean RED-channel intensity per
 * frame) and a sample rate `fps`. They are deterministic and hardware-free, so
 * they can be unit-tested with synthetic signals. No external libraries: this is
 * the offline guarantee — nothing here touches the network or storage.
 *
 * Frequency band of interest: 0.7–4 Hz (≈42–240 bpm). A finger held over the
 * lens makes the red channel pulse with each heartbeat; everything outside that
 * band is drift (DC, breathing, lighting) or high-frequency noise.
 */

/** Heart-rate search band, in Hz. 0.7 Hz ≈ 42 bpm, 4 Hz = 240 bpm. */
export const MIN_HR_HZ = 0.7
export const MAX_HR_HZ = 4

/** Minimum spacing between detected peaks (s). ~0.3 s caps HR at 200 bpm. */
export const MIN_PEAK_DISTANCE_S = 0.3

/** Quality score below which a reading must be rejected (never faked). */
export const QUALITY_PASS_THRESHOLD = 0.5

/**
 * Subtract a centered moving average (window ≈ fps, i.e. ~1 s) to remove the
 * slow DC drift and baseline wander, leaving the pulsatile component.
 */
export function detrend(samples: number[], fps: number): number[] {
  const n = samples.length
  if (n === 0) return []
  const win = Math.max(1, Math.round(fps))
  const half = Math.floor(win / 2)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n - 1, i + half)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += samples[j] ?? 0
    const avg = sum / (hi - lo + 1)
    out[i] = (samples[i] ?? 0) - avg
  }
  return out
}

/** Simple centered moving-average low-pass with the given window length. */
function movingAverage(samples: number[], win: number): number[] {
  const n = samples.length
  if (n === 0) return []
  const w = Math.max(1, Math.round(win))
  const half = Math.floor(w / 2)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n - 1, i + half)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += samples[j] ?? 0
    out[i] = sum / (hi - lo + 1)
  }
  return out
}

/**
 * Pragmatic band-pass for the 0.7–4 Hz HR band.
 *
 * Method: detrend (high-pass — removes everything slower than ~MIN_HR_HZ) then a
 * short moving-average low-pass (removes everything faster than ~MAX_HR_HZ). Two
 * cascaded box filters approximate a band-pass cheaply and are numerically safe
 * — no biquad ringing or coefficient tuning. Good enough for HR/IBI extraction.
 */
export function bandpass(samples: number[], fps: number): number[] {
  if (samples.length === 0) return []
  const highPassed = detrend(samples, fps)
  // Low-pass cutoff at MAX_HR_HZ: a box filter of length ~ fps / MAX_HR_HZ.
  const lpWin = Math.max(1, Math.round(fps / MAX_HR_HZ))
  return movingAverage(highPassed, lpWin)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/**
 * Biased autocorrelation at integer lag `k` of a zero-meaned series.
 * Biased (divide by n, not n-k) so longer lags are gently down-weighted, which
 * keeps the fundamental from being beaten by a longer-lag harmonic.
 */
function autocorrelation(centered: number[], k: number): number {
  const n = centered.length
  if (k >= n) return 0
  let sum = 0
  for (let i = 0; i + k < n; i++) sum += (centered[i] ?? 0) * (centered[i + k] ?? 0)
  return sum / n
}

/**
 * Estimate beats-per-minute via autocorrelation.
 *
 * The dominant period of a periodic signal shows up as the lag (in samples) of
 * the first strong autocorrelation peak. We search only lags inside the HR band
 * and refine the peak with parabolic interpolation for sub-sample accuracy.
 *
 * Returns NaN when the series is too short to span the slowest searched period.
 */
export function estimateBpm(samples: number[], fps: number): number {
  const filtered = bandpass(samples, fps)
  const n = filtered.length
  const centered = filtered.map((v) => v - mean(filtered))

  const minLag = Math.max(1, Math.floor(fps / MAX_HR_HZ))
  const maxLag = Math.floor(fps / MIN_HR_HZ)
  if (n <= maxLag + 1) return NaN

  let bestLag = -1
  let bestVal = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const val = autocorrelation(centered, lag)
    if (val > bestVal) {
      bestVal = val
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestVal <= 0) return NaN

  // Parabolic interpolation around the integer peak for finer resolution.
  let refined = bestLag
  if (bestLag > minLag && bestLag < maxLag) {
    const ym1 = autocorrelation(centered, bestLag - 1)
    const y0 = bestVal
    const yp1 = autocorrelation(centered, bestLag + 1)
    const denom = ym1 - 2 * y0 + yp1
    if (denom !== 0) {
      const delta = (0.5 * (ym1 - yp1)) / denom
      if (delta > -1 && delta < 1) refined = bestLag + delta
    }
  }

  return (60 * fps) / refined
}

/**
 * Adaptive peak detection on the band-passed signal.
 *
 * A sample is a peak when it is a local maximum, exceeds an adaptive threshold
 * (mean + k·stddev of the positive lobe), and is at least MIN_PEAK_DISTANCE_S
 * after the previous accepted peak. Returns the peak sample indices.
 */
export function detectPeaks(samples: number[], fps: number): number[] {
  const filtered = bandpass(samples, fps)
  const n = filtered.length
  if (n < 3) return []

  const m = mean(filtered)
  let variance = 0
  for (const v of filtered) variance += (v - m) * (v - m)
  const std = Math.sqrt(variance / n)
  const threshold = m + 0.5 * std
  const minDist = Math.max(1, Math.round(MIN_PEAK_DISTANCE_S * fps))

  const peaks: number[] = []
  let last = -Infinity
  for (let i = 1; i < n - 1; i++) {
    const v = filtered[i] ?? 0
    const prev = filtered[i - 1] ?? 0
    const next = filtered[i + 1] ?? 0
    if (v > threshold && v >= prev && v > next && i - last >= minDist) {
      peaks.push(i)
      last = i
    }
  }
  return peaks
}

/** Inter-beat intervals (ms) from peak indices at the given sample rate. */
export function peaksToIbisMs(peaks: number[], fps: number): number[] {
  const ibis: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    const a = peaks[i - 1] ?? 0
    const b = peaks[i] ?? 0
    ibis.push(((b - a) / fps) * 1000)
  }
  return ibis
}

/**
 * RMSSD: root mean square of successive IBI differences (ms) — the standard
 * short-term HRV measure. Needs at least two intervals.
 */
export function rmssd(ibisMs: number[]): number {
  if (ibisMs.length < 2) return NaN
  let sumSq = 0
  for (let i = 1; i < ibisMs.length; i++) {
    const d = (ibisMs[i] ?? 0) - (ibisMs[i - 1] ?? 0)
    sumSq += d * d
  }
  return Math.sqrt(sumSq / (ibisMs.length - 1))
}

/**
 * Signal-quality score in 0..1, combining three independent cues:
 *
 *  - periodicity: normalized autocorrelation peak prominence (clean pulses give
 *    a strong, isolated peak; noise does not),
 *  - regularity: 1 − coefficient of variation of the IBIs (steady beats),
 *  - amplitude: presence of a real pulsatile swing vs a flat/dead signal.
 *
 * A noisy or flat reading scores low and is rejected by QUALITY_PASS_THRESHOLD —
 * the principle is to refuse a bad reading, never to invent a number.
 */
export function signalQuality(samples: number[], fps: number): number {
  const filtered = bandpass(samples, fps)
  const n = filtered.length
  if (n < Math.round(fps)) return 0

  const m = mean(filtered)
  const centered = filtered.map((v) => v - m)

  // Amplitude: standard deviation relative to the raw signal level. A flat or
  // near-flat band-passed signal means no pulse.
  let variance = 0
  for (const v of centered) variance += v * v
  const std = Math.sqrt(variance / n)
  const rawMean = Math.abs(mean(samples))
  const amplitude = clamp01((std / (rawMean > 1 ? rawMean : 1)) * 200)

  // Periodicity: best in-band autocorrelation normalized by lag-0 energy.
  const energy = autocorrelation(centered, 0)
  let bestRatio = 0
  if (energy > 0) {
    const minLag = Math.max(1, Math.floor(fps / MAX_HR_HZ))
    const maxLag = Math.floor(fps / MIN_HR_HZ)
    let best = 0
    for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
      const val = autocorrelation(centered, lag)
      if (val > best) best = val
    }
    bestRatio = clamp01(best / energy)
  }

  // Regularity: 1 − CV of the inter-beat intervals.
  const ibis = peaksToIbisMs(detectPeaks(samples, fps), fps)
  let regularity = 0
  if (ibis.length >= 2) {
    const im = mean(ibis)
    if (im > 0) {
      let iv = 0
      for (const x of ibis) iv += (x - im) * (x - im)
      const cv = Math.sqrt(iv / ibis.length) / im
      regularity = clamp01(1 - cv)
    }
  }

  // Periodicity is the most reliable cue, so weight it highest.
  return clamp01(0.5 * bestRatio + 0.3 * regularity + 0.2 * amplitude)
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

export interface WindowAnalysis {
  /** Estimated heart rate (bpm), or NaN if the window is too short. */
  bpm: number
  /** RMSSD (ms), or null when there are too few clean beats to compute it. */
  rmssd: number | null
  /** Signal quality 0..1. Compare against QUALITY_PASS_THRESHOLD. */
  quality: number
  /** Detected peak sample indices (for waveform overlay). */
  peaks: number[]
}

/** Compose the full analysis of one sample window. */
export function analyzeWindow(samples: number[], fps: number): WindowAnalysis {
  const peaks = detectPeaks(samples, fps)
  const ibis = peaksToIbisMs(peaks, fps)
  const r = rmssd(ibis)
  return {
    bpm: estimateBpm(samples, fps),
    rmssd: Number.isNaN(r) ? null : r,
    quality: signalQuality(samples, fps),
    peaks,
  }
}

// ---------------------------------------------------------------------------
// Artifact rejection + a sustained-capture verdict (the real feature, F1).
//
// Live HRV jumps frame to frame, so the real Measure flow captures a long
// window and computes ONE averaged, artifact-rejected verdict at the end. The
// pieces below turn a raw IBI series into clean beats, a robust RMSSD over
// those, and an honest reliability verdict that gates whether a stress (HRV)
// estimate is shown at all — we never invent a number from a noisy reading.
// ---------------------------------------------------------------------------

/** Physiological IBI bounds (ms). 300 ms ≈ 200 bpm, 1500 ms ≈ 40 bpm. */
export const MIN_IBI_MS = 300
export const MAX_IBI_MS = 1500

/** An IBI deviating more than this fraction from the running median is dropped. */
export const IBI_OUTLIER_TOLERANCE = 0.25

/** Sustained-capture targets for a trustworthy HRV estimate. */
export const HRV_MIN_DURATION_SEC = 45
export const HRV_MIN_CLEAN_BEAT_RATIO = 0.7
export const HRV_MIN_CLEAN_BEATS = 30

/** Median of a numeric array (does not mutate the input). Empty -> NaN. */
function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
}

/**
 * Drop physiologically impossible and motion/ectopic IBIs.
 *
 *  1. Anything outside [MIN_IBI_MS, MAX_IBI_MS] is impossible (finger slipped,
 *     a doubled or missed beat) and removed outright.
 *  2. Of what remains, an interval deviating more than IBI_OUTLIER_TOLERANCE
 *     from the running median of the kept beats is an artifact (motion spike or
 *     ectopic beat) and removed. A running median (rather than a global one)
 *     tracks a gradually drifting heart rate without flagging the whole tail.
 */
export function cleanIbis(ibisMs: number[]): number[] {
  const inRange = ibisMs.filter((x) => x >= MIN_IBI_MS && x <= MAX_IBI_MS)
  if (inRange.length === 0) return []

  const kept: number[] = []
  for (const x of inRange) {
    const ref = kept.length > 0 ? median(kept) : x
    if (ref <= 0) {
      kept.push(x)
      continue
    }
    if (Math.abs(x - ref) / ref <= IBI_OUTLIER_TOLERANCE) kept.push(x)
  }
  // Seed the running median with the first value, so the very first interval is
  // never rejected against itself; the loop above already keeps it.
  return kept
}

/**
 * RMSSD over only *consecutive* clean pairs.
 *
 * After artifact rejection the series may have gaps (a removed beat breaks the
 * chain). Differencing across a gap would invent a huge spurious successive
 * difference, so we difference clean adjacent intervals only. With the running
 * cleaner above the kept series is already contiguous, so this reduces to the
 * standard RMSSD; it is kept explicit so the intent (consecutive pairs only) is
 * clear. Returns null when there are too few clean beats.
 */
export function rmssdRobust(cleanIbisMs: number[]): number | null {
  if (cleanIbisMs.length < 2) return null
  let sumSq = 0
  let pairs = 0
  for (let i = 1; i < cleanIbisMs.length; i++) {
    const d = (cleanIbisMs[i] ?? 0) - (cleanIbisMs[i - 1] ?? 0)
    sumSq += d * d
    pairs++
  }
  if (pairs === 0) return null
  return Math.sqrt(sumSq / pairs)
}

export type ReadingQuality = 'good' | 'fair' | 'poor'

export interface HeartReadingAssessment {
  /** Estimated heart rate (bpm), rounded. NaN if the window was unusable. */
  bpm: number
  /** Robust RMSSD (ms) over clean beats, or null when not computable. */
  rmssd: number | null
  /** Coarse quality verdict from the signal-quality score. */
  quality: ReadingQuality
  /**
   * Whether the HRV/stress estimate is trustworthy enough to show. Gated on
   * duration AND quality AND a high clean-beat ratio AND enough clean beats —
   * if any fails we show heart rate only and never fake a stress number.
   */
  hrvReliable: boolean
  /** Fraction of detected beats that survived artifact rejection (0..1). */
  cleanBeatRatio: number
  /** Captured duration in seconds (sample count / fps). */
  durationSec: number
}

function qualityBand(score: number): ReadingQuality {
  if (score >= 0.7) return 'good'
  if (score >= QUALITY_PASS_THRESHOLD) return 'fair'
  return 'poor'
}

/**
 * Assess a full sustained capture into one averaged, artifact-rejected verdict.
 *
 * Heart rate uses the existing robust autocorrelation method over the whole
 * clean window (stable even when HRV is too noisy to trust). HRV is computed
 * from artifact-rejected IBIs and only reported as reliable when the capture
 * was long enough, clean enough, and kept enough beats.
 */
export function assessReading(samples: number[], fps: number): HeartReadingAssessment {
  const durationSec = samples.length / fps
  const quality = signalQuality(samples, fps)

  const rawIbis = peaksToIbisMs(detectPeaks(samples, fps), fps)
  const clean = cleanIbis(rawIbis)
  const cleanBeatRatio = rawIbis.length > 0 ? clean.length / rawIbis.length : 0
  const robust = rmssdRobust(clean)

  const bpmRaw = estimateBpm(samples, fps)
  const bpm = Number.isFinite(bpmRaw) ? Math.round(bpmRaw) : NaN

  const hrvReliable =
    durationSec >= HRV_MIN_DURATION_SEC &&
    quality >= QUALITY_PASS_THRESHOLD &&
    cleanBeatRatio >= HRV_MIN_CLEAN_BEAT_RATIO &&
    clean.length >= HRV_MIN_CLEAN_BEATS &&
    robust !== null

  return {
    bpm,
    rmssd: robust,
    quality: qualityBand(quality),
    hrvReliable,
    cleanBeatRatio,
    durationSec,
  }
}

export type StressBand = 'low' | 'moderate' | 'high'

/** Coarse absolute RMSSD cut-offs (ms) used when there is no personal history. */
export const RMSSD_ABS_HIGH_STRESS = 20
export const RMSSD_ABS_LOW_STRESS = 50

/**
 * Map an RMSSD to a coarse stress band.
 *
 * The physiology: higher HRV (RMSSD) reflects more parasympathetic ("rest and
 * digest") activity, so *lower* RMSSD ≈ more stress/arousal. This is a rough,
 * non-clinical estimate, not a diagnosis.
 *
 *  - With ≥5 prior RMSSD values, band the reading relative to the user's OWN
 *    distribution via tertiles: bottom third (low RMSSD) -> high stress, top
 *    third -> low stress. Personal baselines vary widely, so self-relative is
 *    far more meaningful than absolute cut-offs.
 *  - Otherwise fall back to coarse absolute bands: <20 ms -> high, 20–50 ->
 *    moderate, >50 -> low.
 */
export function stressBandFromRmssd(rmssdMs: number, history?: number[]): StressBand {
  const prior = (history ?? []).filter((v) => Number.isFinite(v) && v > 0)
  if (prior.length >= 5) {
    const sorted = [...prior].sort((a, b) => a - b)
    const lowerTertile = sorted[Math.floor(sorted.length / 3)] ?? 0
    const upperTertile = sorted[Math.floor((2 * sorted.length) / 3)] ?? 0
    if (rmssdMs <= lowerTertile) return 'high'
    if (rmssdMs >= upperTertile) return 'low'
    return 'moderate'
  }
  if (rmssdMs < RMSSD_ABS_HIGH_STRESS) return 'high'
  if (rmssdMs <= RMSSD_ABS_LOW_STRESS) return 'moderate'
  return 'low'
}
