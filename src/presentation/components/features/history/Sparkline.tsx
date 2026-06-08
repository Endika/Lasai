import type { TrendPoint } from '@/application/handlers/GetHistoryHandler'

/**
 * A small SVG line of PSS scores over time (0..40). Pure presentation — no
 * axes, no clutter; a calm trend line with soft area fill and end dots.
 */
export function Sparkline({ points, label }: { points: TrendPoint[]; label: string }) {
  const W = 280
  const H = 80
  const PAD = 8
  const MAX = 40

  if (points.length === 0) return null

  const innerW = W - PAD * 2
  const innerH = H - PAD * 2
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0

  const coords = points.map((p, i) => {
    const x = PAD + (points.length > 1 ? i * stepX : innerW / 2)
    const y = PAD + innerH * (1 - Math.min(MAX, Math.max(0, p.score)) / MAX)
    return { x, y }
  })

  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area =
    `${PAD},${H - PAD} ` +
    coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
    ` ${(PAD + (points.length > 1 ? innerW : innerW / 2)).toFixed(1)},${H - PAD}`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {points.length > 1 && <polygon points={area} fill="var(--color-calm)" opacity="0.12" />}
      {points.length > 1 ? (
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-calm)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={points.length === 1 ? 4 : 2.5}
          fill="var(--color-calm-deep)"
        />
      ))}
    </svg>
  )
}
