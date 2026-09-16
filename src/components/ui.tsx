import type { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  to,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
  to?: string
}) {
  const toneColor = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-100'
  const body = (
    <Card className={cn('h-full p-4', to && 'cursor-pointer transition-colors hover:border-red-700/60')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums', toneColor)}>{value}</p>
          {/* reserva a linha do hint mesmo vazia → todos os KPIs com a mesma altura */}
          <p className="mt-1 text-xs text-slate-500">{hint ?? ' '}</p>
        </div>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-800/50 text-slate-300">{icon}</div>
        )}
      </div>
    </Card>
  )
  return to ? <Link to={to} className="block h-full">{body}</Link> : body
}

export function RoleBadge({ name, color = '#a1a1aa' }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ color, background: color + '1e', border: `1px solid ${color}44` }}>
      {name}
    </span>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'subtle' | 'ghost' | 'danger'; size?: 'md' | 'sm' }) {
  const variants = {
    primary: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-900/50',
    subtle: 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700',
    ghost: 'text-slate-300 hover:bg-slate-800',
    danger: 'border border-red-900 bg-red-600/10 text-red-400 hover:bg-red-600/20',
  }
  const sizes = { md: 'px-3 py-1.5 text-sm', sm: 'px-2 py-1 text-xs' }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, onValueChange, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { onValueChange?: (v: string) => void }) {
  return (
    <select
      onChange={(e) => onValueChange?.(e.target.value)}
      className={cn('rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-red-500', className)}
      {...props}
    >
      {children}
    </select>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-red-500',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-red-500',
        className,
      )}
      {...props}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-800 px-3 py-10 text-center text-sm text-slate-500">{children}</div>
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Enter salva. Não dispara em textarea, nem com modificador, nem em botão focado. */
  onSubmit?: () => void
}) {
  if (!open) return null

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') return onClose()
    if (e.key !== 'Enter' || !onSubmit) return
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
    const alvo = e.target as HTMLElement
    const tag = alvo?.tagName?.toLowerCase()
    if (tag === 'textarea' || tag === 'button' || tag === 'select' || alvo?.isContentEditable) return
    e.preventDefault()
    onSubmit()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto p-3 sm:p-8">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
        className={cn(
          'relative z-10 my-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
      <div>
        <div className="text-sm text-slate-200">{label}</div>
        {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-red-600' : 'bg-slate-700'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
    </div>
  )
}
