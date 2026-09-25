import { Link } from 'react-router-dom'
import { ArrowRight, Boxes, Package, Wrench } from 'lucide-react'
import { Card } from '@/components/ui'
import { corDa } from './ResumoPedidos'
import { SaldosConsignados } from './Saldos'
import type { CategoriaCatalogo, ResumoPedidos, SaldoLocal } from '@/lib/types'

/**
 * Controles & Tags no dashboard: quantos pedidos entraram na janela, de que modalidade,
 * quantas unidades de cada tipo e de cada modelo — e, ao lado, quem tem saldo consignado.
 * O lote não entra na soma de unidades: é estoque do condomínio, não venda.
 */
export function ResumoPedidosDashboard({ resumo, saldos, catalogo, dias }: {
  resumo: ResumoPedidos
  saldos: SaldoLocal[]
  catalogo: CategoriaCatalogo[]
  dias: number
}) {
  const porCategoria = Object.values(
    resumo.porItem.reduce<Record<string, { key: string; label: string; quantidade: number }>>((acc, i) => {
      const c = (acc[i.categoria] ??= { key: i.categoria, label: i.categoriaLabel, quantidade: 0 })
      c.quantidade += i.quantidade
      return acc
    }, {}),
  ).sort((a, b) => b.quantidade - a.quantidade)
  const modalidades = [
    { id: 'pedido', label: 'Pedidos', icon: Package },
    { id: 'manutencao', label: 'Manutenções', icon: Wrench },
    { id: 'lote', label: 'Lotes', icon: Boxes },
  ]

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-medium text-slate-200">Controles & Tags ({dias} dias)</div>
          <Link to="/pedidos" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">ver pedidos <ArrowRight size={12} /></Link>
        </div>
        <div className="mb-3 text-[11px] text-slate-500">O que foi pedido no período, pela data do pedido. Unidades de lote contam à parte (consignado).</div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5">
            <span className="text-lg font-semibold tabular-nums text-slate-100">{resumo.pedidos}</span> <span className="text-[12px] text-slate-400">pedidos</span>
          </span>
          <span className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5">
            <span className="text-lg font-semibold tabular-nums text-slate-100">{resumo.itens}</span> <span className="text-[12px] text-slate-400">unidades</span>
          </span>
          {modalidades.map(({ id, label, icon: Icon }) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[12px] text-slate-300">
              <Icon size={13} className="text-slate-500" /> <span className="font-semibold tabular-nums">{resumo.porModalidade[id] ?? 0}</span> {label}
            </span>
          ))}
          {!!resumo.consignado && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-900/60 bg-violet-500/[0.06] px-2.5 py-1.5 text-[12px] text-violet-300">
              <span className="font-semibold tabular-nums">{resumo.consignado}</span> un. consignadas
            </span>
          )}
        </div>

        {resumo.porItem.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-slate-600">Nenhum controle ou tag pedido no período.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Por tipo</div>
              <div className="space-y-1">
                {porCategoria.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-300"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corDa(catalogo, c.key) }} /><span className="truncate">{c.label}</span></span>
                    <span className="shrink-0 font-medium tabular-nums text-slate-100">{c.quantidade}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Por modelo</div>
              <div className="space-y-1">
                {resumo.porItem.slice(0, 6).map((i) => (
                  <div key={`${i.categoria}|${i.item}`} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate text-slate-300"><span className="text-slate-500">{i.categoriaLabel} · </span>{i.itemLabel}</span>
                    <span className="shrink-0 font-medium tabular-nums text-slate-100">{i.quantidade}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-1 text-sm font-medium text-slate-200">Saldo consignado</div>
        <div className="mb-3 text-[11px] text-slate-500">Quanto cada local ainda tem do lote, hoje.</div>
        <SaldosConsignados saldos={saldos} catalogo={catalogo} compacto />
      </Card>
    </div>
  )
}
