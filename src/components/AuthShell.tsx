import type { ReactNode } from 'react'

/** Moldura das telas sem sessão (login, setup, troca de senha): logo + cartão central. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--app-bg)] px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600">
            <img src="/logo.png" alt="Aexecutiva" className="h-9 w-9 object-contain" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-100">{title}</div>
            <div className="text-xs uppercase tracking-wider text-slate-500">{subtitle}</div>
          </div>
        </div>
        {children}
        {footer && <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">{footer}</div>}
      </div>
    </div>
  )
}
