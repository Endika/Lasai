import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en/translation.json'
import es from './locales/es/translation.json'
import gl from './locales/gl/translation.json'
import eu from './locales/eu/translation.json'
import ca from './locales/ca/translation.json'
import va from './locales/va/translation.json'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      gl: { translation: gl },
      eu: { translation: eu },
      ca: { translation: ca },
      va: { translation: va },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'gl', 'eu', 'ca', 'va'],
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  })

export default i18n
