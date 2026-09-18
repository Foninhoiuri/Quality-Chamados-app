import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area, Legend, PieChart, Pie } from 'recharts'
import { Ticket, ArrowRight, Loader2, HandHelping, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui'
import { useStore, useCan } from '@/lib/store'
import { api } from '@/lib/api'
import { esperaDesde, parseStatuses } from '@/lib/tickets'
import { cn, fmtMinutos, tempoAtras } from '@/lib/utils'
import { parseTiposRegistro, tipoRegistroDe } from '@/lib/registros'
import { CORES_ANDAMENTO, SERIE, axisTick, gridStroke, tooltipItem, tooltipLabel, tooltipStyle } from '@/lib/chart'
import type { Overview } from '@/lib/types'

/**
 * Métrica com comparação: o número do período e quanto ele mudou em relação ao período
 * anterior do mesmo tamanho. Um número sozinho não diz se a semana foi boa.
 *
 * `sentido` diz o que significa subir: 'bom' pinta de verde (concluídos), 'ruim' de
 * vermelho (tempo médio), 'neutro' fica cinza (volume de entrada não é mérito nem culpa).
 */
function Metrica({ label, valor, atual, anterior, sentido = 'neutro', sufixo, hint, to }: {
  label: string
  valor: string | number
  atual: number | null
  anterior: number | null
  sentido?: 'bom' | 'ruim' | 'neutro'
  sufixo?: string
  hint?: string
  to?: string
}) {
  const temBase = atual != null && anterior != null && anterior !== 0
  const variacao = temBase ? Math.round(((atual! - anterior!) / Math.abs(anterior!)) * 100) : null
  const subiu = (variacao ?? 0) > 0
  const parado = variacao === 0 || variacao == null
  const cor = parado || sentido === 'neutro'
    ? 'text-slate-400 bg-slate-800'
    : (subiu && sentido === 'bom') || (!subiu && sentido === 'ruim')
      ? 'text-emerald-300 bg-emerald-500/10'
      : 'text-red-300 bg-red-500/10'

  const corpo = (
    <Card className={cn('h-full p-4', to && 'transition-colors hover:border-red-700/60')}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-100">{valor}</span>
        {sufixo && <span className="text-sm text-slate-500">{sufixo}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {variacao == null ? (
          <span className="text-[11px] text-slate-600">{anterior === 0 && atual ? 'nada no período anterior' : 'sem base de comparação'}</span>
        ) : (
          <>
            <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums', cor)}>
              {parado ? <Minus size={11} /> : subiu ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(variacao)}%
            </span>
            <span className="truncate text-[11px] text-slate-500">{hint ?? 'vs. período anterior'}</span>
          </>
        )}
      </div>
    </Card>
  )
  return to ? <Link to={to} className="block h-full">{corpo}</Link> : corpo
}

/** Estado de agora, em uma linha: é situação, não desempenho — não merece cartão grande. */
function Agora({ itens }: { itens: { label: string; valor: number; to?: string; alerta?: boolean }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {itens.map((i) => {
        const conteudo = (
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]',
            i.alerta ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-slate-800 bg-slate-900/60 text-slate-300',
            i.to && 'hover:border-slate-600',
          )}>
            <span className="font-semibold tabular-nums">{i.valor}</span> {i.label}
          </span>
        )
        return i.to ? <Link key={i.label} to={i.to}>{conteudo}</Link> : <span key={i.label}>{conteudo}</span>
      })}
    </div>
  )
}

/** Cor de cada situação: fila em vermelho, atendimento em azul, concluído em verde. */
function corDaFase(fase: string, i: number) {
  if (fase === 'aberto') return SERIE.abertos.color
  if (fase === 'concluido') return SERIE.concluidos.color
  return CORES_ANDAMENTO[i % CORES_ANDAMENTO.length]
}

/** Anel com o total no meio — ocupa menos altura que a barra deitada e cabe no celular. */
function Rosca({ fatias }: { fatias: Overview['porStatus'] }) {
  const dados = fatias.filter((f) => f.total > 0)
  const total = dados.reduce((s, f) => s + f.total, 0)
  if (total === 0) return <div className="py-10 text-center text-[12px] text-slate-600">Nenhum chamado no período.</div>
  let andamento = 0
  const cores = dados.map((f) => {
    const cor = corDaFase(f.fase, andamento)
    if (f.fase === 'andamento') andamento++
    return cor
  })
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="total" nameKey="label" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none">
              {dados.map((f, i) => (<Cell key={f.key} fill={cores[i]} />))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} formatter={(v: any, n: any) => [v, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-slate-100">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">chamados</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {dados.map((f, i) => (
          <li key={f.key} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cores[i] }} />
              <span className="truncate">{f.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-400">
              {f.total} <span className="text-slate-600">· {Math.round((f.total / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const me = useStore((s) => s.me)
  const tickets = useStore((s) => s.tickets)
  const settings = useStore((s) => s.settings)
  const tiposRegistro = useMemo(() => parseTiposRegistro(settings), [settings])
  const canTickets = useCan('ver_chamados')
  const canCreate = useCan('criar_chamados')
  const canAccept = useCan('aceitar_chamados')
  const canRegistros = useCan('ver_registros')
  const [ov, setOv] = useState<Overview | null>(null)
  const [erro, setErro] = useState(false)
  // A semana é o padrão: é o que a operação enxerga. 15 e 30 ficam a um clique.
  const [janela, setJanela] = useState(() => {
    try { return Number(localStorage.getItem('chamados-janela')) || 7 } catch { return 7 }
  })

  // Os números vêm do servidor (incluem o histórico dos últimos dias, que não está
  // na lista de ativos). Recarrega junto com o ciclo de chamados do Layout.
  useEffect(() => {
    let vivo = true
    api.overview(janela).then((r) => { if (vivo) { setOv(r); setErro(false) } }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [tickets, janela])

  function trocarJanela(d: number) {
    setJanela(d)
    try { localStorage.setItem('chamados-janela', String(d)) } catch { /* sem storage */ }
  }

  const statuses = parseStatuses(settings)
  const statusLabel = (key: string) => statuses.find((s) => s.key === key)?.label ?? key
  /** A etiqueta usa a cor da fase: fila em vermelho, atendimento em azul, concluído em verde. */
  const statusFase = (key: string) => statuses.find((s) => s.key === key)?.fase ?? 'andamento'
  const corDoBadge = (key: string) => {
    const f = statusFase(key)
    if (f === 'aberto') return 'bg-red-500/10 text-red-300'
    if (f === 'concluido') return 'bg-emerald-500/10 text-emerald-300'
    return 'bg-sky-500/10 text-sky-300'
  }
  const recentes = [...tickets].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6)
  const primeiroNome = me?.name.split(' ')[0] ?? ''
  const c = ov?.comparativo

  if (!ov || !c) {
    return (
      <div>
        <PageHeader title={`Olá, ${primeiroNome}`} subtitle="Visão geral dos chamados" />
        <div className="flex justify-center py-16">
          {erro ? <span className="text-sm text-slate-500">Não foi possível carregar o dashboard.</span> : <Loader2 size={20} className="animate-spin text-slate-600" />}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={`Olá, ${primeiroNome}`}
        subtitle={`Os últimos ${janela} dias, comparados com os ${janela} anteriores`}
        actions={
          <>
            <div className="flex gap-0.5 rounded-lg border border-slate-800 bg-slate-900/50 p-0.5" role="radiogroup" aria-label="Período">
              {[7, 15, 30].map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={janela === d}
                  onClick={() => trocarJanela(d)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${janela === d ? 'bg-red-500/15 text-red-300' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {d} dias
                </button>
              ))}
            </div>
            {(canCreate || canAccept) && <Link to="/abertos" className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"><Ticket size={15} /> Ir para chamados</Link>}
          </>
        }
      />

      {/* O período comparado consigo mesmo: entrada, entrega, tempo e esforço. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Metrica
          label={`Total aberto · ${ov.janelaDias}d`}
          valor={c.abertos.atual}
          atual={c.abertos.atual}
          anterior={c.abertos.anterior}
          hint={`vs. ${c.abertos.anterior} nos ${ov.janelaDias} dias antes`}
          to={canTickets ? '/abertos' : undefined}
        />
        <Metrica
          label={`Total concluído · ${ov.janelaDias}d`}
          valor={c.concluidos.atual}
          atual={c.concluidos.atual}
          anterior={c.concluidos.anterior}
          sentido="bom"
          hint={`vs. ${c.concluidos.anterior} nos ${ov.janelaDias} dias antes`}
          to={canTickets ? '/concluidos' : undefined}
        />
        <Metrica
          label="Tempo médio"
          valor={c.tempoMedio.atual ?? '—'}
          sufixo={c.tempoMedio.atual == null ? undefined : 'h'}
          atual={c.tempoMedio.atual}
          anterior={c.tempoMedio.anterior}
          sentido="ruim"
          hint="da abertura até concluir"
        />
        <Metrica
          label="Horas trabalhadas"
          valor={fmtMinutos(c.minutosTrabalhados.atual)}
          atual={c.minutosTrabalhados.atual}
          anterior={c.minutosTrabalhados.anterior}
          hint={`vs. ${fmtMinutos(c.minutosTrabalhados.anterior)} antes`}
        />
      </div>

      <Agora
        itens={[
          { label: 'na fila', valor: ov.naFila, to: canTickets ? '/abertos' : undefined, alerta: ov.naFila > 0 },
          { label: 'em atendimento', valor: ov.emAtendimento, to: canTickets ? '/andamento' : undefined },
          { label: 'comigo', valor: ov.meus, to: canTickets ? '/andamento' : undefined },
          { label: 'no quadro', valor: ov.ativos },
        ]}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-1 text-sm font-medium text-slate-200">Abertos × concluídos ({ov.janelaDias} dias)</div>
          <div className="mb-3 text-[11px] text-slate-500">Quantos chamados entraram e quantos foram concluídos por dia.</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={ov.serie} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="gAb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIE.abertos.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIE.abertos.color} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIE.concluidos.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIE.concluidos.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="dia" tick={axisTick} axisLine={{ stroke: gridStroke }} tickLine={false} interval={1} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" name={SERIE.abertos.label} dataKey="abertos" stroke={SERIE.abertos.color} strokeWidth={2} fill="url(#gAb)" />
              <Area type="monotone" name={SERIE.concluidos.label} dataKey="concluidos" stroke={SERIE.concluidos.color} strokeWidth={2} fill="url(#gCo)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Onde estão os chamados do período: a soma do anel é o total da janela. */}
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium text-slate-200">Onde estão os chamados</div>
          <div className="mb-2 text-[11px] text-slate-500">Dos últimos {ov.janelaDias} dias, por situação.</div>
          <Rosca fatias={ov.porStatus} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-200">Fila — esperando técnico</div>
            {canTickets && <Link to="/abertos" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">ver chamados <ArrowRight size={12} /></Link>}
          </div>
          <div className="space-y-1">
            {ov.fila.map((t) => (
              <button key={t.id} onClick={() => navigate(`/chamados?t=${t.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-left hover:border-red-700/50 hover:bg-slate-900/60">
                <HandHelping size={14} className="shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200"><span className="font-mono text-[11px] text-slate-500">{t.code}</span> {t.title}</div>
                  <div className="truncate text-[11px] text-slate-500">{t.localName ?? 'sem local'}{t.solicitante ? ` · ${t.solicitante}` : ''}</div>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400" title="Tempo na fila">há {esperaDesde(t.createdAt)}</span>
              </button>
            ))}
            {ov.fila.length === 0 && <div className="px-1 py-8 text-center text-sm text-slate-500">Nenhum chamado esperando técnico.</div>}
          </div>
        </Card>

        {canRegistros ? (
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-200">Últimos registros</div>
              <Link to="/registros" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">ver linha do tempo <ArrowRight size={12} /></Link>
            </div>
            <div className="space-y-1">
              {ov.ultimosRegistros.map((r) => {
                const meta = tipoRegistroDe(tiposRegistro, r.tipo)
                return (
                  <Link key={r.id} to="/registros" className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 hover:border-red-700/50 hover:bg-slate-900/60">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-200">{r.titulo || r.descricao}</div>
                      <div className="truncate text-[11px] text-slate-500">{meta.label}{r.solicitante ? ` · ${r.solicitante}` : ''}{r.localName ? ` · ${r.localName}` : ''}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-500">{tempoAtras(r.ocorridoEm)}</span>
                  </Link>
                )
              })}
              {ov.ultimosRegistros.length === 0 && <div className="px-1 py-8 text-center text-sm text-slate-500">Nenhum registro ainda.</div>}
            </div>
          </Card>
        ) : null}

        <Card className={canRegistros ? 'p-4 lg:col-span-2' : 'p-4'}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-200">Movimentação recente</div>
            {canTickets && <Link to="/abertos" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">ver chamados <ArrowRight size={12} /></Link>}
          </div>
          <div className="space-y-1">
            {recentes.map((t) => (
              <button key={t.id} onClick={() => navigate(`/chamados?t=${t.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-left hover:border-red-700/50 hover:bg-slate-900/60">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200"><span className="font-mono text-[11px] text-slate-500">{t.code}</span> {t.title}</div>
                  <div className="truncate text-[11px] text-slate-500">{tempoAtras(t.updatedAt)}{t.assigneeName ? ` · ${t.assigneeName}` : ' · na fila'}{t.localName ? ` · ${t.localName}` : ''}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${corDoBadge(t.status)}`}>{statusLabel(t.status)}</span>
              </button>
            ))}
            {recentes.length === 0 && <div className="px-1 py-8 text-center text-sm text-slate-500">Nenhum chamado ainda.</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
