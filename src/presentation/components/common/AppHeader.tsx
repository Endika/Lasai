import { useTranslation } from 'react-i18next'
import { CalmMark } from './CalmMark'

export function AppHeader({ onHome }: { onHome?: () => void }) {
  const { t } = useTranslation()
  return (
    <header className="mx-auto w-full max-w-lg px-5 pt-5">
      <button
        type="button"
        aria-label={t('app.name')}
        onClick={onHome}
        className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-75"
      >
        <CalmMark className="h-7 w-7" />
        <span className="text-xl font-semibold tracking-tight text-ink lowercase">
          {t('app.name')}
        </span>
      </button>
    </header>
  )
}
