/**
 * Lasai brand mark: two overlapping soft petals forming a calm, leaf-like
 * breathing shape. Decorative — labelled by its parent where needed.
 */
export function CalmMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M16 4c6 4 9 8 9 13a9 9 0 0 1-18 0c0-5 3-9 9-13Z"
        fill="var(--color-calm)"
        opacity="0.85"
      />
      <path
        d="M16 9c3.2 2.4 5 5 5 8.2A5 5 0 0 1 16 22a5 5 0 0 1-5-4.8c0-3.2 1.8-5.8 5-8.2Z"
        fill="var(--color-calm-soft)"
      />
    </svg>
  )
}
