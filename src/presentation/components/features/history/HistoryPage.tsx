import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContainer } from '@/presentation/context/ContainerProvider'
import { Button } from '@/presentation/components/common/Button'
import { Modal } from '@/presentation/components/common/Modal'
import { Sparkline } from './Sparkline'
import type { GetHistoryHandler, HistoryResult } from '@/application/handlers/GetHistoryHandler'
import type { DeleteAllDataHandler } from '@/application/handlers/DeleteAllDataHandler'
import type { StressBand } from '@/domain/value-objects/StressBand'

const BAND_DOT: Record<StressBand, string> = {
  low: 'bg-band-low',
  moderate: 'bg-band-moderate',
  high: 'bg-band-high',
}

const READING_BAND_LABEL: Record<StressBand, string> = {
  low: 'measure.stressLow',
  moderate: 'measure.stressModerate',
  high: 'measure.stressHigh',
}

export function HistoryPage() {
  const { t, i18n } = useTranslation()
  const container = useContainer()

  const [history, setHistory] = useState<HistoryResult | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    const handler = container.resolve<GetHistoryHandler>('getHistory')
    setHistory(await handler.execute())
  }, [container])

  useEffect(() => {
    let alive = true
    const handler = container.resolve<GetHistoryHandler>('getHistory')
    handler.execute().then(
      (result) => {
        if (alive) setHistory(result)
      },
      () => {
        /* read failed — keep the loading/empty state */
      },
    )
    return () => {
      alive = false
    }
  }, [container])

  async function deleteAll() {
    const handler = container.resolve<DeleteAllDataHandler>('deleteAllData')
    await handler.execute()
    setConfirmDelete(false)
    await load()
  }

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const fmtDate = (iso: string) => dateFmt.format(new Date(iso))

  const isEmpty =
    history !== null &&
    history.checkIns.length === 0 &&
    history.sessions.length === 0 &&
    history.readings.length === 0

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('history.title')}</h1>

      {isEmpty ? (
        <div className="animate-gentle-rise flex flex-col items-center gap-2 rounded-[1.5rem] border border-calm/15 bg-surface/70 px-6 py-12 text-center">
          <p className="text-base font-medium text-ink">{t('history.emptyTitle')}</p>
          <p className="max-w-xs text-balance text-sm text-ink-faint">{t('history.emptyBody')}</p>
        </div>
      ) : (
        history && (
          <>
            <div className="flex flex-col gap-3 rounded-[1.5rem] border border-calm/15 bg-surface/70 p-5">
              <h2 className="text-sm font-medium text-ink-soft">{t('history.trendTitle')}</h2>
              {history.trend.length > 0 ? (
                <Sparkline points={history.trend} label={t('history.trendAria')} />
              ) : (
                <p className="text-sm text-ink-faint">{t('history.emptyTrend')}</p>
              )}
            </div>

            {history.checkIns.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-ink-soft">{t('history.checkInsTitle')}</h2>
                <ul className="flex flex-col gap-2">
                  {history.checkIns.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-2xl border border-calm/15 bg-surface/70 px-4 py-3"
                    >
                      <span className="text-sm text-ink-soft">{fmtDate(c.createdAt)}</span>
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${BAND_DOT[c.band]}`}
                          aria-hidden="true"
                        />
                        {t('history.score', { score: c.score })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {history.readings.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-ink-soft">{t('history.readingsTitle')}</h2>
                <ul className="flex flex-col gap-2">
                  {history.readings.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-2xl border border-calm/15 bg-surface/70 px-4 py-3"
                    >
                      <span className="text-sm text-ink-soft">{fmtDate(r.createdAt)}</span>
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        {r.stressBand && (
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${BAND_DOT[r.stressBand]}`}
                            aria-hidden="true"
                          />
                        )}
                        {r.stressBand
                          ? t('history.readingLineBand', {
                              bpm: r.bpm,
                              band: t(READING_BAND_LABEL[r.stressBand]),
                            })
                          : t('history.readingLine', { bpm: r.bpm })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {history.sessions.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-ink-soft">{t('history.sessionsTitle')}</h2>
                <ul className="flex flex-col gap-2">
                  {history.sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-2xl border border-calm/15 bg-surface/70 px-4 py-3"
                    >
                      <span className="text-sm text-ink-soft">{fmtDate(s.createdAt)}</span>
                      <span className="text-sm text-ink-faint">
                        {t('history.sessionLine', {
                          pattern: t(
                            s.pattern === 'box' ? 'calm.patternBox' : 'calm.patternFourSevenEight',
                          ),
                          minutes: Math.max(1, Math.round(s.durationSec / 60)),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      )}

      <div className="mt-2 flex flex-col items-center gap-4 border-t border-calm/15 pt-6">
        <p className="max-w-xs text-balance text-center text-xs leading-relaxed text-ink-faint">
          {t('privacy.note')}
        </p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-sm font-medium text-band-high underline-offset-2 transition-colors hover:underline"
        >
          {t('history.deleteAll')}
        </button>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} labelledBy="delete-title">
        <div className="flex flex-col gap-4 pb-2">
          <h2 id="delete-title" className="text-lg font-semibold text-ink">
            {t('history.deleteConfirmTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">{t('history.deleteConfirmBody')}</p>
          <div className="flex flex-col gap-2">
            <Button variant="soft" onClick={() => void deleteAll()}>
              {t('history.deleteConfirm')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('history.deleteCancel')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
