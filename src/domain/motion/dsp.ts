/**
 * Pure-TS DSP for chest-resting accelerometer signals (DeviceMotion).
 *
 * The phone lies on the chest while the user is still. Two physiological
 * rhythms ride on the acceleration stream:
 *
 *  - **Breathing** (the reliable signal): the chest rises and falls slowly,
 *    ~6–30 breaths/min (≈0.1–0.5 Hz). Low-pass + peak/zero-cross gives a solid
 *    breaths-per-minute estimate.
 *  - **BCG heart rate** (experimental): each heartbeat recoils the body
 *    minutely (ballistocardiography), ~0.8–2.5 Hz (≈48–150 bpm). Band-pass +
 *    autocorrelation gives a *rough* bpm. It is very posture/motion sensitive,
 *    HRV is NOT attempted, and a reading below the quality bar is reported as
 *    null rather than invented.
 *
 * Everything here is deterministic and hardware-free (operates over a plain
 * number[] series + fps), so it is unit-testable with synthetic signals. No
 * external libraries: this is the offline guarantee — nothing touches the
 * network or storage.
 */

/** Breathing search band, in Hz. 0.1 Hz = 6 br/min, 0.5 Hz = 30 br/min. */
export const MIN_BREATH_HZ = 0.1
export const MAX_BREATH_HZ = 0.5

/** BCG heart search band, in Hz. 0.8 Hz ≈ 48 bpm, 2.5 Hz = 150 bpm. */
export const MIN_BCG_HZ = 0.8
export const MAX_BCG_HZ = 2.5

/** Fixed working sample rate the 3-axis stream is resampled to. */
export const TARGET_FPS = 50

/** Quality score below which a reading must be rejected (never faked). */
export const QUALITY_PASS_THRESHOLD = 0.5

/** Minimum spacing between detected breaths (s). 1.2 s caps at 50 br/min. */
const MIN_BREATH_DISTANCE_S = 1.2

/** A single 3-axis acceleration sample with a monotonic timestamp (ms). */
export interface MotionSample {
  t: number
  x: number
  y: number
  z: number
}

/** Which band a quality / filter query refers to. */
export type MotionBand = 'breath' | 'bcg'

function mean(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

function variance(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const m = mean(values)
  let v = 0
  for (const x of values) v += (x - m) * (x - m)
  return v / n
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

/**
 * Linear-resample a timestamped series onto a uniform grid at `fps`.
 * The DeviceMotion stream is only roughly periodic; resampling to a fixed rate
 * makes the downstream box filters' cutoffs well-defined.
 */
function resample(times: number[], values: number[], fps: number): number[] {
  const n = times.length
  if (n === 0) return []
  if (n === 1) return [values[0] ?? 0]

  const t0 = times[0] ?? 0
  const tEnd = times[n - 1] ?? t0
  const durMs = tEnd - t0
  if (durMs <= 0) return [values[0] ?? 0]

  const step = 1000 / fps
  const count = Math.max(1, Math.floor(durMs / step) + 1)
  const out = new Array<number>(count)

  let j = 0
  for (let i = 0; i < count; i++) {
    const target = t0 + i * step
    while (j < n - 2 && (times[j + 1] ?? t0) < target) j++
    const ta = times[j] ?? t0
    const tb = times[j + 1] ?? ta
    const va = values[j] ?? 0
    const vb = values[j + 1] ?? va
    if (tb === ta) {
      out[i] = va
    } else {
      const frac = (target - ta) / (tb - ta)
      out[i] = va + (vb - va) * frac
    }
  }
  return out
}

/**
 * Reduce a 3-axis sample stream to one scalar series resampled at `fps`.
 *
 * Picks the axis with the largest variance (the dominant motion direction —
 * usually the one normal to the chest) when one axis clearly leads; otherwise
 * falls back to the vector magnitude, which is orientation-independent. This is
 * the single entry the rest of the DSP consumes.
 */
export function toSeries(samples: MotionSample[], fps: number = TARGET_FPS): number[] {
  if (samples.length === 0) return []
  const times = samples.map((s) => s.t)
  const xs = samples.map((s) => s.x)
  const ys = samples.map((s) => s.y)
  const zs = samples.map((s) => s.z)

  const vx = variance(xs)
  const vy = variance(ys)
  const vz = variance(zs)
  const maxV = Math.max(vx, vy, vz)
  const total = vx + vy + vz

  let chosen: number[]
  // Use the dominant axis only when it carries a clear majority of the energy;
  // otherwise the magnitude is more robust to orientation.
  if (total > 0 && maxV / total >= 0.5) {
    chosen = maxV === vx ? xs : maxV === vy ? ys : zs
  } else {
    chosen = samples.map((s) => Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z))
  }
  return resample(times, chosen, fps)
}

/**
 * Subtract a centered moving average to remove slow DC drift / residual
 * gravity, leaving the oscillatory component. `windowSec` sets how slow a trend
 * is removed (a longer window preserves slower rhythms like breathing).
 */
export function detrend(samples: number[], fps: number, windowSec = 2): number[] {
  const n = samples.length
  if (n === 0) return []
  const win = Math.max(1, Math.round(fps * windowSec))
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

/** Centered moving-average smoother with the given window length (samples). */
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
 * Low-pass for the breathing band (≤~0.5 Hz). A moving-average window of
 * ~1/MAX_BREATH_HZ seconds removes the faster cardiac/noise content but keeps
 * the slow respiratory swing. A long detrend first strips residual gravity.
 */
export function lowpass(samples: number[], fps: number): number[] {
  if (samples.length === 0) return []
  // Remove only very slow drift (slower than the slowest breath we search).
  const drift = detrend(samples, fps, 1 / MIN_BREATH_HZ)
  const lpWin = Math.max(1, Math.round(fps / MAX_BREATH_HZ))
  return movingAverage(drift, lpWin)
}

/**
 * Band-pass for the BCG/heart band (~0.8–2.5 Hz).
 *
 * Method: detrend (high-pass — removes breathing and gravity) then a short
 * moving-average low-pass (removes content faster than ~MAX_BCG_HZ). Two
 * cascaded box filters approximate a band-pass cheaply with no biquad ringing.
 */
export function bandpass(samples: number[], fps: number): number[] {
  if (samples.length === 0) return []
  const highPassed = detrend(samples, fps, 1 / MIN_BCG_HZ)
  const lpWin = Math.max(1, Math.round(fps / MAX_BCG_HZ))
  return movingAverage(highPassed, lpWin)
}

/** Biased autocorrelation at integer lag `k` of a zero-meaned series. */
function autocorrelation(centered: number[], k: number): number {
  const n = centered.length
  if (k >= n) return 0
  let sum = 0
  for (let i = 0; i + k < n; i++) sum += (centered[i] ?? 0) * (centered[i + k] ?? 0)
  return sum / n
}

/**
 * Adaptive peak detection on an already-filtered series.
 * A sample is a peak when it is a local maximum above an adaptive threshold and
 * at least `minDistS` after the previous accepted peak.
 */
function detectPeaks(filtered: number[], fps: number, minDistS: number, kStd = 0.4): number[] {
  const n = filtered.length
  if (n < 3) return []
  const m = mean(filtered)
  const std = Math.sqrt(variance(filtered))
  const threshold = m + kStd * std
  const minDist = Math.max(1, Math.round(minDistS * fps))

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

/** Intervals (s) between consecutive peak indices at the given sample rate. */
function peakIntervalsSec(peaks: number[], fps: number): number[] {
  const out: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    out.push(((peaks[i] ?? 0) - (peaks[i - 1] ?? 0)) / fps)
  }
  return out
}

/** Regularity in 0..1 from a set of intervals: 1 − coefficient of variation. */
function regularity(intervals: number[]): number {
  if (intervals.length < 2) return 0
  const m = mean(intervals)
  if (m <= 0) return 0
  const cv = Math.sqrt(variance(intervals)) / m
  return clamp01(1 - cv)
}

/**
 * In-band autocorrelation periodicity in 0..1: best autocorrelation peak within
 * the band normalized by lag-0 energy. A clean periodic signal scores high;
 * noise scores low. Returns both the score and the refined lag (samples).
 */
function periodicity(
  filtered: number[],
  fps: number,
  minHz: number,
  maxHz: number,
): { score: number; lag: number } {
  const n = filtered.length
  // Loop-invariant: computing mean() inside the map below made this O(n^2), and
  // the live in-session estimate re-runs it every second over a 20 s window.
  const m = mean(filtered)
  const centered = filtered.map((v) => v - m)
  const energy = autocorrelation(centered, 0)
  if (energy <= 0) return { score: 0, lag: NaN }

  const minLag = Math.max(1, Math.floor(fps / maxHz))
  const maxLag = Math.floor(fps / minHz)
  if (n <= maxLag + 1) return { score: 0, lag: NaN }

  // Each in-band lag is asked for three times as the neighbour comparison slides
  // (as lag-1, lag and lag+1), and twice more by the refinement below. Computing
  // the whole band once up front is the same arithmetic, a third of the work.
  const acf = new Array<number>(maxLag + 1).fill(0)
  for (let lag = minLag; lag <= maxLag; lag++) acf[lag] = autocorrelation(centered, lag)

  // Search for an INTERIOR local maximum within the band. A genuine periodic
  // component peaks inside the band; a value merely pinned to an endpoint is the
  // tail of an out-of-band rhythm leaking through the box filter (e.g. a strong
  // breathing sine bleeding into the BCG band) and must not be treated as a beat.
  let bestLag = -1
  let bestVal = -Infinity
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const val = acf[lag] ?? 0
    const prev = acf[lag - 1] ?? 0
    const next = acf[lag + 1] ?? 0
    if (val >= prev && val >= next && val > bestVal) {
      bestVal = val
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestVal <= 0) return { score: 0, lag: NaN }

  // Parabolic interpolation around the integer peak for sub-sample resolution.
  let refined = bestLag
  if (bestLag > minLag && bestLag < maxLag) {
    const ym1 = acf[bestLag - 1] ?? 0
    const y0 = bestVal
    const yp1 = acf[bestLag + 1] ?? 0
    const denom = ym1 - 2 * y0 + yp1
    if (denom !== 0) {
      const delta = (0.5 * (ym1 - yp1)) / denom
      if (delta > -1 && delta < 1) refined = bestLag + delta
    }
  }
  return { score: clamp01(bestVal / energy), lag: refined }
}

export interface BreathingResult {
  /** Breaths per minute, or NaN when the window is too short to estimate. */
  breathsPerMin: number
  /** Quality 0..1. Compare against QUALITY_PASS_THRESHOLD. */
  quality: number
}

/**
 * Breaths per minute from the low-passed series via peak intervals, with an
 * autocorrelation fallback when too few peaks are found. Quality blends band
 * periodicity with breath-interval regularity.
 */
export function breathingRate(series: number[], fps: number): BreathingResult {
  const lp = lowpass(series, fps)
  const peaks = detectPeaks(lp, fps, MIN_BREATH_DISTANCE_S)
  const intervals = peakIntervalsSec(peaks, fps)

  const { score, lag } = periodicity(lp, fps, MIN_BREATH_HZ, MAX_BREATH_HZ)

  let bpm: number
  if (intervals.length >= 2) {
    bpm = 60 / mean(intervals)
  } else if (Number.isFinite(lag)) {
    bpm = (60 * fps) / lag
  } else {
    bpm = NaN
  }

  const reg = regularity(intervals)
  const quality = clamp01(0.6 * score + 0.4 * reg)
  return { breathsPerMin: bpm, quality }
}

export interface BcgResult {
  /** Rough heart rate (bpm), or NaN when not estimable. APPROXIMATE only. */
  bpm: number
  /** Quality 0..1. Below threshold the bpm must be discarded (reported null). */
  quality: number
}

/**
 * Rough heart rate (bpm) from the BCG band via autocorrelation.
 *
 * APPROXIMATE and motion-sensitive: the ballistocardiogram is a tiny recoil
 * easily swamped by any movement, so this is a coarse estimate only — no HRV,
 * no beat-to-beat timing. The caller must gate on `quality` and report null
 * below QUALITY_PASS_THRESHOLD rather than show a fabricated number.
 */
export function bcgHeartRate(series: number[], fps: number): BcgResult {
  const bp = bandpass(series, fps)
  const { score, lag } = periodicity(bp, fps, MIN_BCG_HZ, MAX_BCG_HZ)

  // Blend autocorrelation periodicity with peak-interval regularity for a more
  // honest quality: a single strong harmonic without steady beats is suspect.
  const peaks = detectPeaks(bp, fps, 1 / MAX_BCG_HZ)
  const reg = regularity(peakIntervalsSec(peaks, fps))
  const quality = clamp01(0.7 * score + 0.3 * reg)

  const bpm = Number.isFinite(lag) ? (60 * fps) / lag : NaN
  return { bpm, quality }
}

/**
 * Quality score in 0..1 for a given band (the rejection gate). Wraps the
 * per-band estimators so callers can probe quality without computing a rate.
 */
export function motionQuality(series: number[], fps: number, band: MotionBand): number {
  return band === 'breath' ? breathingRate(series, fps).quality : bcgHeartRate(series, fps).quality
}

export interface MotionAnalysis {
  /** Breaths per minute (the reliable signal), rounded; NaN if unusable. */
  breathsPerMin: number
  /** Breathing quality 0..1. */
  breathingQuality: number
  /** Rough BCG heart rate (bpm), or null when its quality is below the bar. */
  bcgBpm: number | null
  /** BCG quality 0..1. */
  bcgQuality: number
}

/**
 * Full analysis of a 3-axis window: reduces to one series then estimates both
 * rhythms. BCG bpm is nulled out whenever its quality fails the threshold —
 * we reject a bad cardiac reading instead of inventing one.
 */
export function analyzeMotion(samples: MotionSample[], fps: number = TARGET_FPS): MotionAnalysis {
  const series = toSeries(samples, fps)
  const breath = breathingRate(series, fps)
  const bcg = bcgHeartRate(series, fps)

  const breathsPerMin = Number.isFinite(breath.breathsPerMin)
    ? Math.round(breath.breathsPerMin)
    : NaN
  const bcgPasses = bcg.quality >= QUALITY_PASS_THRESHOLD && Number.isFinite(bcg.bpm)

  return {
    breathsPerMin,
    breathingQuality: breath.quality,
    bcgBpm: bcgPasses ? Math.round(bcg.bpm) : null,
    bcgQuality: bcg.quality,
  }
}
