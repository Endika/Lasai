import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Modal } from './Modal'
import { appVersion } from '@/shared/appVersion'

export function Footer() {
  const { t } = useTranslation()
  const [showPrivacy, setShowPrivacy] = useState(false)

  return (
    <footer className="mt-12 flex flex-col items-center gap-3 px-5 pb-[calc(1.5rem+var(--safe-bottom))] text-xs text-ink-faint">
      <LanguageSwitcher />
      <button
        type="button"
        onClick={() => setShowPrivacy(true)}
        className="underline-offset-2 transition-colors hover:text-ink-soft hover:underline"
      >
        {t('privacy.link')}
      </button>
      <div className="tracking-wide text-ink-faint/70">
        {t('app.name')} <span className="text-ink-faint/50">v{appVersion}</span>
      </div>

      <Modal open={showPrivacy} onClose={() => setShowPrivacy(false)} labelledBy="privacy-title">
        <div className="flex flex-col gap-3 pb-2">
          <h2 id="privacy-title" className="text-lg font-semibold text-ink">
            {t('privacy.title')}
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">{t('privacy.body')}</p>
        </div>
      </Modal>
    </footer>
  )
}
