import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContainerProvider } from '@/presentation/context/ContainerProvider'
import { AppHeader } from '@/presentation/components/common/AppHeader'
import { Footer } from '@/presentation/components/common/Footer'
import { HomePage } from '@/presentation/components/features/home/HomePage'
import { CalmSession } from '@/presentation/components/features/calm/CalmSession'
import { CheckInPage } from '@/presentation/components/features/checkin/CheckInPage'
import { HistoryPage } from '@/presentation/components/features/history/HistoryPage'
import { MeasurePage } from '@/presentation/components/features/measure/MeasurePage'
import { PpgLabPage } from '@/presentation/components/features/ppg/PpgLabPage'

// 'ppg-lab' is a hidden diagnostic route reachable only via ?view=ppg-lab.
// It is intentionally NOT linked from Home or any menu (experimental SPIKE).
type View = 'home' | 'calm' | 'checkin' | 'history' | 'measure' | 'ppg-lab'

const VIEWS: readonly View[] = ['home', 'calm', 'checkin', 'history', 'measure', 'ppg-lab']

function readView(): View {
  const v = new URL(window.location.href).searchParams.get('view')
  return (VIEWS as readonly string[]).includes(v ?? '') ? (v as View) : 'home'
}

export default function App() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>(() => readView())

  useEffect(() => {
    const onPop = () => setView(readView())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((next: View) => {
    const base = import.meta.env.BASE_URL
    const url = next === 'home' ? base : `${base}?view=${next}`
    window.history.pushState({}, '', url)
    setView(next)
    window.scrollTo({ top: 0 })
  }, [])

  const goHome = useCallback(() => go('home'), [go])

  return (
    <ContainerProvider>
      <div className="flex min-h-dvh flex-col">
        <AppHeader onHome={goHome} />

        {view !== 'home' && (
          <div className="mx-auto w-full max-w-md px-5">
            <button
              type="button"
              onClick={goHome}
              className="inline-flex items-center gap-1 rounded-full py-2 text-sm text-ink-faint transition-colors hover:text-ink-soft"
            >
              <span aria-hidden="true">&larr;</span> {t('nav.back')}
            </button>
          </div>
        )}

        {view === 'home' && (
          <HomePage
            onCalm={() => go('calm')}
            onCheckIn={() => go('checkin')}
            onHistory={() => go('history')}
            onMeasure={() => go('measure')}
          />
        )}
        {view === 'calm' && <CalmSession onHome={goHome} />}
        {view === 'checkin' && (
          <CheckInPage onCalm={() => go('calm')} onDone={() => go('history')} />
        )}
        {view === 'history' && <HistoryPage />}
        {view === 'measure' && <MeasurePage onCheckIn={() => go('checkin')} onDone={goHome} />}
        {view === 'ppg-lab' && <PpgLabPage />}

        <Footer />
      </div>
    </ContainerProvider>
  )
}
