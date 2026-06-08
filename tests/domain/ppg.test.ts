import { describe, it, expect } from 'vitest'
import {
  detrend,
  bandpass,
  estimateBpm,
  detectPeaks,
  peaksToIbisMs,
  rmssd,
  signalQuality,
  analyzeWindow,
  QUALITY_PASS_THRESHOLD,
} from '@/domain/ppg/dsp'

/** Build a clean sine at `bpm` over `seconds`, sampled at `fps`. */
function sine(bpm: number, fps: number, seconds: number, amplitude = 1): number[] {
  const freq = bpm / 60
  const n = Math.round(fps * seconds)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push(amplitude * Math.sin(2 * Math.PI * freq * (i / fps)))
  }
  return out
}

/** Deterministic pseudo-random noise in [-1, 1] (seeded LCG, no Math.random). */
function noise(n: number, seed = 12345): number[] {
  let s = seed
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    out.push((s / 0x7fffffff) * 2 - 1)
  }
  return out
}

describe('detrend', () => {
  it('removes a constant DC offset', () => {
    const samples = sine(72, 30, 10).map((v) => v + 128)
    const out = detrend(samples, 30)
    const avg = out.reduce((a, b) => a + b, 0) / out.length
    expect(Math.abs(avg)).toBeLessThan(0.05)
  })

  it('returns empty for empty input', () => {
    expect(detrend([], 30)).toEqual([])
  })
})

describe('bandpass', () => {
  it('keeps a length equal to the input', () => {
    const samples = sine(72, 30, 5)
    expect(bandpass(samples, 30)).toHaveLength(samples.length)
  })

  it('attenuates a slow drift below the HR band', () => {
    const n = 30 * 10
    const drift: number[] = []
    for (let i = 0; i < n; i++) drift.push(i / n) // 0..1 ramp, ~0.1 Hz
    const out = bandpass(drift, 30)
    const swing = Math.max(...out) - Math.min(...out)
    expect(swing).toBeLessThan(0.2)
  })
})

describe('estimateBpm (autocorrelation)', () => {
  it('recovers 72 bpm from a clean sine at 30 fps within ±2', () => {
    const bpm = estimateBpm(sine(72, 30, 15), 30)
    expect(Math.abs(bpm - 72)).toBeLessThanOrEqual(2)
  })

  it('recovers 90 bpm within ±3', () => {
    const bpm = estimateBpm(sine(90, 30, 15), 30)
    expect(Math.abs(bpm - 90)).toBeLessThanOrEqual(3)
  })

  it('recovers 60 bpm within ±3 even with DC offset and mild noise', () => {
    const clean = sine(60, 30, 20, 10).map((v) => v + 128)
    const n = noise(clean.length).map((v) => v * 1.5)
    const mixed = clean.map((v, i) => v + (n[i] ?? 0))
    const bpm = estimateBpm(mixed, 30)
    expect(Math.abs(bpm - 60)).toBeLessThanOrEqual(3)
  })

  it('returns NaN for a window too short to span the slowest period', () => {
    expect(Number.isNaN(estimateBpm(sine(72, 30, 0.2), 30))).toBe(true)
  })
})

describe('detectPeaks + IBIs', () => {
  it('finds roughly one peak per cycle for a clean 72 bpm sine', () => {
    const peaks = detectPeaks(sine(72, 30, 10), 30)
    // 72 bpm over 10 s ≈ 12 beats; allow detector slack.
    expect(peaks.length).toBeGreaterThanOrEqual(10)
    expect(peaks.length).toBeLessThanOrEqual(14)
  })

  it('produces IBIs near the expected 833 ms for 72 bpm', () => {
    const ibis = peaksToIbisMs(detectPeaks(sine(72, 30, 12), 30), 30)
    const avg = ibis.reduce((a, b) => a + b, 0) / ibis.length
    expect(Math.abs(avg - 833)).toBeLessThan(60)
  })
})

describe('rmssd', () => {
  it('matches a hand-computed value for a known IBI series', () => {
    // diffs: 20, -20, 40 -> squares 400, 400, 1600 -> mean 800 -> sqrt ≈ 28.284
    const ibis = [800, 820, 800, 840]
    expect(rmssd(ibis)).toBeCloseTo(Math.sqrt(800), 3)
  })

  it('is zero for perfectly regular intervals', () => {
    expect(rmssd([800, 800, 800, 800])).toBe(0)
  })

  it('returns NaN with fewer than two intervals', () => {
    expect(Number.isNaN(rmssd([800]))).toBe(true)
  })
})

describe('signalQuality (the rejection gate)', () => {
  it('passes a clean pulsatile signal', () => {
    const clean = sine(72, 30, 20, 8).map((v) => v + 130)
    expect(signalQuality(clean, 30)).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD)
  })

  it('rejects white noise (below threshold)', () => {
    const flatNoise = noise(30 * 20).map((v) => v + 130)
    expect(signalQuality(flatNoise, 30)).toBeLessThan(QUALITY_PASS_THRESHOLD)
  })

  it('rejects a flat dead signal', () => {
    const flat = new Array<number>(30 * 20).fill(130)
    expect(signalQuality(flat, 30)).toBeLessThan(QUALITY_PASS_THRESHOLD)
  })
})

describe('analyzeWindow', () => {
  it('composes bpm, rmssd, quality and peaks for a clean signal', () => {
    const clean = sine(72, 30, 20, 8).map((v) => v + 130)
    const a = analyzeWindow(clean, 30)
    expect(Math.abs(a.bpm - 72)).toBeLessThanOrEqual(3)
    expect(a.quality).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD)
    expect(a.peaks.length).toBeGreaterThan(0)
    expect(a.rmssd).not.toBeNull()
  })

  it('reports low quality and rejects noise', () => {
    const flatNoise = noise(30 * 20).map((v) => v + 130)
    const a = analyzeWindow(flatNoise, 30)
    expect(a.quality).toBeLessThan(QUALITY_PASS_THRESHOLD)
  })
})
