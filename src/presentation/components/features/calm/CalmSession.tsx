import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContainer } from '@/presentation/context/ContainerProvider'
import { usePrefersReducedMotion } from '@/presentation/hooks/usePrefersReducedMotion'
import { Button } from '@/presentation/components/common/Button'
import { BreathingPacer } from './BreathingPacer'
import { useAmbientSound } from './useAmbientSound'
import { pacerAt } from './breathingTimeline'
import {
  BREATHING_PATTERNS,
  type BreathingPatternId,
} from '@/domain/value-objects/BreathingPattern'
import type { LogCalmSessionHandler } from '@/application/handlers/LogCalmSessionHandler'

type Stage = 'setup' | 'running' | 'done'

const DURATIONS = [1, 3, 5] as const

const PATTERN_LABEL: Record<BreathingPatternId, { name: string; hint: string }> = {
  box: { name: 'calm.patternBox', hint: 'calm.patternBoxHint' },
  'four-seven-eight': {
    name: 'calm.patternFourSevenEight',
    hint: 'calm.patternFourSevenEightHint',
  },
}

export function CalmSession({ onHome }: { onHome: () => void }) {
  const { t } = useTranslation()
  const container = useContainer()
  const reducedMotion = usePrefersReducedMotion()

  const [stage, setStage] = useState<Stage>('setup')
  const [pattern, setPattern] = useState<BreathingPatternId>('box')
  const [durationMin, setDurationMin] = useState<number>(3)
  const [soundOn, setSoundOn] = useState(false)

  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number>(0)
  const totalSec = durationMin * 60

  useAmbientSound(soundOn && stage === 'running')

  const finish = useCallback(
    (ranSec: number) => {
      setStage('done')
      const durationSec = Math.max(1, Math.round(ranSec))
      const handler = container.resolve<LogCalmSessionHandler>('logCalmSession')
      void handler.execute({ pattern, durationSec }).catch(() => {
        /* logging is best-effort; never block the calm experience */
      })
    },
    [container, pattern],
  )

  // Drive the timer while running.
  useEffect(() => {
    if (stage !== 'running') return
    startRef.current = performance.now()
    const id = window.setInterval(() => {
      const secs = (performance.now() - startRef.current) / 1000
      if (secs >= totalSec) {
        window.clearInterval(id)
        finish(totalSec)
      } else {
        setElapsed(secs)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [stage, totalSec, finish])

  const pacer = pacerAt(pattern, elapsed)
  const remaining = Math.max(0, Math.ceil(totalSec - elapsed))

  if (stage === 'running') {
    return (
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-10 px-6 py-8">
        <BreathingPacer
          phase={pacer.phase}
          countdown={pacer.countdown}
          phaseProgress={pacer.phaseProgress}
          reducedMotion={reducedMotion}
        />
        <div className="flex flex-col items-center gap-1 text-ink-faint">
          <span className="text-xs uppercase tracking-wide">{t('calm.timeLeft')}</span>
          <span className="text-lg font-medium tabular-nums text-ink-soft">
            {formatClock(remaining)}
          </span>
        </div>
        <Button variant="soft" onClick={() => finish(elapsed)}>
          {t('calm.stop')}
        </Button>
      </section>
    )
  }

  if (stage === 'done') {
    return (
      <section className="animate-gentle-rise mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-calm/15">
          <div className="h-16 w-16 rounded-full bg-gradient-to-b from-calm to-calm-deep" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{t('calm.doneTitle')}</h2>
        <p className="max-w-xs text-balance text-ink-soft">{t('calm.doneBody')}</p>
        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={() => setStage('setup')}>{t('calm.doneAgain')}</Button>
          <Button variant="ghost" onClick={onHome}>
            {t('calm.doneHome')}
          </Button>
        </div>
      </section>
    )
  }

  // setup
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('calm.readyTitle')}</h1>
        <p className="mx-auto mt-2 max-w-xs text-balance text-sm text-ink-soft">
          {t('calm.readyBody')}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-soft">{t('calm.pattern')}</legend>
        {BREATHING_PATTERNS.map((p) => {
          const active = pattern === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPattern(p.id)}
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
        <legend className="mb-1 text-sm font-medium text-ink-soft">{t('calm.duration')}</legend>
        <div className="flex gap-2" role="group">
          {DURATIONS.map((m) => {
            const active = durationMin === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setDurationMin(m)}
                aria-pressed={active}
                className={`flex-1 rounded-2xl border px-4 py-3 text-center font-medium transition-all ${
                  active
                    ? 'border-calm bg-calm-soft text-ink'
                    : 'border-calm/15 bg-surface/70 text-ink-soft hover:border-calm/35'
                }`}
              >
                {t('calm.minutes', { count: m })}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="flex items-center justify-between rounded-2xl border border-calm/15 bg-surface/70 px-4 py-3">
        <span className="text-sm font-medium text-ink-soft">{t('calm.sound')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={soundOn}
          aria-label={soundOn ? t('calm.soundOn') : t('calm.soundOff')}
          onClick={() => setSoundOn((v) => !v)}
          className={`relative h-7 w-12 rounded-full transition-colors ${
            soundOn ? 'bg-calm' : 'bg-ink-faint/30'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
              soundOn ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </label>

      <Button
        className="self-center"
        onClick={() => {
          setElapsed(0)
          setStage('running')
        }}
      >
        {t('calm.start')}
      </Button>
    </section>
  )
}

function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
