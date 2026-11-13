import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-2 border-ink',
  gold: 'bg-gold-500 text-white hover:bg-gold-600 border-gold-500',
  secondary: 'bg-surface text-ink hover:bg-canvas border-line-strong',
  ghost: 'bg-transparent text-ink-2 hover:bg-black/5 border-transparent',
  danger: 'bg-bad text-white hover:bg-[#962c25] border-bad',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[12.5px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
  lg: 'h-11 px-5 text-[14px] gap-2',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className, disabled, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-md border font-medium whitespace-nowrap transition-colors',
        'disabled:opacity-50 disabled:hover:bg-inherit',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}
