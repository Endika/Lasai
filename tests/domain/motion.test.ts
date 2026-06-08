import { describe, it, expect } from 'vitest'
import {
  toSeries,
  detrend,
  lowpass,
  bandpass,
  breathingRate,
  bcgHeartRate,
  motionQuality,
  analyzeMotion,
  QUALITY_PASS_THRESHOLD,
  TARGET_FPS,
  type MotionSample,
} from '@/domain/motion/dsp'

const FPS = TARGET_FPS

/** A scalar sine at `perMin` cycles/minute over `seconds`, sampled at `fps`. */
function sine(perMin: number, fps: number, seconds: number, amplitude = 1): number[] {
  const freq = perMin / 60
  const n = Math.round(fps * seconds)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(amplitude * Math.sin(2 * Math.PI * freq * (i / fps)))
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

/** Wrap a scalar series into 3-axis samples (signal on z, gravity offset). */
function toSamples(series: number[], fps: number): MotionSample[] {
  const step = 1000 / fps
  return series.map((v, i) => ({ t: i * step, x: 0, y: 0, z: v + 9.8 }))
}

describe('toSeries', () => {
  it('picks the dominant-variance axis when one clearly leads', () => {
    const fps = FPS
    const breath = sine(12, fps, 20, 5)
    const samples: MotionSample[] = breath.map((v, i) => ({
      t: (i * 1000) / fps,
      x: 0.01,
      y: 0.01,
      z: v,
    }))
    const series = toSeries(samples, fps)
    // The z-axis signal should dominate: recovered breathing ≈ 12 br/min.
    const { breathsPerMin } = breathingRate(series, fps)
    expect(Math.abs(breathsPerMin - 12)).toBeLessThanOrEqual(2)
  })

  it('falls back to magnitude when energy is spread across axes', () => {
    const fps = FPS
    const a = sine(12, fps, 20, 3)
    const samples: MotionSample[] = a.map((v, i) => ({
      t: (i * 1000) / fps,
      x: v,
      y: v,
      z: v,
    }))
    const series = toSeries(samples, fps)
    expect(series.length).toBeGreaterThan(0)
  })

  it('resamples an irregular stream onto a uniform grid', () => {
    // 100 samples over ~2 s of wall time -> resampled near fps*2 length.
    const fps = FPS
    const samples: MotionSample[] = []
    for (let i = 0; i < 100; i++) {
      samples.push({ t: i * 20 + (i % 3), x: 0, y: 0, z: Math.sin(i) })
    }
    const series = toSeries(samples, fps)
    expect(series.length).toBeGreaterThan(80)
    expect(series.length).toBeLessThan(120)
  })

  it('returns empty for empty input', () => {
    expect(toSeries([], FPS)).toEqual([])
  })
})

describe('detrend', () => {
  it('removes a constant offset (residual gravity)', () => {
    const samples = sine(12, FPS, 20).map((v) => v + 9.8)
    const out = detrend(samples, FPS)
    const avg = out.reduce((a, b) => a + b, 0) / out.length
    expect(Math.abs(avg)).toBeLessThan(0.05)
  })

  it('returns empty for empty input', () => {
    expect(detrend([], FPS)).toEqual([])
  })
})

describe('lowpass (breathing band)', () => {
  it('keeps the slow breathing swing and attenuates fast cardiac content', () => {
    const breath = sine(12, FPS, 30, 1)
    const heart = sine(60, FPS, 30, 0.2)
    const mixed = breath.map((v, i) => v + (heart[i] ?? 0))
    const lp = lowpass(mixed, FPS)
    // A near-pure breath sine survives; recovered rate stays ≈ 12.
    const { breathsPerMin } = breathingRate(mixed, FPS)
    expect(Math.abs(breathsPerMin - 12)).toBeLessThanOrEqual(2)
    expect(lp).toHaveLength(mixed.length)
  })
})

describe('bandpass (BCG band)', () => {
  it('keeps a length equal to the input', () => {
    const s = sine(60, FPS, 10)
    expect(bandpass(s, FPS)).toHaveLength(s.length)
  })
})

describe('breathingRate', () => {
  it('recovers 12 br/min from a clean breathing sine within ±2', () => {
    const s = sine(12, FPS, 40, 1)
    const { breathsPerMin, quality } = breathingRate(s, FPS)
    expect(Math.abs(breathsPerMin - 12)).toBeLessThanOrEqual(2)
    expect(quality).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD)
  })

  it('recovers 18 br/min within ±2', () => {
    const s = sine(18, FPS, 40, 1)
    const { breathsPerMin } = breathingRate(s, FPS)
    expect(Math.abs(breathsPerMin - 18)).toBeLessThanOrEqual(2)
  })

  it('reports low quality for pure noise', () => {
    const { quality } = breathingRate(noise(FPS * 40), FPS)
    expect(quality).toBeLessThan(QUALITY_PASS_THRESHOLD)
  })
})

describe('bcgHeartRate (rough, experimental)', () => {
  it('recovers ≈60 bpm from a clean cardiac sine within ±5', () => {
    const s = sine(60, FPS, 40, 1)
    const { bpm, quality } = bcgHeartRate(s, FPS)
    expect(Math.abs(bpm - 60)).toBeLessThanOrEqual(5)
    expect(quality).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD)
  })

  it('reports low quality for pure noise', () => {
    const { quality } = bcgHeartRate(noise(FPS * 40), FPS)
    expect(quality).toBeLessThan(QUALITY_PASS_THRESHOLD)
  })
})

describe('motionQuality (rejection gate)', () => {
  it('passes a clean breathing signal and rejects noise', () => {
    const clean = sine(12, FPS, 40, 1)
    const dirty = noise(FPS * 40)
    expect(motionQuality(clean, FPS, 'breath')).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD)
    expect(motionQuality(dirty, FPS, 'breath')).toBeLessThan(QUALITY_PASS_THRESHOLD)
  })

  it('passes a clean cardiac signal and rejects noise on the BCG band', () => {
    const clean = sine(60, FPS, 40, 1)
    const dirty = noise(FPS * 40)
    expect(motionQuality(clean, FPS, 'bcg')).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD)
    expect(motionQuality(dirty, FPS, 'bcg')).toBeLessThan(QUALITY_PASS_THRESHOLD)
  })
})

describe('analyzeMotion (composite)', () => {
  it('recovers ≈12 br/min and ≈60 bpm from a composite signal', () => {
    // Breathing dominates amplitude; a smaller cardiac recoil rides on top.
    const breath = sine(12, FPS, 45, 1)
    const heart = sine(60, FPS, 45, 0.35)
    const series = breath.map((v, i) => v + (heart[i] ?? 0))
    const samples = toSamples(series, FPS)

    const a = analyzeMotion(samples, FPS)
    expect(Math.abs(a.breathsPerMin - 12)).toBeLessThanOrEqual(2)
    expect(a.breathingQuality).toBeGreaterThanOrEqual(QUALITY_PASS_THRESHOLD)
    expect(a.bcgBpm).not.toBeNull()
    expect(Math.abs((a.bcgBpm ?? 0) - 60)).toBeLessThanOrEqual(5)
  })

  it('rejects both rhythms for pure noise (low quality, bcgBpm null)', () => {
    const series = noise(FPS * 45)
    const samples = toSamples(series, FPS)
    const a = analyzeMotion(samples, FPS)
    expect(a.breathingQuality).toBeLessThan(QUALITY_PASS_THRESHOLD)
    expect(a.bcgQuality).toBeLessThan(QUALITY_PASS_THRESHOLD)
    expect(a.bcgBpm).toBeNull()
  })

  it('returns bcgBpm null when only breathing is present (no cardiac component)', () => {
    const series = sine(12, FPS, 45, 1)
    const samples = toSamples(series, FPS)
    const a = analyzeMotion(samples, FPS)
    expect(Math.abs(a.breathsPerMin - 12)).toBeLessThanOrEqual(2)
    expect(a.bcgBpm).toBeNull()
  })
})
