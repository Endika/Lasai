import { useTranslation } from 'react-i18next'
import { CalmMark } from '@/presentation/components/common/CalmMark'

interface HomePageProps {
  onCalm: () => void
  onCheckIn: () => void
  onHistory: () => void
  onMeasure: () => void
  onChestBreathe: () => void
}

export function HomePage({
  onCalm,
  onCheckIn,
  onHistory,
  onMeasure,
  onChestBreathe,
}: HomePageProps) {
  const { t } = useTranslation()

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-10 px-6 py-10 text-center">
      <div className="animate-gentle-rise flex flex-col items-center gap-4">
        <CalmMark className="h-16 w-16" />
        <p className="max-w-xs text-balance text-lg leading-relaxed text-ink-soft">
          {t('home.tagline')}
        </p>
      </div>

      {/* The hero CTA: one breath away from calm. */}
      <button
        type="button"
        onClick={onCalm}
        className="animate-gentle-rise group relative flex aspect-square w-60 flex-col items-center justify-center rounded-full bg-calm text-white shadow-[0_24px_60px_-20px_rgba(44,140,133,0.65)] transition-transform duration-300 hover:scale-[1.03] active:scale-100"
        style={{ animationDelay: '0.1s' }}
      >
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-calm/40 motion-safe:animate-[halo-pulse_6s_ease-in-out_infinite]"
          aria-hidden="true"
        />
        <span className="relative text-2xl font-semibold tracking-tight">{t('home.calmNow')}</span>
        <span className="relative mt-1 max-w-[10rem] text-xs leading-snug text-white/85">
          {t('home.calmNowHint')}
        </span>
      </button>

      <div
        className="animate-gentle-rise flex w-full flex-col gap-3"
        style={{ animationDelay: '0.2s' }}
      >
        <SecondaryEntry
          title={t('home.checkIn')}
          hint={t('home.checkInHint')}
          onClick={onCheckIn}
        />
        <SecondaryEntry
          title={t('home.measure')}
          hint={t('home.measureHint')}
          onClick={onMeasure}
          badge={t('measure.experimental')}
        />
        <SecondaryEntry
          title={t('home.chestBreathe')}
          hint={t('home.chestBreatheHint')}
          onClick={onChestBreathe}
          badge={t('chest.experimental')}
        />
        <SecondaryEntry
          title={t('home.history')}
          hint={t('home.historyHint')}
          onClick={onHistory}
        />
      </div>
    </section>
  )
}

function SecondaryEntry({
  title,
  hint,
  onClick,
  badge,
}: {
  title: string
  hint: string
  onClick: () => void
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-[1.5rem] border border-calm/15 bg-surface/70 px-5 py-4 text-left shadow-[0_4px_16px_-12px_rgba(44,140,133,0.5)] transition-all hover:-translate-y-0.5 hover:border-calm/35 hover:bg-surface active:translate-y-0"
    >
      <span className="flex items-center gap-2">
        <span className="text-base font-semibold text-ink">{title}</span>
        {badge && (
          <span className="rounded-full bg-calm-soft px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-calm-deep">
            {badge}
          </span>
        )}
      </span>
      <span className="text-sm text-ink-faint">{hint}</span>
    </button>
  )
}
