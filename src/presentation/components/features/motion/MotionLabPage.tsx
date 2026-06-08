import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/presentation/components/common/Button'
import { useWakeLock } from '@/presentation/hooks/useWakeLock'
import { DeviceMotionSource } from '@/infrastructure/motion/DeviceMotionSource'
import type { IMotionSource } from '@/infrastructure/motion/IMotionSource'
import {
  analyzeMotion,
  toSeries,
  lowpass,
  bandpass,
  QUALITY_PASS_THRESHOLD,
  TARGET_FPS,
  type MotionAnalysis,
  type MotionSample,
} from '@/domain/motion/dsp'

/** Seconds of signal held in the rolling analysis window. */
const WINDOW_SECONDS = 30

/** Cap the raw sample buffer to the window at a generous device rate. */
const MAX_RAW_SAMPLES = WINDOW_SECONDS * 120

interface MotionLabPageProps {
  /** Override the motion source (tests inject a fake). Defaults to DeviceMotion. */
  createSource?: () => IMotionSource
}

export function MotionLabPage({ createSource }: MotionLabPageProps) {
  const { t } = useTranslation()

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<MotionAnalysis | null>(null)

  // Keep the screen awake while measuring so it doesn't lock mid-reading.
  useWakeLock(running)

  const sourceRef = useRef<IMotionSource | null>(null)
  const bufferRef = useRef<MotionSample[]>([])
  const sinceAnalysisRef = useRef(0)
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const breathCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const bcgCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const stop = useCallback(() => {
    sourceRef.current?.stop()
    sourceRef.current = null
    bufferRef.current = []
    setRunning(false)
  }, [])

  // Always remove the listener when the view unmounts.
  useEffect(() => {
    return () => {
      sourceRef.current?.stop()
      sourceRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setAnalysis(null)
    bufferRef.current = []
    sinceAnalysisRef.current = 0
    const source = createSource ? createSource() : new DeviceMotionSource()
    sourceRef.current = source

    // iOS requires an explicit permission request from this user gesture.
    if (source.needsPermission()) {
      const result = await source.requestPermission()
      if (result !== 'granted') {
        sourceRef.current = null
        setError(t('motion.errorDenied'))
        return
      }
    }

    try {
      await source.start((sample) => {
        const buf = bufferRef.current
        buf.push(sample)
        if (buf.length > MAX_RAW_SAMPLES) buf.shift()

        const fps = source.fps() || TARGET_FPS
        // The autocorrelation analysis is O(n²); running it on every event (≈60/s
        // over a 30 s buffer) would be wasteful and janky. Re-analyse at most a
        // few times a second once we have a few seconds of motion to work with.
        sinceAnalysisRef.current++
        const reanalyseEvery = Math.max(1, Math.round(fps / 3))
        if (buf.length >= fps * 4 && sinceAnalysisRef.current >= reanalyseEvery) {
          sinceAnalysisRef.current = 0
          const series = toSeries(buf, TARGET_FPS)
          setAnalysis(analyzeMotion(buf, TARGET_FPS))
          drawTrace(rawCanvasRef.current, series, '#94a3b8')
          drawTrace(breathCanvasRef.current, lowpass(series, TARGET_FPS), '#2c8c85')
          drawTrace(bcgCanvasRef.current, bandpass(series, TARGET_FPS), '#7c5cbf')
        }
      })
      setRunning(true)
    } catch {
      sourceRef.current = null
      setError(t('motion.errorStart'))
    }
  }, [createSource, t])

  const breathQuality = analysis?.breathingQuality ?? 0
  const bcgQuality = analysis?.bcgQuality ?? 0
  const breathPasses = breathQuality >= QUALITY_PASS_THRESHOLD
  const breaths =
    analysis && Number.isFinite(analysis.breathsPerMin) ? String(analysis.breathsPerMin) : '—'
  const bpm = analysis?.bcgBpm != null ? String(analysis.bcgBpm) : '—'

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
      <header className="text-center">
        <span className="inline-block rounded-full bg-calm-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-calm-deep">
          {t('motion.experimental')}
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{t('motion.title')}</h1>
        <p className="mx-auto mt-2 max-w-xs text-balance text-sm text-ink-soft">
          {t('motion.permissionExplain')}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {!running ? (
        <>
          <p className="rounded-2xl bg-calm-soft/60 px-4 py-3 text-center text-sm text-calm-deep">
            {t('motion.guidance')}
          </p>
          <Button className="self-center" onClick={() => void start()}>
            {t('motion.start')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-center text-sm text-ink-soft">{t('motion.guidance')}</p>

          <Trace
            canvasRef={rawCanvasRef}
            label={t('motion.traceAccel')}
            aria={t('motion.traceAccelAria')}
          />

          <div className="flex flex-col gap-2">
            <Trace
              canvasRef={breathCanvasRef}
              label={t('motion.traceBreath')}
              aria={t('motion.traceBreathAria')}
            />
            <Metric label={t('motion.breaths')} value={breaths} unit={t('motion.breathsUnit')} />
            <QualityBar
              label={t('motion.quality')}
              value={breathQuality}
              passes={breathPasses}
              weakHint={t('motion.weakSignal')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Trace
              canvasRef={bcgCanvasRef}
              label={t('motion.traceBcg')}
              aria={t('motion.traceBcgAria')}
            />
            <Metric label={t('motion.bpm')} value={bpm} unit={t('motion.bpmUnit')} />
            <p className="text-xs text-ink-faint">{t('motion.bcgNote')}</p>
            <QualityBar
              label={t('motion.quality')}
              value={bcgQuality}
              passes={bcgQuality >= QUALITY_PASS_THRESHOLD}
              weakHint={t('motion.weakSignal')}
            />
          </div>

          <Button variant="soft" className="self-center" onClick={stop}>
            {t('motion.stop')}
          </Button>
        </>
      )}
    </section>
  )
}

function Trace({
  canvasRef,
  label,
  aria,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  label: string
  aria: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <canvas
        ref={canvasRef}
        width={320}
        height={80}
        role="img"
        aria-label={aria}
        className="w-full rounded-2xl border border-calm/15 bg-surface/70"
      />
    </div>
  )
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between rounded-2xl border border-calm/15 bg-surface/70 px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">
        {value}
        <span className="ml-1 text-sm font-normal text-ink-faint">{unit}</span>
      </span>
    </div>
  )
}

function QualityBar({
  label,
  value,
  passes,
  weakHint,
}: {
  label: string
  value: number
  passes: boolean
  weakHint: string
}) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm text-ink-soft">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-faint/20">
        <div
          className={`h-full rounded-full transition-all ${passes ? 'bg-calm' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {!passes && <p className="mt-1 text-sm text-amber-700">{weakHint}</p>}
    </div>
  )
}

/**
 * Draw a normalized trace of a series onto a canvas. Pure canvas drawing —
 * reads the series, writes pixels, keeps nothing.
 */
function drawTrace(canvas: HTMLCanvasElement | null, series: number[], color: string): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  if (series.length < 2) return

  let min = Infinity
  let max = -Infinity
  for (const v of series) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  const x = (i: number) => (i / (series.length - 1)) * w
  const y = (v: number) => h - ((v - min) / range) * (h - 8) - 4

  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  for (let i = 0; i < series.length; i++) {
    const px = x(i)
    const py = y(series[i] ?? 0)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}
