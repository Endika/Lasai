import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/presentation/components/common/Button'
import { useContainer } from '@/presentation/context/ContainerProvider'
import { useWakeLock } from '@/presentation/hooks/useWakeLock'
import { DeviceMotionSource } from '@/infrastructure/motion/DeviceMotionSource'
import type { IMotionSource } from '@/infrastructure/motion/IMotionSource'
import {
  analyzeMotion,
  QUALITY_PASS_THRESHOLD,
  TARGET_FPS,
  type MotionAnalysis,
  type MotionSample,
} from '@/domain/motion/dsp'
import {
  BREATHING_PATTERNS,
  type BreathingPatternId,
} from '@/domain/value-objects/BreathingPattern'
import type { SaveMotionReadingHandler } from '@/application/handlers/SaveMotionReadingHandler'
import { buildBreathCues, type BreathCue, type BreathePhase } from './breathCueSchedule'
import { getAudioContextCtor, playEndCue, playPhaseCue, vibrate } from './breathAudio'

/** Cap on raw samples kept in memory, regardless of duration (no unbounded growth). */
const MAX_RAW_SAMPLES = 3 * 60 * 120
/** Recent window (s) for the live in-session breathing/heart estimate. */
const LIVE_WINDOW_SEC = 20

const DURATIONS_MIN = [1, 2, 3] as const

const PATTERN_LABEL: Record<BreathingPatternId, { name: string; hint: string }> = {
  box: { name: 'calm.patternBox', hint: 'calm.patternBoxHint' },
  'four-seven-eight': {
    name: 'calm.patternFourSevenEight',
    hint: 'calm.patternFourSevenEightHint',
  },
}

const PHASE_LABEL: Record<BreathePhase, string> = {
  inhale: 'calm.phaseInhale',
  hold: 'calm.phaseHold',
  exhale: 'calm.phaseExhale',
  rest: 'calm.phaseRest',
}

type Phase = 'guide' | 'session' | 'result'

interface ChestBreathePageProps {
  /** Leave the flow (e.g. back home). */
  onDone: () => void
  /** Override the motion source (tests inject a fake). Defaults to DeviceMotion. */
  createSource?: () => IMotionSource
}

export function ChestBreathePage({ onDone, createSource }: ChestBreathePageProps) {
  const { t } = useTranslation()
  const container = useContainer()

  const [phase, setPhase] = useState<Phase>('guide')
  const [error, setError] = useState<string | null>(null)
  const [pattern, setPattern] = useState<BreathingPatternId>('box')
  const [durationMin, setDurationMin] = useState<number>(2)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [activePhase, setActivePhase] = useState<BreathePhase>('inhale')
  const [analysis, setAnalysis] = useState<MotionAnalysis | null>(null)
  const [liveBreaths, setLiveBreaths] = useState<number | null>(null)
  const [liveBpm, setLiveBpm] = useState<number | null>(null)

  useWakeLock(phase === 'session')

  const sourceRef = useRef<IMotionSource | null>(null)
  const bufferRef = useRef<MotionSample[]>([])
  const lastLiveRef = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const cuesRef = useRef<BreathCue[]>([])
  const nextCueRef = useRef(0)
  const doneRef = useRef(false)
  const totalSecRef = useRef(0)

  const releaseAudio = useCallback(() => {
    const ctx = audioRef.current
    audioRef.current = null
    if (ctx) void ctx.close().catch(() => {})
  }, [])

  const teardown = useCallback(() => {
    sourceRef.current?.stop()
    sourceRef.current = null
  }, [])

  // Always release sensor + audio + (implicit) wake lock when the view unmounts.
  useEffect(() => {
    return () => {
      teardown()
      releaseAudio()
    }
  }, [teardown, releaseAudio])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    teardown()
    const buf = bufferRef.current
    setAnalysis(analyzeMotion(buf, TARGET_FPS))
    setPhase('result')
    playEndCue(audioRef.current)
    // The end cue is the last sound; close the context shortly after it plays.
    window.setTimeout(releaseAudio, 800)
  }, [teardown, releaseAudio])

  const start = useCallback(async () => {
    setError(null)
    setAnalysis(null)
    setLiveBreaths(null)
    setLiveBpm(null)
    lastLiveRef.current = 0
    bufferRef.current = []
    doneRef.current = false
    nextCueRef.current = 0
    const totalSec = durationMin * 60
    totalSecRef.current = totalSec
    cuesRef.current = buildBreathCues(pattern, totalSec)
    setSecondsLeft(totalSec)
    setActivePhase(cuesRef.current[0]?.phase ?? 'inhale')

    // Create + resume the AudioContext INSIDE this user gesture so iOS allows
    // the breathing tones and the end beep to play.
    if (!audioRef.current) {
      const Ctor = getAudioContextCtor()
      if (Ctor) {
        try {
          audioRef.current = new Ctor()
        } catch {
          audioRef.current = null
        }
      }
    }
    void audioRef.current?.resume().catch(() => {})

    const source = createSource ? createSource() : new DeviceMotionSource()
    sourceRef.current = source

    if (source.needsPermission()) {
      const result = await source.requestPermission()
      if (result !== 'granted') {
        sourceRef.current = null
        releaseAudio()
        setError(t('chest.errorDenied'))
        return
      }
    }

    try {
      await source.start((sample) => {
        if (doneRef.current) return
        const buf = bufferRef.current
        buf.push(sample)
        if (buf.length > MAX_RAW_SAMPLES) buf.shift()

        // Drive the clock, cues and completion off real timestamps (testable + accurate).
        const elapsed = (sample.t - buf[0]!.t) / 1000
        setSecondsLeft(Math.max(0, Math.ceil(totalSecRef.current - elapsed)))

        const cues = cuesRef.current
        while (nextCueRef.current < cues.length && cues[nextCueRef.current]!.atSec <= elapsed) {
          const cue = cues[nextCueRef.current]!
          nextCueRef.current++
          setActivePhase(cue.phase)
          playPhaseCue(audioRef.current, cue.phase, cue.durationSec)
          vibrate(cue.phase === 'inhale' || cue.phase === 'exhale' ? 60 : 30)
        }

        // Live estimate (~1/s) over the recent window — keeps the last good value,
        // so the user sees it's detecting rather than only a result at the end.
        if (sample.t - lastLiveRef.current >= 1000) {
          lastLiveRef.current = sample.t
          const recent = buf.filter((s) => s.t >= sample.t - LIVE_WINDOW_SEC * 1000)
          if (recent.length >= TARGET_FPS * 8) {
            const a = analyzeMotion(recent, TARGET_FPS)
            if (Number.isFinite(a.breathsPerMin) && a.breathsPerMin > 0) {
              setLiveBreaths(Math.round(a.breathsPerMin))
            }
            if (a.bcgBpm != null) setLiveBpm(a.bcgBpm)
          }
        }

        if (elapsed >= totalSecRef.current) finish()
      })
      // Fire the very first cue immediately so guidance starts at t=0.
      const first = cuesRef.current[0]
      if (first) {
        nextCueRef.current = 1
        setActivePhase(first.phase)
        playPhaseCue(audioRef.current, first.phase, first.durationSec)
        vibrate(first.phase === 'inhale' || first.phase === 'exhale' ? 60 : 30)
      }
      setPhase('session')
    } catch {
      sourceRef.current = null
      releaseAudio()
      setError(t('chest.errorStart'))
    }
  }, [createSource, durationMin, pattern, finish, releaseAudio, t])

  const cancel = useCallback(() => {
    doneRef.current = true
    teardown()
    releaseAudio()
    bufferRef.current = []
    setPhase('guide')
  }, [teardown, releaseAudio])

  if (phase === 'result' && analysis) {
    return (
      <ChestResult
        analysis={analysis}
        onAgain={() => setPhase('guide')}
        onDone={onDone}
        saveHandler={() => container.resolve<SaveMotionReadingHandler>('saveMotionReading')}
      />
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
      <header className="text-center">
        <span className="inline-block rounded-full bg-calm-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-calm-deep">
          {t('chest.experimental')}
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{t('chest.title')}</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-band-high-soft px-4 py-3 text-sm text-ink-soft">
          {error}
        </p>
      )}

      {phase === 'guide' && (
        <GuideStep
          pattern={pattern}
          durationMin={durationMin}
          onPattern={setPattern}
          onDuration={setDurationMin}
          onStart={() => void start()}
          onCancel={onDone}
        />
      )}

      {phase === 'session' && (
        <SessionStep
          activePhase={activePhase}
          secondsLeft={secondsLeft}
          liveBreaths={liveBreaths}
          liveBpm={liveBpm}
          onCancel={cancel}
        />
      )}
    </section>
  )
}

function GuideStep({
  pattern,
  durationMin,
  onPattern,
  onDuration,
  onStart,
  onCancel,
}: {
  pattern: BreathingPatternId
  durationMin: number
  onPattern: (id: BreathingPatternId) => void
  onDuration: (m: number) => void
  onStart: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5">
      <div
        role="note"
        className="flex flex-col gap-1.5 rounded-[1.5rem] border-2 border-band-high/40 bg-band-high-soft/40 p-5"
      >
        <p className="text-sm font-semibold text-ink">⚠️ {t('chest.notMedicalTitle')}</p>
        <p className="text-sm leading-relaxed text-ink-soft">{t('chest.notMedical')}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-[1.5rem] border border-calm/15 bg-surface/70 p-5">
        <h2 className="text-sm font-semibold text-ink">{t('chest.guideTitle')}</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{t('chest.guideBody')}</p>
        <p className="text-xs leading-relaxed text-ink-faint">{t('chest.guidePrivacy')}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-soft">{t('chest.pattern')}</legend>
        {BREATHING_PATTERNS.map((p) => {
          const active = pattern === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPattern(p.id)}
              aria-pressed={active}
              className={`flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-all ${
                active
                  ? 'border-calm bg-calm-soft'
                  : 'border-calm/15 bg-surface/70 hover:border-calm/35'
              }`}
            >
              <span className="font-semibold text-ink">{t(PATTERN_LABEL[p.id].name)}</span>
              <span className="text-sm text-ink-faint">{t(PATTERN_LABEL[p.id].hint)}</span>
            </button>
          )
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-soft">{t('chest.duration')}</legend>
        <div className="flex gap-2" role="group">
          {DURATIONS_MIN.map((m) => {
            const active = durationMin === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => onDuration(m)}
                aria-pressed={active}
                className={`flex-1 rounded-2xl border px-4 py-3 text-center font-medium transition-all ${
                  active
                    ? 'border-calm bg-calm-soft text-ink'
                    : 'border-calm/15 bg-surface/70 text-ink-soft hover:border-calm/35'
                }`}
              >
                {t('chest.minutes', { count: m })}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button className="self-center" onClick={onStart}>
          {t('chest.start')}
        </Button>
        <Button variant="ghost" className="self-center" onClick={onCancel}>
          {t('chest.cancel')}
        </Button>
      </div>
    </div>
  )
}

function SessionStep({
  activePhase,
  secondsLeft,
  liveBreaths,
  liveBpm,
  onCancel,
}: {
  activePhase: BreathePhase
  secondsLeft: number
  liveBreaths: number | null
  liveBpm: number | null
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="flex h-44 w-44 flex-col items-center justify-center gap-1 rounded-full bg-calm-soft text-center">
        <span className="text-xs uppercase tracking-wide text-ink-faint">{t('chest.follow')}</span>
        {/* Audio is the primary guide; this label is the secondary visual aid. */}
        <span className="text-3xl font-light text-ink" aria-live="assertive" role="status">
          {t(PHASE_LABEL[activePhase])}
        </span>
      </div>

      {/* Live detection — reassures it's measuring; keeps the last value. */}
      <div className="flex items-center gap-5 text-center" aria-live="polite">
        <span className="flex items-baseline gap-1 text-ink-soft">
          <span aria-hidden>🫁</span>
          <span className="text-2xl font-light tabular-nums text-ink">{liveBreaths ?? '–'}</span>
          <span className="text-xs text-ink-faint">
            {liveBreaths != null ? t('chest.breathsUnit') : t('chest.detecting')}
          </span>
        </span>
        {liveBpm != null && (
          <span className="flex items-baseline gap-1 text-ink-soft">
            <span aria-hidden className="text-band-high">
              ♥
            </span>
            <span className="text-2xl font-light tabular-nums text-ink">{liveBpm}</span>
            <span className="text-xs text-ink-faint">{t('chest.bpmUnit')}</span>
          </span>
        )}
      </div>

      <p className="max-w-xs text-balance text-center text-sm text-ink-soft">
        {t('chest.sessionHint')}
      </p>

      <p className="text-sm tabular-nums text-ink-faint" aria-live="off">
        {t('chest.secondsLeft', { seconds: secondsLeft })}
      </p>

      <Button variant="ghost" className="self-center" onClick={onCancel}>
        {t('chest.cancel')}
      </Button>
    </div>
  )
}

function ChestResult({
  analysis,
  onAgain,
  onDone,
  saveHandler,
}: {
  analysis: MotionAnalysis
  onAgain: () => void
  onDone: () => void
  saveHandler: () => SaveMotionReadingHandler
}) {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const hasBreaths = Number.isFinite(analysis.breathsPerMin)
  const breaths = hasBreaths ? String(analysis.breathsPerMin) : '—'
  // BCG is only shown when its quality cleared the bar — analyzeMotion already
  // nulls it otherwise, so we never display a fabricated heart number.
  const bcgBpm = analysis.bcgBpm
  const breathPasses = analysis.breathingQuality >= QUALITY_PASS_THRESHOLD

  async function save() {
    if (saved || saving || !hasBreaths) return
    setSaving(true)
    try {
      await saveHandler().execute({
        breathsPerMin: analysis.breathsPerMin,
        // Only persist the heart estimate when it cleared the bar; never faked.
        bcgBpm,
        quality: analysis.breathingQuality,
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="animate-gentle-rise mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('chest.resultTitle')}</h1>

      <div className="flex h-44 w-44 flex-col items-center justify-center gap-1 rounded-full bg-calm-soft">
        <span className="text-xs uppercase tracking-wide text-ink-faint">{t('chest.breaths')}</span>
        <span className="text-5xl font-light tabular-nums text-ink">{breaths}</span>
        <span className="text-xs text-ink-faint">{t('chest.breathsUnit')}</span>
      </div>

      {!breathPasses && hasBreaths && (
        <p className="max-w-xs text-balance text-sm text-band-moderate">{t('chest.weakSignal')}</p>
      )}
      {!hasBreaths && (
        <p className="max-w-xs text-balance text-sm text-band-moderate">{t('chest.noBreaths')}</p>
      )}

      {bcgBpm != null && (
        <div className="flex w-full flex-col items-center gap-1 rounded-[1.5rem] border border-calm/15 bg-surface/70 p-5">
          <span className="text-xs uppercase tracking-wide text-ink-faint">{t('chest.bpm')}</span>
          <span className="text-3xl font-light tabular-nums text-ink">{bcgBpm}</span>
          <span className="text-xs text-ink-faint">{t('chest.bpmUnit')}</span>
          <p className="mt-1 max-w-xs text-balance text-xs leading-relaxed text-ink-faint">
            {t('chest.bcgNote')}
          </p>
        </div>
      )}

      <p className="text-xs font-medium text-ink-soft">{t('chest.experimentalNote')}</p>

      <div className="flex w-full flex-col gap-2 pt-2">
        <Button onClick={() => void save()} disabled={saved || saving || !hasBreaths}>
          {saved ? t('chest.saved') : t('chest.save')}
        </Button>
        <Button variant="soft" onClick={onAgain}>
          {t('chest.again')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('chest.done')}
        </Button>
      </div>

      <p className="max-w-xs text-balance text-xs leading-relaxed text-ink-faint">
        {t('chest.notMedical')}
      </p>
    </section>
  )
}
