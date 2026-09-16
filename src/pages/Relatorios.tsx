import { useEffect, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { Printer, Loader2, Download } from 'lucide-react'
import { Card, PageHeader, Select, EmptyState } from '@/components/ui'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtDataHora, fmtMinutos } from '@/lib/utils'
import { tipoRegistroDe } from '@/lib/registros'
import { SERIE, axisTick, gridStroke, tooltipItem, tooltipLabel, tooltipStyle } from '@/lib/chart'
import type { MonthlyReport } from '@/lib/types'

/** Últimos 12 meses como 'YYYY-MM' + rótulo legível. */
function ultimosMeses(n = 12) {
  const hoje = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
  })
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

/** CSV com `;` (abre direto no Excel em pt-BR) e BOM para os acentos. */
function baixarCsv(dados: MonthlyReport) {
  const cab = ['Código', 'Título', 'Local', 'Status', 'Aberto por', 'Técnico', 'Aberto em', 'Concluído em', 'Horas no mês']
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linhas = dados.lista.map((t) => [
    t.code, t.title, t.local, t.status, t.abertoPor, t.responsavel,
    fmtDataHora(t.criadoEm), t.concluidoEm ? fmtDataHora(t.concluidoEm) : '',
    t.minutosNoMes ? (t.minutosNoMes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '',
  ].map(esc).join(';'))
  const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chamados-${dados.periodo.mes}${dados.local ? `-${dados.local.code}` : ''}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Relatorios() {
  const locais = useStore((s) => s.locais)
  const meses = ultimosMeses()
  const [localId, setLocalId] = useState('')
  const [mes, setMes] = useState(meses[0].key)
  const [dados, setDados] = useState<MonthlyReport | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

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
  const nomeMes = meses.find((m) => m.key === mes)?.label ?? mes

  return (
    <div>
      <PageHeader
        title="Relatório mensal"
        subtitle={`Chamados de ${nomeMes}${dados?.local ? ` · ${dados.local.name}` : ' · todos os locais'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Select value={localId} onValueChange={setLocalId} aria-label="Local">
              <option value="">Todos os locais</option>
              {locais.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
            <Select value={mes} onValueChange={setMes} aria-label="Mês">
              {meses.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
            </Select>
            <button onClick={() => dados && baixarCsv(dados)} disabled={!dados?.lista.length} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:border-red-700 hover:bg-red-500/5 disabled:opacity-40">
              <Download size={14} /> CSV
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:border-red-700 hover:bg-red-500/5">
              <Printer size={14} /> Imprimir
            </button>
          </div>
        }
      />

      {carregando && !dados ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : erro ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-400">{erro}</div>
      ) : dados && r ? (
        <div className={`space-y-4 ${carregando ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
            <Numero label="Chamados abertos" valor={r.abertos} />
            <Numero label="Concluídos" valor={r.concluidos} tom="#34d399" />
            <Numero label="Ainda em aberto" valor={r.emAberto} hint="dos abertos no mês" tom={r.emAberto ? '#fbbf24' : undefined} />
            <Numero label="Horas trabalhadas" valor={fmtMinutos(r.minutosTrabalhados)} hint={`${r.visitas} ida(s) ao local`} />
            <Numero label="Tempo médio" valor={r.mediaHoras} sufixo="h" hint="abertura → conclusão" />
            <Numero label="Registros" valor={r.registros} hint={dados.registrosPorTipo.filter((x) => x.total).map((x) => `${x.total} ${tipoRegistroDe(x.tipo).label.toLowerCase()}`).join(' · ') || 'nenhum no mês'} />
            <Numero label="Itens usados" valor={dados.itens.reduce((s, i) => s + i.quantidade, 0)} hint={dados.itens.some((i) => i.valorTotal) ? `R$ ${dados.itens.reduce((s, i) => s + i.valorTotal, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'nos concluídos'} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-1 text-sm font-medium text-slate-200">Horas trabalhadas por técnico</div>
              <div className="mb-3 text-[11px] text-slate-500">Soma das idas ao local com data neste mês.</div>
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
            </Card>

            <Card className="p-4">
              <div className="mb-1 text-sm font-medium text-slate-200">Itens trocados e comprados</div>
              <div className="mb-3 text-[11px] text-slate-500">Dos chamados concluídos no mês.</div>
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
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-3 text-sm font-medium text-slate-200">Por dia</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dados.porDia} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="dia" tick={axisTick} axisLine={{ stroke: gridStroke }} tickLine={false} interval={1} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} labelFormatter={(d) => `Dia ${d}`} cursor={{ fill: 'transparent' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar name={SERIE.abertos.label} dataKey="abertos" fill={SERIE.abertos.color} radius={[3, 3, 0, 0]} maxBarSize={10} />
                <Bar name={SERIE.concluidos.label} dataKey="concluidos" fill={SERIE.concluidos.color} radius={[3, 3, 0, 0]} maxBarSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 text-sm font-medium text-slate-200">Situação atual dos abertos no mês</div>
              <div className="flex flex-wrap gap-1.5">
                {dados.porStatus.map((s) => (
                  <span key={s.label} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{s.label}: <span className="font-medium tabular-nums text-slate-100">{s.total}</span></span>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-medium text-slate-200">Concluídos por técnico</div>
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
                  <div className="mb-2 mt-4 border-t border-slate-800 pt-3 text-sm font-medium text-slate-200">Abertos por local</div>
                  <div className="space-y-1">
                    {dados.porLocal.map((l) => (
                      <div key={l.nome} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-800/40">
                        <span className="truncate text-[13px] text-slate-300">{l.nome}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-slate-400">{l.abertos} {l.emAberto > 0 && <span className="text-amber-400">({l.emAberto} em aberto)</span>}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-medium text-slate-200">Chamados do período</div>
              <span className="text-[11px] text-slate-500">{dados.lista.length} chamado(s) abertos, concluídos ou atendidos no mês</span>
            </div>
            {dados.lista.length === 0 ? (
              <div className="p-4"><EmptyState>Nenhum chamado neste período.</EmptyState></div>
            ) : (
              <div className="overflow-x-auto">
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
                    {dados.lista.map((t) => {
                      return (
                        <tr key={t.id} className="border-b border-slate-800/50 last:border-0">
                          <td className="px-4 py-2"><span className="font-mono text-[11px] text-slate-500">{t.code}</span> <span className="text-slate-200">{t.title}</span></td>
                          <td className="px-4 py-2 text-slate-400">{t.local || '—'}</td>
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
            )}
          </Card>
        </div>
      ) : null}
    </div>
  )
}
