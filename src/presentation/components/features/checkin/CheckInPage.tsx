import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContainer } from '@/presentation/context/ContainerProvider'
import { Button } from '@/presentation/components/common/Button'
import { CheckInResult } from './CheckInResult'
import { PSS_ITEM_COUNT } from '@/domain/value-objects/PssScore'
import type { SubmitCheckInHandler } from '@/application/handlers/SubmitCheckInHandler'
import type { CheckIn } from '@/domain/entities/CheckIn'

const OPTION_VALUES = [0, 1, 2, 3, 4] as const
const ITEM_KEYS = Array.from(
  { length: PSS_ITEM_COUNT },
  (_, i) => `checkIn.items.q${i + 1}` as const,
)

export function CheckInPage({ onCalm, onDone }: { onCalm: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const container = useContainer()

  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    new Array(PSS_ITEM_COUNT).fill(null),
  )
  const [journal, setJournal] = useState('')
  const [showIncomplete, setShowIncomplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CheckIn | null>(null)

  if (result) {
    return <CheckInResult checkIn={result} onCalm={onCalm} onDone={onDone} />
  }

  const complete = answers.every((a) => a !== null)

  async function submit() {
    if (!complete) {
      setShowIncomplete(true)
      return
    }
    setSubmitting(true)
    try {
      const handler = container.resolve<SubmitCheckInHandler>('submitCheckIn')
      const checkIn = await handler.execute({
        answers: answers as number[],
        journalText: journal.trim() || undefined,
      })
      setResult(checkIn)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('checkIn.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t('checkIn.intro')}</p>
      </div>

      <ol className="flex flex-col gap-5">
        {ITEM_KEYS.map((key, i) => (
          <li
            key={key}
            className="flex flex-col gap-3 rounded-[1.5rem] border border-calm/15 bg-surface/70 p-4"
          >
            <p className="text-sm font-medium leading-relaxed text-ink">{t(key)}</p>
            <fieldset>
              <legend className="sr-only">
                {t('checkIn.of', { current: i + 1, total: PSS_ITEM_COUNT })}
              </legend>
              <div className="flex flex-wrap gap-2">
                {OPTION_VALUES.map((v) => {
                  const active = answers[i] === v
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setAnswers((prev) => {
                          const next = [...prev]
                          next[i] = v
                          return next
                        })
                        setShowIncomplete(false)
                      }}
                      className={`flex-1 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-all ${
                        active
                          ? 'border-calm bg-calm text-white'
                          : 'border-calm/20 bg-surface text-ink-soft hover:border-calm/40'
                      }`}
                    >
                      {t(`checkIn.options.${v}`)}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-soft">{t('checkIn.journalLabel')}</span>
        <textarea
          value={journal}
          maxLength={1000}
          onChange={(e) => setJournal(e.target.value)}
          placeholder={t('checkIn.journalPlaceholder')}
          rows={3}
          className="w-full resize-y rounded-2xl border border-calm/20 bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-calm focus:outline-none"
        />
      </label>

      {showIncomplete && (
        <p role="alert" className="text-sm text-band-high">
          {t('checkIn.incomplete')}
        </p>
      )}

      <Button className="self-center" onClick={() => void submit()} disabled={submitting}>
        {t('checkIn.submit')}
      </Button>
    </section>
  )
}
