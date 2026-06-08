import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="animate-gentle-rise flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-[2rem] bg-surface p-6 shadow-[0_24px_60px_-24px_rgba(31,45,44,0.4)] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="-mx-6 -mt-6 mb-1 flex justify-end px-4 pt-3">
          <button
            type="button"
            aria-label={t('common.close')}
            className="rounded-full px-2 text-2xl leading-none text-ink-faint transition-colors hover:text-ink-soft"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
