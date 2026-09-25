import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { Button, EmptyState, Modal, Select } from '@/components/ui'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtDataHora, fmtMinutos } from '@/lib/utils'
import { parseTiposRegistro } from '@/lib/registros'
import { parseTiposLocal } from '@/lib/locais'
import { baixarCsv } from '@/lib/relatorioCsv'
import type { MonthlyReport } from '@/lib/types'

export function ultimosMeses(n = 12) {
  const hoje = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
  })
}

/** Uma caixinha de número do topo — a mesma nos três relatórios de prévia. */
export function Kpi({ label, valor, tom }: { label: string; valor: string; tom?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-100" style={{ color: tom }}>{valor}</div>
    </div>
  )
}

/**
 * Prévia do relatório de chamados, direto da tela de chamados: os números do mês no
 * topo, por técnico e por local, a lista — e PDF/CSV no rodapé. É o mesmo relatório da
 * tela de Relatórios, em forma de consulta rápida.
 */
export function RelatorioChamados({ onClose }: { onClose: () => void }) {
  const locais = useStore((s) => s.locais)
  const settings = useStore((s) => s.settings)
  const tiposRegistro = useMemo(() => parseTiposRegistro(settings), [settings])
  const tiposLocal = useMemo(() => parseTiposLocal(settings), [settings])
  const meses = useMemo(() => ultimosMeses(), [])
  const [mes, setMes] = useState(meses[0].key)
  const [localId, setLocalId] = useState('')
  const [dados, setDados] = useState<MonthlyReport | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const nomeMes = meses.find((m) => m.key === mes)?.label ?? mes

  useEffect(() => {
    let vivo = true
    setErro(null)
    api.monthlyReport(mes, localId || undefined)
      .then((r) => { if (vivo) setDados(r) })
      .catch((e) => { if (vivo) { setDados(null); setErro(e?.message ?? 'Não foi possível carregar o relatório') } })
    return () => { vivo = false }
  }, [mes, localId])

  const r = dados?.resumo

  return (
    <Modal
      open
      wide
      telaCheia
      onClose={onClose}
      title="Relatório de chamados"
      footer={
        <>
          <Button variant="subtle" onClick={() => dados && baixarCsv(dados, tiposLocal)} disabled={!dados?.lista.length}><Download size={14} /> CSV</Button>
          <Button
            variant="subtle"
            disabled={!dados || gerando}
            onClick={async () => {
              if (!dados) return
              setGerando(true)
              try {
                const { baixarRelatorioPdf } = await import('@/lib/relatorioPdf')
                baixarRelatorioPdf(dados, nomeMes, tiposRegistro, tiposLocal)
              } finally {
                setGerando(false)
              }
            }}
          >
            {gerando ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Select value={mes} onValueChange={setMes} aria-label="Mês">
            {meses.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
          </Select>
          <Select value={localId} onValueChange={setLocalId} aria-label="Local">
            <option value="">Todos os locais</option>
            {locais.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
          </Select>
        </div>

        {erro ? (
          <div className="rounded-lg border border-slate-800 px-3 py-6 text-center text-sm text-slate-400">{erro}</div>
        ) : !dados || !r ? (
          <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Abertos" valor={String(r.abertos)} />
              <Kpi label="Concluídos" valor={String(r.concluidos)} tom="#34d399" />
              <Kpi label="Ainda na fila" valor={String(r.emAberto)} tom={r.emAberto ? '#fbbf24' : undefined} />
              <Kpi label="Horas trabalhadas" valor={fmtMinutos(r.minutosTrabalhados)} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-[12px] font-medium text-slate-300">Por técnico</div>
                {dados.horasPorTecnico.length === 0 && dados.porResponsavel.length === 0 ? (
                  <div className="py-4 text-center text-[12px] text-slate-600">Nada no período.</div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="pb-1.5 font-medium">Técnico</th>
                        <th className="pb-1.5 text-right font-medium">Horas</th>
                        <th className="pb-1.5 text-right font-medium">Concluídos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set([...dados.horasPorTecnico.map((h) => h.nome), ...dados.porResponsavel.map((p) => p.nome)])].map((nome) => (
                        <tr key={nome} className="border-t border-slate-800/60">
                          <td className="py-1 text-slate-300">{nome}</td>
                          <td className="py-1 text-right tabular-nums text-slate-200">{fmtMinutos(dados.horasPorTecnico.find((h) => h.nome === nome)?.minutos ?? 0)}</td>
                          <td className="py-1 text-right tabular-nums text-slate-400">{dados.porResponsavel.find((p) => p.nome === nome)?.concluidos ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div className="mb-2 text-[12px] font-medium text-slate-300">Por local</div>
                {dados.porLocal.length === 0 ? (
                  <div className="py-4 text-center text-[12px] text-slate-600">{dados.local ? `Só ${dados.local.name}.` : 'Nada no período.'}</div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="pb-1.5 font-medium">Local</th>
                        <th className="pb-1.5 text-right font-medium">Abertos</th>
                        <th className="pb-1.5 text-right font-medium">Concluídos</th>
                        <th className="pb-1.5 text-right font-medium">Na fila</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.porLocal.map((l) => (
                        <tr key={l.nome} className="border-t border-slate-800/60">
                          <td className="py-1 text-slate-300">{l.nome}</td>
                          <td className="py-1 text-right tabular-nums text-slate-400">{l.abertos}</td>
                          <td className="py-1 text-right tabular-nums text-emerald-400/90">{l.concluidos ?? 0}</td>
                          <td className="py-1 text-right tabular-nums text-amber-400/90">{l.emAberto || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[12px] font-medium text-slate-300">Chamados do mês <span className="text-slate-500">({dados.lista.length})</span></div>
              {dados.lista.length === 0 ? (
                <EmptyState>Nenhum chamado neste mês.</EmptyState>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-medium">Chamado</th>
                        <th className="px-3 py-2 font-medium">Local</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Técnico</th>
                        <th className="px-3 py-2 font-medium">Aberto</th>
                        <th className="px-3 py-2 font-medium">Concluído</th>
                        <th className="px-3 py-2 text-right font-medium">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.lista.map((t) => (
                        <tr key={t.id} className="border-b border-slate-800/50 last:border-0">
                          <td className="px-3 py-2"><span className="font-mono text-[11px] text-slate-500">{t.code}</span> <span className="text-slate-200">{t.title}</span></td>
                          <td className="px-3 py-2 text-slate-400">{t.local || '—'}</td>
                          <td className="px-3 py-2 text-slate-300">{t.status}</td>
                          <td className="px-3 py-2 text-slate-400">{t.responsavel || '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmtDataHora(t.criadoEm)}</td>
                          <td className="whitespace-nowrap px-3 py-2">{t.concluidoEm ? <span className="text-emerald-400">{fmtDataHora(t.concluidoEm)}</span> : <span className="text-slate-700">—</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-300">{t.minutosNoMes ? fmtMinutos(t.minutosNoMes) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
