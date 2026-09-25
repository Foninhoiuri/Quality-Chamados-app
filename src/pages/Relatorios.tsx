import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { FileText, Loader2, Download, ChevronDown } from 'lucide-react'
import { Card, PageHeader, Select, EmptyState } from '@/components/ui'
import { useStore } from '@/lib/store'
import { useMobile } from '@/lib/useMediaQuery'
import { api } from '@/lib/api'
import { fmtDataHora, fmtMinutos } from '@/lib/utils'
import { CORES_FASE } from '@/lib/tickets'
import { parseTiposRegistro, tipoRegistroDe } from '@/lib/registros'
import { parseTiposLocal, siglaDoTipo, tipoLocalDe } from '@/lib/locais'
import { baixarCsv } from '@/lib/relatorioCsv'
import { parseCatalogo, ResumoPedidos } from '@/components/pedidos/ResumoPedidos'
import { SERIE, axisTick, gridStroke, tooltipItem, tooltipLabel, tooltipStyle } from '@/lib/chart'
import type { MonthlyReport, TipoRegistroDef } from '@/lib/types'

/** Últimos 12 meses como 'YYYY-MM' + rótulo legível. */
function ultimosMeses(n = 12) {
  const hoje = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
  })
}

/**
 * No celular o relatório inteiro aberto é uma rolagem sem fim: cada bloco vira um
 * acordeão fechado e a pessoa abre o que quer ver. No desktop continua tudo à mostra.
 */
function Secao({ titulo, hint, children, aberta }: { titulo: string; hint?: string; children: React.ReactNode; aberta?: boolean }) {
  const mobile = useMobile()
  if (!mobile) {
    return (
      <Card className="p-4">
        <div className="mb-1 text-sm font-medium text-slate-200">{titulo}</div>
        {hint && <div className="mb-3 text-[11px] text-slate-500">{hint}</div>}
        {!hint && <div className="mb-3" />}
        {children}
      </Card>
    )
  }
  return (
    <details open={aberta} className="group rounded-xl border border-slate-800 bg-slate-900/50">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-medium text-slate-200">{titulo}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">
        {hint && <div className="mb-3 text-[11px] text-slate-500">{hint}</div>}
        {children}
      </div>
    </details>
  )
}

function Numero({ label, valor, sufixo, tom, hint }: { label: string; valor: string | number | null; sufixo?: string; tom?: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: tom }}>
        {valor ?? '—'}
        {valor != null && sufixo && <span className="ml-0.5 text-sm font-normal text-slate-500">{sufixo}</span>}
      </div>
      <div className="mt-1 text-xs text-slate-500">{hint ?? ' '}</div>
    </Card>
  )
}

export default function Relatorios() {
  const locais = useStore((s) => s.locais)
  const settings = useStore((s) => s.settings)
  const showToast = useStore((s) => s.showToast)
  const tiposRegistro = useMemo(() => parseTiposRegistro(settings), [settings])
  const tiposLocal = useMemo(() => parseTiposLocal(settings), [settings])
  const catalogo = useMemo(() => parseCatalogo(settings), [settings])
  const meses = ultimosMeses()
  const [localId, setLocalId] = useState('')
  const [mes, setMes] = useState(meses[0].key)
  const [dados, setDados] = useState<MonthlyReport | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [maisNumeros, setMaisNumeros] = useState(false)
  /** Tipo de local escolhido na seção de tipos: filtra a lista de chamados. null = todos. */
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null)
  useEffect(() => { setTipoFiltro(null) }, [localId, mes])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    api.monthlyReport(mes, localId || undefined)
      .then((r) => { if (vivo) setDados(r) })
      .catch((e) => { if (vivo) { setDados(null); setErro(e?.message ?? 'Não foi possível carregar o relatório.') } })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [localId, mes])

  const r = dados?.resumo
  const listaFiltrada = (dados?.lista ?? []).filter((t) => tipoFiltro === null || (t.tipoLocal ?? '') === tipoFiltro)
  /** A sigla do tipo (COND, OBRA…) ao lado do local — é assim que se vê de que tipo é cada chamado. */
  const siglaDe = (k?: string) => { const t = tipoLocalDe(tiposLocal, k); return t ? <span className="mr-1 rounded px-1 font-mono text-[10px] font-semibold" style={{ color: t.color, background: `${t.color}1e` }}>{siglaDoTipo(t)}</span> : null }
  const nomeMes = meses.find((m) => m.key === mes)?.label ?? mes

  return (
    <div>
      <PageHeader
        title="Relatório mensal"
        subtitle={`Chamados de ${nomeMes}${dados?.local ? ` · ${dados.local.name}` : ' · todos os locais'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={localId} onValueChange={setLocalId} aria-label="Local">
              <option value="">Todos os locais</option>
              {locais.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
            <Select value={mes} onValueChange={setMes} aria-label="Mês">
              {meses.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
            </Select>
          </div>
        }
        menu={[
          {
            label: gerandoPdf ? 'Gerando PDF…' : 'Baixar PDF',
            icon: <FileText size={15} />,
            disabled: !dados || gerandoPdf,
            title: 'Baixa o relatório do mês como um arquivo PDF para enviar',
            onClick: async () => {
              if (!dados) return
              setGerandoPdf(true)
              try {
                // A biblioteca do PDF só é baixada na hora de gerar — quem só olha o
                // relatório na tela não paga por ela.
                const { baixarRelatorioPdf } = await import('@/lib/relatorioPdf')
                baixarRelatorioPdf(dados, nomeMes, tiposRegistro, tiposLocal)
              } catch {
                showToast('Não foi possível gerar o PDF')
              } finally {
                setGerandoPdf(false)
              }
            },
          },
          { label: 'Exportar CSV', icon: <Download size={15} />, disabled: !dados?.lista.length, onClick: () => dados && baixarCsv(dados, tiposLocal) },
        ]}
      />

      {carregando && !dados ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : erro ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-400">{erro}</div>
      ) : dados && r ? (
        <div className={`space-y-4 ${carregando ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-7">
            <Numero label="Chamados abertos" valor={r.abertos} />
            <Numero label="Concluídos" valor={r.concluidos} tom="#34d399" />
            <Numero label="Ainda em aberto" valor={r.emAberto} hint="na fila, sem técnico" tom={r.emAberto ? '#fbbf24' : undefined} />
            <Numero label="Horas trabalhadas" valor={fmtMinutos(r.minutosTrabalhados)} hint={`${r.visitas} ida(s) ao local`} />
            {/* Os três de baixo só aparecem com espaço — no celular ficam atrás do "mais números". */}
            <div className={`contents ${maisNumeros ? '' : 'hidden md:contents'}`}>
              <Numero label="Tempo médio" valor={r.mediaHoras} sufixo="h" hint="abertura → conclusão" />
              <Numero label="Registros" valor={r.registros} hint={dados.registrosPorTipo.filter((x) => x.total).map((x) => `${x.total} ${tipoRegistroDe(tiposRegistro, x.tipo).label.toLowerCase()}`).join(' · ') || 'nenhum no mês'} />
              <Numero label="Itens usados" valor={dados.itens.reduce((s, i) => s + i.quantidade, 0)} hint={dados.itens.some((i) => i.valorTotal) ? `R$ ${dados.itens.reduce((s, i) => s + i.valorTotal, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'nos concluídos'} />
            </div>
          </div>
          <button onClick={() => setMaisNumeros((v) => !v)} className="-mt-1 w-full rounded-lg border border-slate-800 py-2 text-[12px] text-slate-400 hover:text-slate-200 md:hidden">
            {maisNumeros ? 'Menos números' : 'Mais números'}
          </button>

          {/* Situação dos abertos no mês: são só etiquetas — ficam soltas, logo abaixo dos números. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Situação atual dos abertos no mês</span>
            {dados.porStatus.map((s) => (
              <span key={s.key ?? s.label} className={`rounded-full px-2 py-0.5 text-[11px] ${CORES_FASE[s.fase ?? 'andamento'].badge}`}>
                {s.label}: <span className="font-medium tabular-nums">{s.total}</span>
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Secao titulo="Horas trabalhadas por técnico" hint="Soma das idas ao local com data neste mês." aberta>
              {dados.horasPorTecnico.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-slate-600">Nenhuma hora registrada no período.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="pb-2 font-medium">Técnico</th>
                      <th className="pb-2 text-right font-medium">Horas</th>
                      <th className="pb-2 text-right font-medium">Idas</th>
                      <th className="pb-2 text-right font-medium">Chamados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.horasPorTecnico.map((h) => (
                      <tr key={h.nome} className="border-t border-slate-800/60">
                        <td className="py-1.5 text-slate-300">{h.nome}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums text-slate-100">{fmtMinutos(h.minutos)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{h.visitas}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{h.chamados}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dados.horasPorLocal.length > 1 && (
                <>
                  <div className="mb-2 mt-4 border-t border-slate-800 pt-3 text-sm font-medium text-slate-200">Horas por local</div>
                  <div className="space-y-1">
                    {dados.horasPorLocal.map((l) => (
                      <div key={l.nome} className="flex items-center justify-between px-1 text-[13px]">
                        <span className="truncate text-slate-300">{l.nome}</span>
                        <span className="shrink-0 tabular-nums text-slate-400">{fmtMinutos(l.minutos)} · {l.chamados} chamado(s)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Secao>

            <Secao titulo="Concluídos por técnico">
              {dados.porResponsavel.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-slate-600">Nenhum chamado concluído no período.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="pb-2 font-medium">Técnico</th>
                      <th className="pb-2 text-right font-medium">Concluídos</th>
                      <th className="pb-2 text-right font-medium">Média</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.porResponsavel.map((p) => (
                      <tr key={p.nome} className="border-t border-slate-800/60">
                        <td className="py-1.5 text-slate-300">{p.nome}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-200">{p.concluidos}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{p.mediaHoras == null ? '—' : `${p.mediaHoras} h`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dados.porLocal.length > 0 && (
                <>
                  <div className="mb-2 mt-4 border-t border-slate-800 pt-3 text-sm font-medium text-slate-200">Chamados por local</div>
                  <div className="space-y-1">
                    {dados.porLocal.map((l) => (
                      <div key={l.nome} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-800/40">
                        <span className="truncate text-[13px] text-slate-300">{l.nome}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-slate-400">
                          {l.abertos} aberto(s) · <span className="text-emerald-400">{l.concluidos ?? 0} concluído(s)</span>
                          {l.emAberto > 0 && <span className="text-amber-400"> · {l.emAberto} na fila</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Secao>
          </div>

          {/* Que tipo de lugar mais nos chama. Só aparece quando há local com etiqueta —
              uma barra única de "sem tipo" não diz nada. */}
          {dados.porTipoLocal?.some((x) => x.tipo) && (() => {
            const maior = Math.max(1, ...dados.porTipoLocal.map((x) => x.abertos + x.concluidos))
            return (
              <Secao titulo="Chamados por tipo de local" hint="Abertos e concluídos no mês, pela etiqueta do local. Toque num tipo para ver os chamados dele na lista do período.">
                <div className="space-y-1">
                  {dados.porTipoLocal.map((x) => {
                    const t = tipoLocalDe(tiposLocal, x.tipo) ?? { key: '', label: 'Sem tipo', color: '#64748b' }
                    const total = x.abertos + x.concluidos
                    return (
                      <button
                        key={x.tipo || 'sem'}
                        type="button"
                        onClick={() => setTipoFiltro(tipoFiltro === x.tipo ? null : x.tipo)}
                        aria-pressed={tipoFiltro === x.tipo}
                        title="Mostrar só os chamados deste tipo na lista do período"
                        className={`block w-full rounded-lg p-1.5 text-left hover:bg-slate-800/40 ${tipoFiltro === x.tipo ? 'bg-slate-800/60 ring-1 ring-slate-700' : ''}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-slate-200">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} /> {t.label}
                          </span>
                          <span className="shrink-0 text-[12px] tabular-nums text-slate-400">
                            <span className="font-medium text-slate-100">{x.abertos}</span> aberto(s) · <span className="text-emerald-400">{x.concluidos}</span> concluído(s) · {x.locais} local(is)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full" style={{ width: `${(total / maior) * 100}%`, background: t.color }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Secao>
            )
          })()}

          {dados.pedidos && dados.pedidos.pedidos > 0 && (
            <Secao titulo="Controles & Tags" hint="Pedidos do mês pela data do pedido: por tipo de item, por local com valor, e o total.">
              <ResumoPedidos r={dados.pedidos} catalogo={catalogo} />
            </Secao>
          )}

          <Secao titulo="Por dia">
            <ResponsiveContainer width="100%" height={220}>
              {/* O mesmo desenho do dashboard: quem olha os dois no mesmo dia não precisa
                  reaprender a ler o gráfico. Ids de gradiente próprios para não
                  esbarrar nos do dashboard. */}
              <AreaChart data={dados.porDia} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gRelAb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIE.abertos.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={SERIE.abertos.color} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRelCo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIE.concluidos.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={SERIE.concluidos.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="dia" tick={axisTick} axisLine={{ stroke: gridStroke }} tickLine={false} interval={1} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} labelFormatter={(d) => `Dia ${d}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" name={SERIE.abertos.label} dataKey="abertos" stroke={SERIE.abertos.color} strokeWidth={2} fill="url(#gRelAb)" />
                <Area type="monotone" name={SERIE.concluidos.label} dataKey="concluidos" stroke={SERIE.concluidos.color} strokeWidth={2} fill="url(#gRelCo)" />
              </AreaChart>
            </ResponsiveContainer>
          </Secao>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-200">
                Chamados do período
                {tipoFiltro !== null && (() => {
                  const t = tipoLocalDe(tiposLocal, tipoFiltro) ?? { key: '', label: 'Sem tipo', color: '#64748b' }
                  return (
                    <button onClick={() => setTipoFiltro(null)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-normal" style={{ color: t.color, background: `${t.color}1e` }} title="Mostrar todos">
                      {t.label} ✕
                    </button>
                  )
                })()}
              </div>
              <span className="text-[11px] text-slate-500">{listaFiltrada.length}{tipoFiltro !== null ? ` de ${dados.lista.length}` : ''} no mês</span>
            </div>
            {listaFiltrada.length === 0 ? (
              <div className="p-4"><EmptyState>Nenhum chamado neste período.</EmptyState></div>
            ) : (
              <>
                {/* Celular: cada chamado é um bloco, não uma linha de sete colunas. */}
                <div className="divide-y divide-slate-800/60 md:hidden">
                  {listaFiltrada.map((t) => (
                    <div key={t.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="font-mono text-[10px] text-slate-500">{t.code}</span>
                          <span className="block truncate text-[13px] text-slate-100">{t.title}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${t.concluido ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{t.status}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                        {t.local && <span>{siglaDe(t.tipoLocal)}{t.local}</span>}
                        {t.responsavel && <span>{t.responsavel}</span>}
                        {!!t.minutosNoMes && <span>{fmtMinutos(t.minutosNoMes)}</span>}
                        <span className="font-mono">{fmtDataHora(t.criadoEm)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2.5 font-medium">Chamado</th>
                      <th className="px-4 py-2.5 font-medium">Local</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Técnico</th>
                      <th className="px-4 py-2.5 font-medium">Aberto</th>
                      <th className="px-4 py-2.5 font-medium">Concluído</th>
                      <th className="px-4 py-2.5 text-right font-medium">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaFiltrada.map((t) => {
                      return (
                        <tr key={t.id} className="border-b border-slate-800/50 last:border-0">
                          <td className="px-4 py-2"><span className="font-mono text-[11px] text-slate-500">{t.code}</span> <span className="text-slate-200">{t.title}</span></td>
                          <td className="px-4 py-2 text-slate-400">{siglaDe(t.tipoLocal)}{t.local || '—'}</td>
                          <td className="px-4 py-2 text-slate-300">{t.status}</td>
                          <td className="px-4 py-2 text-slate-400">{t.responsavel || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-slate-400">{fmtDataHora(t.criadoEm)}</td>
                          <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px]">
                            {t.concluidoEm ? (
                              <span className="text-emerald-400">{fmtDataHora(t.concluidoEm)}</span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-300">{t.minutosNoMes ? fmtMinutos(t.minutosNoMes) : <span className="text-slate-600">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </Card>

          <Secao titulo="Itens trocados e comprados" hint="Dos chamados concluídos no mês.">
            {dados.itens.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-slate-600">Nenhum item registrado.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 font-medium">Tipo</th>
                    <th className="pb-2 text-right font-medium">Qtd.</th>
                    <th className="pb-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.itens.map((i) => (
                    <tr key={`${i.tipo}-${i.descricao}`} className="border-t border-slate-800/60" title={`Chamados: ${i.chamados.join(', ')}`}>
                      <td className="py-1.5 text-slate-300">{i.descricao}</td>
                      <td className="py-1.5 text-slate-400">{i.tipo === 'comprado' ? 'Comprado' : 'Trocado'}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-200">{i.quantidade.toLocaleString('pt-BR')}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-400">{i.valorTotal ? `R$ ${i.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Secao>
        </div>
      ) : null}

    </div>
  )
}
