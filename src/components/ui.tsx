import type { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useState } from 'react'
import { MoreVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return <div onClick={onClick} className={cn('rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm', className)}>{children}</div>
}

/** Uma ação secundária do cabeçalho: no desktop é botão, no celular é linha de menu. */
export interface AcaoCabecalho {
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}

/**
 * Cabeçalho da página. `actions` é a ação principal — a única que sobrevive na largura do
 * celular. O resto vai em `menu`: no desktop vira fileira de botões, no celular se recolhe
 * atrás dos três pontinhos, para o topo não virar uma parede de botões.
 */
export function PageHeader({ title, subtitle, actions, menu }: {
  title: string
  subtitle?: string
  actions?: ReactNode
  menu?: (AcaoCabecalho | false | undefined | null)[]
}) {
  const itens = (menu ?? []).filter(Boolean) as AcaoCabecalho[]
  const [aberto, setAberto] = useState(false)

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {/* `ml-auto`: quando o título é comprido, esta caixa quebra para a linha de baixo —
          e sozinha numa linha o `justify-between` do pai a jogaria para a ESQUERDA, com
          os três pontinhos na beirada errada e o menu abrindo para fora da tela. */}
      {(actions || itens.length > 0) && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {itens.length > 0 && (
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              {itens.map((a) => (
                <Button key={a.label} variant="subtle" onClick={a.onClick} disabled={a.disabled} title={a.title}>
                  {a.icon} {a.label}
                </Button>
              ))}
            </div>
          )}
          {actions}
          {/* No celular os três pontinhos ficam na ponta direita: o menu abre ancorado
              nela, para dentro da tela. */}
          {itens.length > 0 && (
              <div className="relative sm:hidden">
                <button
                  onClick={() => setAberto((v) => !v)}
                  aria-label="Mais ações"
                  aria-expanded={aberto}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <MoreVertical size={17} />
                </button>
                {aberto && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} />
                    <div className="absolute right-0 left-auto z-30 mt-1 w-[min(16rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
                      {itens.map((a) => (
                        <button
                          key={a.label}
                          onClick={() => { setAberto(false); a.onClick() }}
                          disabled={a.disabled}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                        >
                          {a.icon} {a.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
          )}
        </div>
      )}
    </div>
  )
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

/**
 * Igual ao `Field`, mas em `div`: para quando o conteúdo tem controles próprios com
 * rótulo (o seletor de local com cadastro embutido, por exemplo). `<label>` dentro de
 * `<label>` é inválido e o clique vai parar no controle errado.
 */
export function FieldBox({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-800 px-3 py-10 text-center text-sm text-slate-500">{children}</div>
}

export function Modal({
  open,
  onClose,
  title,
  tituloTexto,
  children,
  footer,
  wide,
  onSubmit,
  fechar,
  telaCheia,
}: {
  open: boolean
  onClose: () => void
  /** Aceita um bloco (código em cima, título embaixo) além de texto simples. */
  title: ReactNode
  /** Rótulo acessível quando `title` não é texto. */
  tituloTexto?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Enter salva. Não dispara em textarea, nem com modificador, nem em botão focado. */
  onSubmit?: () => void
  /**
   * Rótulo do botão de fechar no rodapé. Fechar é um botão escrito, não um "x" de 12
   * pixels no canto. Por padrão só aparece em quem não tem rodapé próprio — quem já tem
   * "Cancelar" não precisa do mesmo botão duas vezes; passe o rótulo para forçá-lo.
   */
  fechar?: string | null
  /**
   * No celular ocupa a tela inteira (como o menu da conta) em vez de uma folha de 92%.
   * Formulário longo com teclado aberto não cabe em folha.
   */
  telaCheia?: boolean
}) {
  if (!open) return null
  const rotuloFechar = fechar === undefined ? (footer ? null : 'Fechar') : fechar

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
    <div className={cn('fixed inset-0 z-50 flex justify-center overflow-auto sm:items-center sm:p-8', telaCheia ? 'items-stretch' : 'items-end')}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tituloTexto ?? (typeof title === 'string' ? title : 'Janela')}
        onKeyDown={onKeyDown}
        className={cn(
          // No celular é uma folha que sobe do rodapé: o conteúdo rola, o rodapé com as
          // ações fica parado onde o polegar alcança. `telaCheia` usa a altura toda —
          // e com `100dvh` a janela encolhe junto com o teclado, em vez de ficar atrás dele.
          'relative z-10 flex w-full flex-col overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl',
          telaCheia ? 'h-[100dvh] max-h-[100dvh] rounded-none' : 'max-h-[92vh] rounded-t-2xl',
          'sm:my-auto sm:max-h-[90vh] sm:rounded-xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="shrink-0 border-b border-slate-800 px-5 py-3.5" style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}>
          {typeof title === 'string' ? <h2 className="min-w-0 truncate text-sm font-semibold text-slate-100">{title}</h2> : title}
        </div>
        <div className="flex-1 overflow-auto px-4 py-4 sm:px-5">{children}</div>
        {(footer || rotuloFechar) && (
          <div
            className={cn(
              'shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-3 sm:px-5',
              // Mobile: botões grandes em duas colunas, todos do mesmo tamanho. Só quando
              // sobra um ímpar é que o último ocupa a linha inteira — nunca um maior que o
              // outro lado a lado. Desktop: a fileira de sempre, alinhada à direita.
              'grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 [&>button]:w-full [&>button]:py-2.5',
              'sm:flex sm:flex-wrap sm:justify-end sm:[&>*:last-child:nth-child(odd)]:col-span-1 sm:[&>button]:w-auto sm:[&>button]:py-1.5',
            )}
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {rotuloFechar && <Button variant="subtle" onClick={onClose}>{rotuloFechar}</Button>}
            {footer}
          </div>
        )}
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
