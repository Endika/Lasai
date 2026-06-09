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

/** Fixed capture length: you can't watch the screen with the phone on your chest. */
const CAPTURE_SECONDS = 40
const MAX_RAW_SAMPLES = CAPTURE_SECONDS * 120

type Phase = 'idle' | 'capturing' | 'result'

interface MotionLabPageProps {
  createSource?: () => IMotionSource
}

/** End-of-capture cue so the user knows to pick the phone up — beep + (Android) vibrate. */
function endCue(audio: AudioContext | null): void {
  try {
    navigator.vibrate?.([180, 90, 180])
  } catch {
    /* no vibration API — fine */
  }
  if (!audio) return
  try {
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.type = 'sine'
    o.frequency.value = 660
    g.gain.setValueAtTime(0.0001, audio.currentTime)
    g.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.6)
    o.connect(g)
    g.connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + 0.65)
  } catch {
    /* audio unavailable — the vibration / frozen result still convey completion */
  }
}

export function MotionLabPage({ createSource }: MotionLabPageProps) {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(CAPTURE_SECONDS)
  const [analysis, setAnalysis] = useState<MotionAnalysis | null>(null)

  useWakeLock(phase === 'capturing')

  const sourceRef = useRef<IMotionSource | null>(null)
  const bufferRef = useRef<MotionSample[]>([])
  const seriesRef = useRef<{ raw: number[]; breath: number[]; bcg: number[] } | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const doneRef = useRef(false)
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const breathCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const bcgCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const teardown = useCallback(() => {
    sourceRef.current?.stop()
    sourceRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      teardown()
      void audioRef.current?.close()
      audioRef.current = null
    }
  }, [teardown])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    teardown()
    const buf = bufferRef.current
    seriesRef.current = {
      raw: toSeries(buf, TARGET_FPS),
      breath: lowpass(toSeries(buf, TARGET_FPS), TARGET_FPS),
      bcg: bandpass(toSeries(buf, TARGET_FPS), TARGET_FPS),
    }
    setAnalysis(analyzeMotion(buf, TARGET_FPS))
    setPhase('result')
    endCue(audioRef.current)
  }, [teardown])

  const start = useCallback(async () => {
    setError(null)
    setAnalysis(null)
    bufferRef.current = []
    doneRef.current = false
    setSecondsLeft(CAPTURE_SECONDS)

    // Create + resume the audio context inside this gesture so the end beep is
    // allowed to play on iOS (audio can't start outside a user gesture there).
    if (!audioRef.current) {
      try {
        audioRef.current = new AudioContext()
      } catch {
        audioRef.current = null
      }
    }
    void audioRef.current?.resume().catch(() => {})

    const source = createSource ? createSource() : new DeviceMotionSource()
    sourceRef.current = source

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
        if (doneRef.current) return
        const buf = bufferRef.current
        buf.push(sample)
        if (buf.length > MAX_RAW_SAMPLES) buf.shift()
        // Drive the countdown + completion off real timestamps (testable + accurate).
        const elapsed = (sample.t - buf[0]!.t) / 1000
        setSecondsLeft(Math.max(0, Math.ceil(CAPTURE_SECONDS - elapsed)))
        if (elapsed >= CAPTURE_SECONDS) finish()
      })
      setPhase('capturing')
    } catch {
      sourceRef.current = null
      setError(t('motion.errorStart'))
    }
  }, [createSource, finish, t])

  const cancel = useCallback(() => {
    teardown()
    bufferRef.current = []
    setPhase('idle')
  }, [teardown])

  // Draw the frozen traces once the result screen is mounted.
  useEffect(() => {
    if (phase !== 'result' || !seriesRef.current) return
    drawTrace(rawCanvasRef.current, seriesRef.current.raw, '#94a3b8')
    drawTrace(breathCanvasRef.current, seriesRef.current.breath, '#2c8c85')
    drawTrace(bcgCanvasRef.current, seriesRef.current.bcg, '#7c5cbf')
  }, [phase])

  const breathQuality = analysis?.breathingQuality ?? 0
  const bcgQuality = analysis?.bcgQuality ?? 0
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
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {phase === 'idle' && (
        <>
          <p className="mx-auto max-w-xs text-balance text-center text-sm text-ink-soft">
            {t('motion.permissionExplain')}
          </p>
          <p className="rounded-2xl bg-calm-soft/60 px-4 py-3 text-center text-sm text-calm-deep">
            {t('motion.captureHint')}
          </p>
          <Button className="self-center" onClick={() => void start()}>
            {t('motion.start')}
          </Button>
        </>
      )}

      {phase === 'capturing' && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full bg-calm-soft">
            <span className="text-5xl font-light tabular-nums text-ink">{secondsLeft}</span>
            <span className="text-xs text-ink-faint">{t('motion.secondsUnit')}</span>
          </div>
          <p className="max-w-xs text-balance text-center text-sm text-ink-soft" aria-live="polite">
            {t('motion.capturing')}
          </p>
          <Button variant="ghost" className="self-center" onClick={cancel}>
            {t('motion.cancel')}
          </Button>
        </div>
      )}

      {phase === 'result' && (
        <>
          <h2 className="text-center text-sm font-medium text-ink-soft">
            {t('motion.resultTitle')}
          </h2>

          <div className="flex flex-col gap-2">
            <Metric label={t('motion.breaths')} value={breaths} unit={t('motion.breathsUnit')} />
            <QualityBar
              label={t('motion.quality')}
              value={breathQuality}
              passes={breathQuality >= QUALITY_PASS_THRESHOLD}
              weakHint={t('motion.weakSignal')}
            />
            <Trace
              canvasRef={breathCanvasRef}
              label={t('motion.traceBreath')}
              aria={t('motion.traceBreathAria')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Metric label={t('motion.bpm')} value={bpm} unit={t('motion.bpmUnit')} />
            <p className="text-xs text-ink-faint">{t('motion.bcgNote')}</p>
            <QualityBar
              label={t('motion.quality')}
              value={bcgQuality}
              passes={bcgQuality >= QUALITY_PASS_THRESHOLD}
              weakHint={t('motion.weakSignal')}
            />
            <Trace
              canvasRef={bcgCanvasRef}
              label={t('motion.traceBcg')}
              aria={t('motion.traceBcgAria')}
            />
          </div>

          <Trace
            canvasRef={rawCanvasRef}
            label={t('motion.traceAccel')}
            aria={t('motion.traceAccelAria')}
          />

          <Button className="self-center" onClick={() => void start()}>
            {t('motion.again')}
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

/** Draw a normalized trace of a series onto a canvas. Pure — reads series, writes pixels. */
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
