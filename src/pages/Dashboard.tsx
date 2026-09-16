import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area, Legend } from 'recharts'
import { Ticket, Hourglass, Wrench, UserCheck, CheckCircle2, ArrowRight, Loader2, HandHelping } from 'lucide-react'
import { Card, PageHeader, StatCard } from '@/components/ui'
import { useStore, useCan } from '@/lib/store'
import { api } from '@/lib/api'
import { esperaDesde, parseStatuses } from '@/lib/tickets'
import { tempoAtras } from '@/lib/utils'
import { tipoRegistroDe } from '@/lib/registros'
import { SERIE, axisTick, gridStroke, tooltipItem, tooltipLabel, tooltipStyle } from '@/lib/chart'
import type { Overview } from '@/lib/types'

export default function Dashboard() {
  const navigate = useNavigate()
  const me = useStore((s) => s.me)
  const tickets = useStore((s) => s.tickets)
  const settings = useStore((s) => s.settings)
  const canTickets = useCan('ver_chamados')
  const canCreate = useCan('criar_chamados')
  const canAccept = useCan('aceitar_chamados')
  const canRegistros = useCan('ver_registros')
  const [ov, setOv] = useState<Overview | null>(null)
  const [erro, setErro] = useState(false)

  // Os números vêm do servidor (incluem o histórico dos últimos dias, que não está
  // na lista de ativos). Recarrega junto com o ciclo de chamados do Layout.
  useEffect(() => {
    let vivo = true
    api.overview().then((r) => { if (vivo) { setOv(r); setErro(false) } }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [tickets])

  const statuses = parseStatuses(settings)
  const statusLabel = (key: string) => statuses.find((s) => s.key === key)?.label ?? key
  const recentes = [...tickets].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6)
  const primeiroNome = me?.name.split(' ')[0] ?? ''

  if (!ov) {
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
        subtitle="Visão geral dos chamados"
        actions={(canCreate || canAccept) && <Link to="/chamados" className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"><Ticket size={15} /> Ir para chamados</Link>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Em aberto" value={ov.emAberto} hint={`${ov.ativos} ativos no quadro`} icon={<Ticket size={18} />} to={canTickets ? '/chamados' : undefined} />
        <StatCard label="Na fila" value={ov.naFila} tone={ov.naFila ? 'warn' : 'default'} hint="esperando um técnico pegar" icon={<Hourglass size={18} />} to={canTickets ? '/chamados' : undefined} />
        <StatCard label="Em atendimento" value={ov.emAtendimento} hint="já com técnico" icon={<Wrench size={18} />} to={canTickets ? '/chamados' : undefined} />
        <StatCard label="Comigo" value={ov.meus} hint="que eu peguei" icon={<UserCheck size={18} />} to={canTickets ? '/chamados' : undefined} />
        <StatCard label="Concluídos" value={ov.concluidos7d} tone="good" hint="últimos 7 dias" icon={<CheckCircle2 size={18} />} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-1 text-sm font-medium text-slate-200">Abertos × concluídos (14 dias)</div>
          <div className="mb-3 text-[11px] text-slate-500">Quantos chamados entraram e quantos foram concluídos por dia.</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={ov.serie14d} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
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

        <Card className="p-4">
          <div className="mb-2 text-sm font-medium text-slate-200">Quadro por coluna</div>
          <ResponsiveContainer width="100%" height={Math.max(160, ov.porStatus.length * 40)}>
            <BarChart data={ov.porStatus} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={110} tick={axisTick} axisLine={false} tickLine={false} interval={0} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} cursor={{ fill: 'transparent' }} formatter={(v) => [v, 'Chamados']} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={16}>
                {ov.porStatus.map((s) => (<Cell key={s.key} fill={statuses.find((x) => x.key === s.key)?.done ? SERIE.concluidos.color : '#ef4444'} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-200">Fila — esperando técnico</div>
            {canTickets && <Link to="/chamados" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">ver chamados <ArrowRight size={12} /></Link>}
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
                const meta = tipoRegistroDe(r.tipo)
                return (
                  <Link key={r.id} to="/registros" className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 hover:border-red-700/50 hover:bg-slate-900/60">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-200">{r.descricao}</div>
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
            {canTickets && <Link to="/chamados" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">ver chamados <ArrowRight size={12} /></Link>}
          </div>
          <div className="space-y-1">
            {recentes.map((t) => (
              <button key={t.id} onClick={() => navigate(`/chamados?t=${t.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-left hover:border-red-700/50 hover:bg-slate-900/60">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-200"><span className="font-mono text-[11px] text-slate-500">{t.code}</span> {t.title}</div>
                  <div className="truncate text-[11px] text-slate-500">{tempoAtras(t.updatedAt)}{t.assigneeName ? ` · ${t.assigneeName}` : ' · na fila'}{t.localName ? ` · ${t.localName}` : ''}</div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{statusLabel(t.status)}</span>
              </button>
            ))}
            {recentes.length === 0 && <div className="px-1 py-8 text-center text-sm text-slate-500">Nenhum chamado ainda.</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
