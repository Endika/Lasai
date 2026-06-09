import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Inline SVG flags — flag emoji don't render on Windows; regional letters lack support for sub-national flags.

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

// The Galician flag has no Unicode emoji, so we draw it inline.
function GaliciaFlag() {
  return (
    <svg viewBox="0 0 24 16" width="18" height="12" className="rounded-[2px]" aria-hidden="true">
      <rect width="24" height="16" fill="#ffffff" />
      <line x1="2" y1="-1" x2="24" y2="15" stroke="#0066CC" strokeWidth="3" />
    </svg>
  )
}

// The Basque flag (ikurriña) has no Unicode emoji, so we draw it inline.
function Ikurrina() {
  return (
    <svg viewBox="0 0 24 16" width="18" height="12" className="rounded-[2px]" aria-hidden="true">
      <rect width="24" height="16" fill="#D52B1E" />
      <g stroke="#009B48" strokeWidth="2.4">
        <line x1="0" y1="0" x2="24" y2="16" />
        <line x1="24" y1="0" x2="0" y2="16" />
      </g>
      <g stroke="#ffffff" strokeWidth="2.4">
        <line x1="12" y1="0" x2="12" y2="16" />
        <line x1="0" y1="8" x2="24" y2="8" />
      </g>
    </svg>
  )
}

// The Catalan flag (senyera) has no Unicode emoji, so we draw it inline.
function Senyera() {
  return (
    <svg viewBox="0 0 24 16" width="18" height="12" className="rounded-[2px]" aria-hidden="true">
      <rect width="24" height="16" fill="#FCDD09" />
      <g fill="#DA121A">
        <rect y="1.78" width="24" height="1.78" />
        <rect y="5.33" width="24" height="1.78" />
        <rect y="8.89" width="24" height="1.78" />
        <rect y="12.44" width="24" height="1.78" />
      </g>
    </svg>
  )
}

// The Valencian flag has no Unicode emoji, so we draw it inline.
function ValenciaFlag() {
  return (
    <svg viewBox="0 0 24 16" width="18" height="12" className="rounded-[2px]" aria-hidden="true">
      <rect width="24" height="16" fill="#FCDD09" />
      <g fill="#DA121A">
        <rect y="1.78" width="24" height="1.78" />
        <rect y="5.33" width="24" height="1.78" />
        <rect y="8.89" width="24" height="1.78" />
        <rect y="12.44" width="24" height="1.78" />
      </g>
      <rect width="6.5" height="16" fill="#0050A0" />
      <line x1="6.5" y1="0" x2="6.5" y2="16" stroke="#FCDD09" strokeWidth="0.6" />
    </svg>
  )
}

const LANGUAGES: { code: string; label: string; flag: ReactNode }[] = [
  { code: 'en', label: 'English', flag: <UnionJack /> },
  { code: 'es', label: 'Español', flag: <SpainFlag /> },
  { code: 'gl', label: 'Galego', flag: <GaliciaFlag /> },
  { code: 'eu', label: 'Euskara', flag: <Ikurrina /> },
  { code: 'ca', label: 'Català', flag: <Senyera /> },
  { code: 'va', label: 'Valencià', flag: <ValenciaFlag /> },
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
