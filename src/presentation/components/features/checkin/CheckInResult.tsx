import { useTranslation } from 'react-i18next'
import { Button } from '@/presentation/components/common/Button'
import type { CheckIn } from '@/domain/entities/CheckIn'
import type { StressBand } from '@/domain/value-objects/StressBand'

const BAND_STYLE: Record<StressBand, { ring: string; dot: string; title: string; body: string }> = {
  low: {
    ring: 'bg-band-low-soft',
    dot: 'bg-band-low',
    title: 'checkIn.result.bandLow',
    body: 'checkIn.result.bodyLow',
  },
  moderate: {
    ring: 'bg-band-moderate-soft',
    dot: 'bg-band-moderate',
    title: 'checkIn.result.bandModerate',
    body: 'checkIn.result.bodyModerate',
  },
  high: {
    ring: 'bg-band-high-soft',
    dot: 'bg-band-high',
    title: 'checkIn.result.bandHigh',
    body: 'checkIn.result.bodyHigh',
  },
}

export function CheckInResult({
  checkIn,
  onCalm,
  onDone,
}: {
  checkIn: CheckIn
  onCalm: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const style = BAND_STYLE[checkIn.band]

  return (
    <section className="animate-gentle-rise mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {t('checkIn.result.title')}
      </h1>

      <div
        className={`flex h-44 w-44 flex-col items-center justify-center gap-1 rounded-full ${style.ring}`}
      >
        <span className="text-xs uppercase tracking-wide text-ink-faint">
          {t('checkIn.result.scoreLabel')}
        </span>
        <span className="text-5xl font-light tabular-nums text-ink">{checkIn.score}</span>
        <span className="text-xs text-ink-faint">
          {t('checkIn.result.scoreValue', { score: 40 })}
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-sm font-semibold text-ink-soft shadow-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
          {t(style.title)}
        </span>
        <p className="max-w-xs text-balance text-sm leading-relaxed text-ink-soft">
          {t(style.body)}
        </p>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <Button onClick={onCalm}>{t('checkIn.result.breathe')}</Button>
        <Button variant="ghost" onClick={onDone}>
          {t('checkIn.result.done')}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-calm/15 pt-4 text-xs text-ink-faint">
        <p>{t('checkIn.result.attribution')}</p>
        <p className="font-medium text-ink-soft">{t('checkIn.result.disclaimer')}</p>
      </div>
    </section>
  )
}
