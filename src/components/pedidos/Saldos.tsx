import { Boxes } from 'lucide-react'
import { corDa } from './ResumoPedidos'
import type { CategoriaCatalogo, SaldoLocal } from '@/lib/types'

/**
 * SALDO CONSIGNADO por local: o que o condomínio recebeu em lote, quanto os pedidos dos
 * moradores já usaram e quanto resta. É o estado de agora — não depende de período.
 * Saldo negativo é legítimo: o local usa lote e os pedidos passaram do que foi consignado
 * (ou ainda nem chegou lote). Aparece em vermelho — é o aviso de que precisa de outro lote.
 */
export function SaldosConsignados({ saldos, catalogo, compacto = false, onLocal }: {
  saldos: SaldoLocal[]
  catalogo: CategoriaCatalogo[]
  /** Uma linha por local, sem o detalhe dos itens — para o dashboard. */
  compacto?: boolean
  onLocal?: (localId: string) => void
}) {
  if (!saldos.length) return <div className="py-4 text-center text-[12px] text-slate-600">Nenhum local com lote consignado.</div>
  return (
    <div className={compacto ? 'space-y-1.5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'}>
      {saldos.map((s) => {
        const Tag = onLocal ? 'button' : 'div'
        return (
          <Tag
            key={s.localId}
            {...(onLocal ? { type: 'button' as const, onClick: () => onLocal(s.localId) } : {})}
            className={`block w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-left ${onLocal ? 'hover:border-violet-700/60' : ''}`}
          >
            <div className="flex items-center gap-2">
              <Boxes size={13} className="shrink-0 text-violet-400" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-100">{s.localName}</span>
              <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${s.saldo < 0 ? 'text-red-400' : s.saldo === 0 ? 'text-slate-500' : 'text-violet-300'}`}>
                {s.saldo} <span className="text-[10px] font-normal text-slate-500">de {s.consignado}</span>
              </span>
            </div>
            {!compacto && (
              <div className="mt-1.5 space-y-1">
                {s.itens.map((i) => {
                  const cor = corDa(catalogo, i.categoria)
                  const pct = i.consignado ? Math.max(0, Math.min(100, (i.saldo / i.consignado) * 100)) : 0
                  return (
                    <div key={`${i.categoria}|${i.item}`}>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate text-slate-300"><span className="text-slate-500">{i.categoriaLabel} · </span>{i.itemLabel}</span>
                        <span className={`shrink-0 tabular-nums ${i.saldo < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          resta <span className="font-medium text-slate-100">{i.saldo}</span> · usou {i.usado}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Tag>
        )
      })}
    </div>
  )
}
