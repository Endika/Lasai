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
  cleanIbis,
  rmssdRobust,
  assessReading,
  stressBandFromRmssd,
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

describe('cleanIbis (artifact rejection)', () => {
  it('drops physiologically impossible intervals (too fast / too slow)', () => {
    // 250 ms (>200 bpm) and 1800 ms (<40 bpm) are impossible and removed; the
    // ~800 ms beats survive.
    const clean = cleanIbis([800, 250, 810, 1800, 790, 805])
    expect(clean).toEqual([800, 810, 790, 805])
  })

  it('drops a >25% outlier (motion / ectopic beat) against the running median', () => {
    // 1100 ms deviates ~37% from the ~800 ms median -> dropped as an artifact.
    const clean = cleanIbis([800, 810, 1100, 795, 805])
    expect(clean).toEqual([800, 810, 795, 805])
  })

  it('keeps a clean steady series untouched', () => {
    const series = [800, 820, 810, 790, 805]
    expect(cleanIbis(series)).toEqual(series)
  })

  it('returns empty when every interval is impossible', () => {
    expect(cleanIbis([100, 2000, 50])).toEqual([])
  })
})

describe('rmssdRobust', () => {
  it('matches a hand-computed value on a known clean series', () => {
    // diffs: 20, -20, 40 -> squares 400, 400, 1600 -> mean 800 -> sqrt(800)
    expect(rmssdRobust([800, 820, 800, 840])).toBeCloseTo(Math.sqrt(800), 3)
  })

  it('is zero for perfectly regular intervals', () => {
    expect(rmssdRobust([800, 800, 800, 800])).toBe(0)
  })

  it('returns null with fewer than two intervals', () => {
    expect(rmssdRobust([800])).toBeNull()
    expect(rmssdRobust([])).toBeNull()
  })
})

describe('assessReading (sustained-capture verdict)', () => {
  it('marks a short noisy capture hrvReliable=false but still reports bpm path', () => {
    // 10 s of noise: far below the 45 s HRV minimum and low quality.
    const flatNoise = noise(30 * 10).map((v) => v + 130)
    const a = assessReading(flatNoise, 30)
    expect(a.durationSec).toBeCloseTo(10, 1)
    expect(a.hrvReliable).toBe(false)
    expect(a.quality).toBe('poor')
  })

  it('marks a clean 60 s synthetic signal hrvReliable=true with a band-able rmssd', () => {
    const clean = sine(72, 30, 60, 8).map((v) => v + 130)
    const a = assessReading(clean, 30)
    expect(Math.abs(a.bpm - 72)).toBeLessThanOrEqual(3)
    expect(a.durationSec).toBeGreaterThanOrEqual(45)
    expect(a.cleanBeatRatio).toBeGreaterThanOrEqual(0.7)
    expect(a.rmssd).not.toBeNull()
    expect(a.hrvReliable).toBe(true)
  })

  it('reports a usable reading for a realistic capture with HR drift + baseline wander', () => {
    // Regression: a clearly pulsatile 50 s capture whose heart rate drifts (60→78)
    // with slow baseline wander. Judged over the WHOLE window it scored below the
    // quality floor ('poor' → "couldn't get a clean reading") even though the pulse
    // is obvious; the per-window aggregate must accept it.
    const fps = 30
    const secs = 50
    let phase = 0
    const out: number[] = []
    for (let i = 0; i < fps * secs; i++) {
      const t = i / fps
      const bpm = 60 + (18 * t) / secs // drift 60 -> 78
      phase += ((2 * Math.PI * bpm) / 60 / fps)
      out.push(130 + 8 * Math.sin(phase) + 6 * Math.sin(2 * Math.PI * 0.05 * t))
    }
    const a = assessReading(out, fps)
    expect(a.quality).not.toBe('poor')
    expect(Number.isFinite(a.bpm)).toBe(true)
    expect(a.bpm).toBeGreaterThanOrEqual(58)
    expect(a.bpm).toBeLessThanOrEqual(82)
  })

  it('does not mark a clean but too-short (30 s) capture reliable', () => {
    const clean = sine(72, 30, 30, 8).map((v) => v + 130)
    const a = assessReading(clean, 30)
    expect(a.durationSec).toBeLessThan(45)
    expect(a.hrvReliable).toBe(false)
  })
})

describe('stressBandFromRmssd', () => {
  it('uses coarse absolute bands without enough history', () => {
    expect(stressBandFromRmssd(10)).toBe('high') // low HRV -> more stress
    expect(stressBandFromRmssd(35)).toBe('moderate')
    expect(stressBandFromRmssd(70)).toBe('low') // high HRV -> calmer
  })

  it('bands relative to the user own distribution with >=5 prior values', () => {
    const history = [20, 30, 40, 50, 60, 70]
    // 22 ms sits in the bottom tertile of this person's own readings -> high.
    expect(stressBandFromRmssd(22, history)).toBe('high')
    // 68 ms sits in the top tertile -> low, even though 68 < absolute 70 split.
    expect(stressBandFromRmssd(68, history)).toBe('low')
    // A mid value lands moderate.
    expect(stressBandFromRmssd(45, history)).toBe('moderate')
  })
})
