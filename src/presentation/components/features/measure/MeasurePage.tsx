import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/presentation/components/common/Button'
import { useWakeLock } from '@/presentation/hooks/useWakeLock'
import { CameraSignalSource } from '@/infrastructure/ppg/CameraSignalSource'
import type { ISignalSource, SignalSample } from '@/infrastructure/ppg/ISignalSource'
import {
  assessReading,
  bandpass,
  signalQuality,
  QUALITY_PASS_THRESHOLD,
  type HeartReadingAssessment,
} from '@/domain/ppg/dsp'
import { MeasureResult } from './MeasureResult'

/** Sustained capture length. Long enough for a trustworthy HRV verdict. */
const CAPTURE_SECONDS = 50
/** Recent-window length (s) used only for the live "signal good/weak" hint. */
const LIVE_WINDOW_SECONDS = 5

/** Raw mean RED above which the channel is clipping / over-exposed. */
const BRIGHT_CLIP = 245
/** Raw mean RED below which the lens is dark / uncovered. */
const DARK_FLOOR = 20

/**
 * Coverage/lighting state inferred from the recent RAW mean RED level (and a
 * weak-but-not-bad-lighting case). Drives the live hint and the fail-screen
 * cause hint — honest help, never a medical claim.
 */
type BrightnessState = 'good' | 'weak' | 'tooBright' | 'tooDark' | 'tooMuchMotion'

/** Map a brightness state to an i18n hint key (null when the signal is good). */
function hintKeyFor(state: BrightnessState): string | null {
  switch (state) {
    case 'tooBright':
      return 'measure.hintTooBright'
    case 'tooDark':
      return 'measure.hintTooDark'
    case 'tooMuchMotion':
      return 'measure.hintTooMuchMotion'
    case 'weak':
      return 'measure.signalWeak'
    case 'good':
      return null
  }
}

type Phase = 'guide' | 'capturing' | 'result' | 'fail'

/**
 * Effective sample rate from real timestamps. The camera samples on
 * requestAnimationFrame (~60 fps on most phones, variable), NOT a fixed 30 — so the
 * DSP must be told the rate it actually got, or every frequency comes out wrong.
 */
function measuredFps(samples: SignalSample[]): number {
  if (samples.length < 2) return 30
  const span = (samples[samples.length - 1]!.t - samples[0]!.t) / 1000
  return span > 0 ? (samples.length - 1) / span : 30
}

/** iOS Safari gives no torch control; detect to show the lighting hint. */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
}

interface MeasurePageProps {
  /** Navigate to the PSS check-in (offered when HRV isn't reliable). */
  onCheckIn: () => void
  /** Leave the measure flow (e.g. back to home). */
  onDone: () => void
  /** Override the signal source (tests inject a fake). Defaults to the camera. */
  createSource?: () => ISignalSource
}

export function MeasurePage({ onCheckIn, onDone, createSource }: MeasurePageProps) {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<Phase>('guide')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [brightness, setBrightness] = useState<BrightnessState>('weak')
  const [failCause, setFailCause] = useState<BrightnessState>('weak')
  const [result, setResult] = useState<HeartReadingAssessment | null>(null)

  // Keep the screen awake only while actively capturing.
  useWakeLock(phase === 'capturing')

  const sourceRef = useRef<ISignalSource | null>(null)
  const bufferRef = useRef<SignalSample[]>([])
  const doneRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Remember the last live brightness so the fail screen can hint the cause.
  const lastBrightnessRef = useRef<BrightnessState>('weak')

  const teardown = useCallback(() => {
    // Detach the preview first so the <video> drops its reference to the stream,
    // then let the source stop() release the underlying tracks (no leaks).
    if (videoRef.current) videoRef.current.srcObject = null
    sourceRef.current?.stop()
    sourceRef.current = null
  }, [])

  // Always release the camera when the view unmounts.
  useEffect(() => () => teardown(), [teardown])

  // Once the capturing UI is mounted, mirror the source's live stream into the
  // small preview <video> — the SAME stream the source opened, never a second
  // getUserMedia. No-ops for sources without a preview (e.g. the in-memory fake).
  useEffect(() => {
    if (phase !== 'capturing') return
    const video = videoRef.current
    const stream = sourceRef.current?.previewStream?.()
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => {
      /* autoplay best-effort; muted+playsinline usually allows it */
    })
  }, [phase])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    const buf = bufferRef.current
    teardown()

    const fps = measuredFps(buf)
    const assessment = assessReading(
      buf.map((s) => s.value),
      fps,
    )
    // If the capture never reached usable quality at all, refuse the reading.
    if (assessment.quality === 'poor' || !Number.isFinite(assessment.bpm)) {
      // Surface the last live coverage/lighting/motion state as a likely cause.
      setFailCause(lastBrightnessRef.current)
      setPhase('fail')
      return
    }
    setResult(assessment)
    setPhase('result')
  }, [teardown])

  const start = useCallback(async () => {
    setError(null)
    setResult(null)
    setElapsedSec(0)
    setBrightness('weak')
    lastBrightnessRef.current = 'weak'
    bufferRef.current = []
    doneRef.current = false

    const source = createSource ? createSource() : new CameraSignalSource()
    sourceRef.current = source

    try {
      await source.start((sample) => {
        if (doneRef.current) return
        const buf = bufferRef.current
        buf.push({ value: sample.value, t: sample.t })

        // Drive everything off real timestamps, not an assumed sample count.
        const elapsed = (sample.t - buf[0]!.t) / 1000
        setElapsedSec(Math.min(CAPTURE_SECONDS, elapsed))

        // Cheap live diagnostics from the most recent window (by time), a few
        // times/sec, using its measured fps. Brightness/coverage hint + waveform.
        if (buf.length % 8 === 0) {
          const cutoff = sample.t - LIVE_WINDOW_SECONDS * 1000
          const recent = buf.filter((s) => s.t >= cutoff)
          if (recent.length >= 32) {
            const fpsLive = measuredFps(recent)
            const values = recent.map((s) => s.value)
            const state = classifyBrightness(values, fpsLive)
            setBrightness(state)
            lastBrightnessRef.current = state
            drawWaveform(canvasRef.current, values, fpsLive)
          }
        }

        if (elapsed >= CAPTURE_SECONDS) finish()
      })
      // Turn the flash on for a clean finger-PPG signal — best-effort; a no-op on iOS
      // and devices without torch control (CameraSignalSource turns it off on stop()).
      void source.setTorch(true)
      // The preview <video> is attached by an effect once the capturing phase
      // renders (the ref doesn't exist yet here). See the effect below.
      setPhase('capturing')
    } catch {
      sourceRef.current = null
      setError(t('ppg.errorPermission'))
    }
  }, [createSource, finish, t])

  const cancel = useCallback(() => {
    doneRef.current = true
    teardown()
    setPhase('guide')
    setElapsedSec(0)
  }, [teardown])

  if (phase === 'result' && result) {
    return (
      <MeasureResult
        assessment={result}
        onCheckIn={onCheckIn}
        onAgain={() => setPhase('guide')}
        onDone={onDone}
      />
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
      <header className="text-center">
        <span className="inline-block rounded-full bg-calm-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-calm-deep">
          {t('measure.experimental')}
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          {t('measure.title')}
        </h1>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-band-high-soft px-4 py-3 text-sm text-ink-soft">
          {error}
        </p>
      )}

      {phase === 'guide' && <GuideStep onStart={() => void start()} onCancel={onDone} />}

      {phase === 'capturing' && (
        <CaptureStep
          elapsedSec={elapsedSec}
          brightness={brightness}
          videoRef={videoRef}
          canvasRef={canvasRef}
          onCancel={cancel}
        />
      )}

      {phase === 'fail' && (
        <FailStep cause={failCause} onRetry={() => setPhase('guide')} onDone={onDone} />
      )}
    </section>
  )
}

function GuideStep({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5">
      <div
        role="note"
        className="flex flex-col gap-1.5 rounded-[1.5rem] border-2 border-band-high/40 bg-band-high-soft/40 p-5"
      >
        <p className="text-sm font-semibold text-ink">⚠️ {t('measure.notMedicalTitle')}</p>
        <p className="text-sm leading-relaxed text-ink-soft">{t('measure.notMedical')}</p>
      </div>
      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-calm/15 bg-surface/70 p-5">
        <h2 className="text-sm font-semibold text-ink">{t('measure.guideTitle')}</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{t('measure.guideBody')}</p>
        {isIos() && (
          <p className="text-sm leading-relaxed text-ink-faint">{t('measure.guideIos')}</p>
        )}
        <p className="text-xs leading-relaxed text-ink-faint">{t('measure.guidePrivacy')}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button className="self-center" onClick={onStart}>
          {t('measure.start')}
        </Button>
        <Button variant="ghost" className="self-center" onClick={onCancel}>
          {t('measure.cancel')}
        </Button>
      </div>
    </div>
  )
}

function CaptureStep({
  elapsedSec,
  brightness,
  videoRef,
  canvasRef,
  onCancel,
}: {
  elapsedSec: number
  brightness: BrightnessState
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const pct = Math.min(100, Math.round((elapsedSec / CAPTURE_SECONDS) * 100))
  const secondsLeft = Math.max(0, Math.ceil(CAPTURE_SECONDS - elapsedSec))

  const good = brightness === 'good'
  const hintKey = hintKeyFor(brightness)

  return (
    <div className="flex flex-col items-center gap-6">
      <ProgressRing pct={pct} />

      {/* What the camera sees + the live pulse wave: helps place the finger. */}
      <div className="flex items-center gap-4">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          aria-label={t('measure.previewAria')}
          className="h-[72px] w-[72px] rounded-2xl border border-calm/15 bg-ink/5 object-cover"
        />
        <canvas
          ref={canvasRef}
          width={160}
          height={72}
          role="img"
          aria-label={t('measure.waveformAria')}
          className="h-[72px] w-40 rounded-2xl border border-calm/15 bg-surface/70"
        />
      </div>

      <div
        aria-live="polite"
        className="flex flex-col items-center gap-1 text-center"
        role="status"
      >
        <p className="text-base font-semibold text-ink">{t('measure.holdSteady')}</p>
        <p className={`text-sm font-medium ${good ? 'text-band-low' : 'text-band-moderate'}`}>
          {good ? t('measure.signalGood') : t(hintKey ?? 'measure.signalWeak')}
        </p>
        <p className="text-sm tabular-nums text-ink-faint">
          {t('measure.secondsLeft', { seconds: secondsLeft })}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={t('measure.progressAria')}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-ink-faint/20"
      >
        <div className="h-full rounded-full bg-calm transition-all" style={{ width: `${pct}%` }} />
      </div>

      <Button variant="ghost" className="self-center" onClick={onCancel}>
        {t('measure.cancel')}
      </Button>
    </div>
  )
}

/** Circular progress indicator; static fill (no spin) respects reduced motion. */
function ProgressRing({ pct }: { pct: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <div className="relative flex h-36 w-36 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-calm-soft)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-calm)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute text-2xl font-semibold tabular-nums text-ink">{pct}%</span>
    </div>
  )
}

function FailStep({
  cause,
  onRetry,
  onDone,
}: {
  cause: BrightnessState
  onRetry: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  // Honest, specific help from the last live state, when we have one beyond the
  // generic "weak". Falls back to the generic guidance otherwise.
  const causeHint = cause === 'weak' ? null : hintKeyFor(cause)
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex flex-col gap-2 rounded-[1.5rem] border border-calm/15 bg-band-moderate-soft px-6 py-8">
        <h2 className="text-base font-semibold text-ink">{t('measure.failTitle')}</h2>
        <p className="max-w-xs text-balance text-sm leading-relaxed text-ink-soft">
          {t('measure.failBody')}
        </p>
        {causeHint && (
          <p className="max-w-xs text-balance text-sm font-medium leading-relaxed text-band-moderate">
            {t(causeHint)}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button className="self-center" onClick={onRetry}>
          {t('measure.retry')}
        </Button>
        <Button variant="ghost" className="self-center" onClick={onDone}>
          {t('measure.done')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Classify the recent window into a coverage/lighting/motion state for the live
 * hint. This is diagnostics only — it never touches the DSP verdict, which is
 * still computed honestly at the end by assessReading.
 *
 *  - raw mean ≥ BRIGHT_CLIP → the red channel is clipping (over-exposed / lens
 *    not fully covered with the flash blasting through).
 *  - raw mean ≤ DARK_FLOOR → dark / lens uncovered (or flash off).
 *  - otherwise judge by signal quality; if quality is below the pass floor but
 *    the raw level is jumping around a lot, it's most likely motion.
 */
function classifyBrightness(values: number[], fps: number): BrightnessState {
  if (values.length === 0) return 'weak'
  let sum = 0
  for (const v of values) sum += v
  const m = sum / values.length
  if (m >= BRIGHT_CLIP) return 'tooBright'
  if (m <= DARK_FLOOR) return 'tooDark'

  const q = signalQuality(values, fps)
  if (q >= QUALITY_PASS_THRESHOLD) return 'good'

  // Weak but lit and covered: distinguish jitter (motion) from a flat signal.
  let varSum = 0
  for (const v of values) varSum += (v - m) * (v - m)
  const std = Math.sqrt(varSum / values.length)
  // A relative swing this large at low quality reads as motion, not a pulse.
  if (m > 1 && std / m > 0.08) return 'tooMuchMotion'
  return 'weak'
}

/**
 * Draw the recent band-passed signal as a live waveform. Pure canvas drawing —
 * reads the values, writes pixels, keeps nothing. Adapted from the PPG lab.
 */
function drawWaveform(canvas: HTMLCanvasElement | null, raw: number[], fps: number): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const filtered = bandpass(raw, fps)
  if (filtered.length < 2) return

  let min = Infinity
  let max = -Infinity
  for (const v of filtered) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  const x = (i: number) => (i / (filtered.length - 1)) * w
  const y = (v: number) => h - ((v - min) / range) * (h - 8) - 4

  ctx.beginPath()
  ctx.strokeStyle = '#2c8c85'
  ctx.lineWidth = 2
  for (let i = 0; i < filtered.length; i++) {
    const px = x(i)
    const py = y(filtered[i] ?? 0)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}
