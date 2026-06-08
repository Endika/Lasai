import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Inline SVG flags — flag emoji don't render on Windows.

function UnionJack() {
  return (
    <svg viewBox="0 0 24 16" width="18" height="12" className="rounded-[2px]" aria-hidden="true">
      <rect width="24" height="16" fill="#012169" />
      <g stroke="#ffffff" strokeWidth="3">
        <line x1="0" y1="0" x2="24" y2="16" />
        <line x1="24" y1="0" x2="0" y2="16" />
      </g>
      <g stroke="#C8102E" strokeWidth="1.5">
        <line x1="0" y1="0" x2="24" y2="16" />
        <line x1="24" y1="0" x2="0" y2="16" />
      </g>
      <rect x="9" width="6" height="16" fill="#ffffff" />
      <rect y="5" width="24" height="6" fill="#ffffff" />
      <rect x="10.5" width="3" height="16" fill="#C8102E" />
      <rect y="6.5" width="24" height="3" fill="#C8102E" />
    </svg>
  )
}

function SpainFlag() {
  return (
    <svg viewBox="0 0 24 16" width="18" height="12" className="rounded-[2px]" aria-hidden="true">
      <rect width="24" height="16" fill="#AA151B" />
      <rect y="4" width="24" height="8" fill="#F1BF00" />
    </svg>
  )
}

const LANGUAGES: { code: string; label: string; flag: ReactNode }[] = [
  { code: 'en', label: 'English', flag: <UnionJack /> },
  { code: 'es', label: 'Español', flag: <SpainFlag /> },
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.resolvedLanguage ?? i18n.language ?? 'en'

  return (
    <div className="flex flex-wrap justify-center gap-1" role="group" aria-label="Language">
      {LANGUAGES.map((lang) => {
        const active = current.startsWith(lang.code)
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => void i18n.changeLanguage(lang.code)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-calm/15 text-ink-soft'
                : 'text-ink-faint hover:bg-calm-soft hover:text-ink-soft'
            }`}
            aria-pressed={active}
            title={lang.label}
          >
            <span className="leading-none">{lang.flag}</span>
            <span>{lang.label}</span>
          </button>
        )
      })}
    </div>
  )
}
