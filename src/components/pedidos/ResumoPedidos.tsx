import type { CategoriaCatalogo, ResumoPedidos as Resumo } from '@/lib/types'

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Catálogo padrão — o mesmo do servidor, para quando o setting ainda não existe. */
export const CATALOGO_PADRAO: CategoriaCatalogo[] = [
  { key: 'controle', label: 'Controle', color: '#38bdf8', pedePortao: true, itens: [{ key: 'nice-new-evo', label: 'Nice New Evo', valor: null }] },
  { key: 'tag', label: 'Tag', color: '#34d399', itens: [{ key: 'nice', label: 'Nice', valor: null }] },
  { key: 'tag-veicular', label: 'Tag veicular', color: '#fbbf24', pedePortao: true, itens: [{ key: 'controlid', label: 'ControlID', valor: null }] },
  { key: 'manutencao', label: 'Manutenção', color: '#f472b6', tipo: 'manutencao', itens: [{ key: 'troca-de-pilha', label: 'Troca de pilha', valor: null }] },
]
export function parseCatalogo(settings: Record<string, string>): CategoriaCatalogo[] {
  try {
    const a = JSON.parse(settings['pedido_catalogo'] || '')
    if (Array.isArray(a) && a.length) return a
  } catch { /* usa o padrão */ }
  return CATALOGO_PADRAO
}
export const corDa = (cat: CategoriaCatalogo[], key: string) => cat.find((c) => c.key === key)?.color ?? '#a1a1aa'
/** Vai configurado num portão? Catálogo antigo, sem a marca: controle e tag veicular. */
export const pedePortao = (c?: CategoriaCatalogo) => !!c && c.tipo !== 'manutencao' && (c.pedePortao ?? ['controle', 'tag-veicular'].includes(c.key))

/**
 * O resumo de Controles & Tags: os números no topo, o que mais se pediu (por item) e
 * quanto cada local pediu, com valor. Igual no relatório mensal e no relatório próprio.
 */
export function ResumoPedidos({ r, catalogo }: { r: Resumo; catalogo: CategoriaCatalogo[] }) {
  const maior = Math.max(1, ...r.porItem.map((i) => i.quantidade))
  // Sem permissão para ver valores o servidor manda `null`: a coluna some.
  const comValores = r.valor !== null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
        {[
          { label: 'Pedidos', valor: String(r.pedidos) },
          { label: 'Itens', valor: String(r.itens) },
          { label: 'Entregues', valor: String(r.entregues) },
          ...(r.consignado ? [{ label: 'Consignado em lote', valor: `${r.consignado} un.`, tom: '#a78bfa' }] : []),
          ...(comValores ? [{ label: 'Valor total', valor: brl(r.valor ?? 0), tom: '#34d399' }] : []),
        ].map((n: { label: string; valor: string; tom?: string }) => (
          <div key={n.label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{n.label}</div>
            <div className="text-lg font-semibold tabular-nums text-slate-100" style={{ color: n.tom }}>{n.valor}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-[12px] font-medium text-slate-300">Por tipo de item</div>
          {r.porItem.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-slate-600">Nenhum item no período.</div>
          ) : (
            <div className="space-y-2">
              {r.porItem.map((i) => {
                const cor = corDa(catalogo, i.categoria)
                return (
                  <div key={`${i.categoria}|${i.item}`}>
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate text-slate-200">
                        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: cor }} />
                        <span className="text-slate-400">{i.categoriaLabel} · </span>{i.itemLabel}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-400">
                        <span className="font-medium text-slate-100">{i.quantidade}</span> un.{comValores && i.valor ? ` · ${brl(i.valor)}` : ''}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${(i.quantidade / maior) * 100}%`, background: cor }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[12px] font-medium text-slate-300">Por local</div>
          {r.porLocal.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-slate-600">Nenhum pedido no período.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="pb-1.5 font-medium">Local</th>
                  <th className="pb-1.5 text-right font-medium">Pedidos</th>
                  <th className="pb-1.5 text-right font-medium">Itens</th>
                  {comValores && <th className="pb-1.5 text-right font-medium">Valor</th>}
                </tr>
              </thead>
              <tbody>
                {r.porLocal.map((l) => (
                  <tr key={l.nome} className="border-t border-slate-800/60">
                    <td className="py-1 text-slate-300">{l.nome}</td>
                    <td className="py-1 text-right tabular-nums text-slate-400">{l.pedidos}</td>
                    <td className="py-1 text-right tabular-nums text-slate-400">{l.itens}</td>
                    {comValores && <td className="py-1 text-right tabular-nums text-slate-200">{l.valor ? brl(l.valor) : '—'}</td>}
                  </tr>
                ))}
                <tr className="border-t border-slate-700">
                  <td className="py-1 font-medium text-slate-200">Total</td>
                  <td className="py-1 text-right tabular-nums text-slate-300">{r.pedidos}</td>
                  <td className="py-1 text-right tabular-nums text-slate-300">{r.itens}</td>
                  {comValores && <td className="py-1 text-right font-semibold tabular-nums text-emerald-400">{brl(r.valor ?? 0)}</td>}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
