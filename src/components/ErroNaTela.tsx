import { Component, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'

/**
 * Rede de segurança de render: um erro numa tela não derruba o painel inteiro —
 * a falha aparece no lugar do conteúdo, com botão para tentar de novo.
 */
export class ErroNaTela extends Component<{ children: ReactNode; onde?: string }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error, info: unknown) {
    console.error('[erro de render]', this.props.onde ?? '', erro, info)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="m-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2.5">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-200">Esta parte da tela falhou{this.props.onde ? ` (${this.props.onde})` : ''}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-amber-200/80">O resto do painel continua funcionando.</p>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950/60 p-2 text-[10px] text-slate-400">{this.state.erro.message}</pre>
            <div className="mt-2 flex gap-2">
              <button onClick={() => this.setState({ erro: null })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800">
                <RefreshCw size={12} /> Tentar de novo
              </button>
              <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800">
                Recarregar a página
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
