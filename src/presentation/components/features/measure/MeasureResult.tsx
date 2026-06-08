import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/presentation/components/common/Button'
import { useContainer } from '@/presentation/context/ContainerProvider'
import { stressBandFromRmssd, type HeartReadingAssessment } from '@/domain/ppg/dsp'
import type { StressBand } from '@/domain/value-objects/StressBand'
import type { SaveHeartReadingHandler } from '@/application/handlers/SaveHeartReadingHandler'

const BAND_STYLE: Record<StressBand, { ring: string; dot: string; label: string }> = {
  low: { ring: 'bg-band-low-soft', dot: 'bg-band-low', label: 'measure.stressLow' },
  moderate: {
    ring: 'bg-band-moderate-soft',
    dot: 'bg-band-moderate',
    label: 'measure.stressModerate',
  },
  high: { ring: 'bg-band-high-soft', dot: 'bg-band-high', label: 'measure.stressHigh' },
}

export function MeasureResult({
  assessment,
  onCheckIn,
  onAgain,
  onDone,
}: {
  assessment: HeartReadingAssessment
  onCheckIn: () => void
  onAgain: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const container = useContainer()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const { bpm, rmssd, hrvReliable } = assessment
  // A local band only for display; the persisted band is recomputed in the
  // handler against the user's history.
  const band: StressBand | null = hrvReliable && rmssd !== null ? stressBandFromRmssd(rmssd) : null

  async function save() {
    if (saved || saving) return
    setSaving(true)
    try {
      const handler = container.resolve<SaveHeartReadingHandler>('saveHeartReading')
      await handler.execute({
        bpm,
        // Only persist HRV when it was reliable — never a faked stress number.
        rmssd: hrvReliable ? rmssd : null,
        quality: assessment.quality,
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="animate-gentle-rise mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('measure.resultTitle')}</h1>

      {/* Heart rate is always shown, prominently. */}
      <div className="flex h-44 w-44 flex-col items-center justify-center gap-1 rounded-full bg-calm-soft">
        <span className="text-xs uppercase tracking-wide text-ink-faint">
          {t('measure.bpmLabel')}
        </span>
        <span className="text-5xl font-light tabular-nums text-ink">{bpm}</span>
        <span className="text-xs text-ink-faint">{t('measure.bpmUnit')}</span>
      </div>

      {band ? (
        <div className="flex w-full flex-col items-center gap-2 rounded-[1.5rem] border border-calm/15 bg-surface/70 p-5">
          <span className="text-xs uppercase tracking-wide text-ink-faint">
            {t('measure.stressTitle')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-sm font-semibold text-ink-soft shadow-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${BAND_STYLE[band].dot}`}
              aria-hidden="true"
            />
            {t(BAND_STYLE[band].label)}
          </span>
          <p className="max-w-xs text-balance text-xs leading-relaxed text-ink-faint">
            {t('measure.stressExplain')}
          </p>
          <p className="text-xs font-medium text-ink-soft">{t('measure.stressNote')}</p>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-2 rounded-[1.5rem] border border-calm/15 bg-surface/70 p-5">
          <span className="text-sm font-semibold text-ink">{t('measure.noStressTitle')}</span>
          <p className="max-w-xs text-balance text-sm leading-relaxed text-ink-soft">
            {t('measure.noStressBody')}
          </p>
          <button
            type="button"
            onClick={onCheckIn}
            className="text-sm font-medium text-calm-deep underline-offset-2 transition-colors hover:underline"
          >
            {t('measure.goCheckIn')}
          </button>
        </div>
      )}

      <div className="flex w-full flex-col gap-2 pt-2">
        <Button onClick={() => void save()} disabled={saved || saving}>
          {saved ? t('measure.saved') : t('measure.save')}
        </Button>
        <Button variant="soft" onClick={onAgain}>
          {t('measure.again')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('measure.done')}
        </Button>
      </div>

      <p className="max-w-xs text-balance text-xs leading-relaxed text-ink-faint">
        {t('measure.notMedical')}
      </p>
    </section>
  )
}
