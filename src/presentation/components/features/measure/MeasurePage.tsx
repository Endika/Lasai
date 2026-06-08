import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/presentation/components/common/Button'
import { useWakeLock } from '@/presentation/hooks/useWakeLock'
import { CameraSignalSource } from '@/infrastructure/ppg/CameraSignalSource'
import type { ISignalSource } from '@/infrastructure/ppg/ISignalSource'
import {
  assessReading,
  signalQuality,
  QUALITY_PASS_THRESHOLD,
  type HeartReadingAssessment,
} from '@/domain/ppg/dsp'
import { MeasureResult } from './MeasureResult'

/** Sustained capture length. Long enough for a trustworthy HRV verdict. */
const CAPTURE_SECONDS = 50
/** Recent-window length (s) used only for the live "signal good/weak" hint. */
const LIVE_WINDOW_SECONDS = 5

type Phase = 'guide' | 'capturing' | 'result' | 'fail'

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
  const [liveGood, setLiveGood] = useState(false)
  const [result, setResult] = useState<HeartReadingAssessment | null>(null)

  // Keep the screen awake only while actively capturing.
  useWakeLock(phase === 'capturing')

  const sourceRef = useRef<ISignalSource | null>(null)
  const bufferRef = useRef<number[]>([])
  const doneRef = useRef(false)

  const teardown = useCallback(() => {
    sourceRef.current?.stop()
    sourceRef.current = null
  }, [])

  // Always release the camera when the view unmounts.
  useEffect(() => () => teardown(), [teardown])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    const source = sourceRef.current
    const fps = source?.fps() ?? 30
    const samples = bufferRef.current
    teardown()

    const assessment = assessReading(samples, fps)
    // If the capture never reached usable quality at all, refuse the reading.
    if (assessment.quality === 'poor' || !Number.isFinite(assessment.bpm)) {
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
    setLiveGood(false)
    bufferRef.current = []
    doneRef.current = false

    const source = createSource ? createSource() : new CameraSignalSource(30)
    sourceRef.current = source
    const fps = source.fps()
    const target = Math.round(fps * CAPTURE_SECONDS)
    const liveLen = Math.round(fps * LIVE_WINDOW_SECONDS)

    try {
      await source.start((sample) => {
        if (doneRef.current) return
        const buf = bufferRef.current
        buf.push(sample.value)

        const elapsed = buf.length / fps
        setElapsedSec(Math.min(CAPTURE_SECONDS, elapsed))

        // Cheap live hint from the most recent window only.
        if (buf.length % Math.max(1, Math.round(fps / 2)) === 0 && buf.length >= liveLen) {
          const recent = buf.slice(-liveLen)
          setLiveGood(signalQuality(recent, fps) >= QUALITY_PASS_THRESHOLD)
        }

        if (buf.length >= target) finish()
      })
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
        <CaptureStep elapsedSec={elapsedSec} liveGood={liveGood} onCancel={cancel} />
      )}

      {phase === 'fail' && <FailStep onRetry={() => setPhase('guide')} onDone={onDone} />}
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
  liveGood,
  onCancel,
}: {
  elapsedSec: number
  liveGood: boolean
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const pct = Math.min(100, Math.round((elapsedSec / CAPTURE_SECONDS) * 100))
  const secondsLeft = Math.max(0, Math.ceil(CAPTURE_SECONDS - elapsedSec))

  return (
    <div className="flex flex-col items-center gap-6">
      <ProgressRing pct={pct} />

      <div
        aria-live="polite"
        className="flex flex-col items-center gap-1 text-center"
        role="status"
      >
        <p className="text-base font-semibold text-ink">{t('measure.holdSteady')}</p>
        <p className={`text-sm font-medium ${liveGood ? 'text-band-low' : 'text-band-moderate'}`}>
          {liveGood ? t('measure.signalGood') : t('measure.signalWeak')}
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

function FailStep({ onRetry, onDone }: { onRetry: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex flex-col gap-2 rounded-[1.5rem] border border-calm/15 bg-band-moderate-soft px-6 py-8">
        <h2 className="text-base font-semibold text-ink">{t('measure.failTitle')}</h2>
        <p className="max-w-xs text-balance text-sm leading-relaxed text-ink-soft">
          {t('measure.failBody')}
        </p>
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
