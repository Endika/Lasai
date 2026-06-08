import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'soft' | 'ghost'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-calm text-white shadow-[0_8px_24px_-10px_rgba(44,140,133,0.7)] hover:bg-calm-deep hover:-translate-y-0.5 active:translate-y-0',
  soft: 'bg-surface text-ink-soft border border-calm/20 shadow-[0_4px_16px_-12px_rgba(44,140,133,0.5)] hover:border-calm/40 hover:-translate-y-0.5 active:translate-y-0',
  ghost: 'bg-transparent text-ink-soft hover:text-ink hover:bg-calm-soft/70',
}

export function Button({
  className = '',
  variant = 'primary',
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold tracking-tight transition-all duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'

  return (
    <button className={`${base} ${VARIANTS[variant]} ${className}`} disabled={disabled} {...rest}>
      {children}
    </button>
  )
}
