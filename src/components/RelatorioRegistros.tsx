import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { Button, EmptyState, Modal, Select } from '@/components/ui'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'
import { fmtDataHora } from '@/lib/utils'
import { tipoRegistroDe } from '@/lib/registros'
import { Kpi, ultimosMeses } from '@/components/chamados/RelatorioChamados'
import type { Registro, TipoRegistroDef } from '@/lib/types'

/** Conta por uma chave e ordena do maior para o menor. */
function contar<T>(itens: T[], chave: (t: T) => string) {
  const m = new Map<string, number>()
  for (const t of itens) m.set(chave(t), (m.get(chave(t)) ?? 0) + 1)
  return [...m.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
}

/**
 * Prévia do relatório de registros: mês e local em cima, por categoria, por local e por
 * quem registrou, a lista — e PDF/CSV no rodapé.
 */
export function RelatorioRegistros({ tipos, onClose }: { tipos: TipoRegistroDef[]; onClose: () => void }) {
  const locais = useStore((s) => s.locais)
  const meses = useMemo(() => ultimosMeses(), [])
  const [mes, setMes] = useState(meses[0].key)
  const [localId, setLocalId] = useState('')
  const [tipo, setTipo] = useState('')
  const [itens, setItens] = useState<Registro[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const nomeMes = meses.find((m) => m.key === mes)?.label ?? mes

  useEffect(() => {
    let vivo = true
    setErro(null)
    const [a, m] = mes.split('-').map(Number)
    const de = new Date(a, m - 1, 1).toISOString()
    const ate = new Date(new Date(a, m, 1).getTime() - 1).toISOString()
    api.registros({ de, ate, localId, tipo })
      .then((r) => { if (vivo) setItens(r) })
      .catch((e) => { if (vivo) { setItens(null); setErro(e?.message ?? 'Não foi possível carregar os registros') } })
    return () => { vivo = false }
  }, [mes, localId, tipo])

  const porCategoria = useMemo(() => contar(itens ?? [], (r) => r.tipo), [itens])
  const porLocal = useMemo(() => contar(itens ?? [], (r) => r.localName ?? 'Sem local'), [itens])
  const porAutor = useMemo(() => contar(itens ?? [], (r) => r.autorName), [itens])
  const viraramChamado = (itens ?? []).filter((r) => r.ticketId).length
  const maior = Math.max(1, ...porCategoria.map((c) => c.total))

  const tabela = (titulo: string, linhas: { nome: string; total: number }[]) => (
    <div>
      <div className="mb-2 text-[12px] font-medium text-slate-300">{titulo}</div>
      {linhas.length === 0 ? <div className="py-4 text-center text-[12px] text-slate-600">Nada no período.</div> : (
        <table className="w-full text-[12px]">
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-t border-slate-800/60 first:border-0">
                <td className="py-1 text-slate-300">{l.nome}</td>
                <td className="py-1 text-right tabular-nums text-slate-200">{l.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <Modal
      open
      wide
      telaCheia
      onClose={onClose}
      title="Relatório de registros"
      footer={
        <>
          <Button
            variant="subtle"
            disabled={!itens?.length}
            onClick={async () => { if (itens) (await import('@/lib/registrosExport')).baixarRegistrosCsv(itens, tipos) }}
          >
            <Download size={14} /> CSV
          </Button>
          <Button
            variant="subtle"
            disabled={!itens?.length || gerando}
            onClick={async () => {
              if (!itens) return
              setGerando(true)
              try { (await import('@/lib/registrosExport')).baixarRegistrosPdf(itens, nomeMes, tipos) } finally { setGerando(false) }
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
          <Select value={tipo} onValueChange={setTipo} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {tipos.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
          </Select>
        </div>

        {erro ? (
          <div className="rounded-lg border border-slate-800 px-3 py-6 text-center text-sm text-slate-400">{erro}</div>
        ) : itens === null ? (
          <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Registros" valor={String(itens.length)} />
              <Kpi label="Viraram chamado" valor={String(viraramChamado)} />
              <Kpi label="Locais" valor={String(porLocal.filter((l) => l.nome !== 'Sem local').length)} />
              <Kpi label="Quem registrou" valor={String(porAutor.length)} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <div className="mb-2 text-[12px] font-medium text-slate-300">Por categoria</div>
                {porCategoria.length === 0 ? <div className="py-4 text-center text-[12px] text-slate-600">Nada no período.</div> : (
                  <div className="space-y-2">
                    {porCategoria.map((c) => {
                      const t = tipoRegistroDe(tipos, c.nome)
                      return (
                        <div key={c.nome}>
                          <div className="mb-0.5 flex items-center justify-between text-[12px]">
                            <span className="text-slate-200"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />{t.label}</span>
                            <span className="tabular-nums text-slate-300">{c.total}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full" style={{ width: `${(c.total / maior) * 100}%`, background: t.color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {tabela('Por local', porLocal)}
              {tabela('Por quem registrou', porAutor)}
            </div>

            <div>
              <div className="mb-2 text-[12px] font-medium text-slate-300">Registros do mês <span className="text-slate-500">({itens.length})</span></div>
              {itens.length === 0 ? <EmptyState>Nenhum registro neste mês.</EmptyState> : (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-medium">Quando</th>
                        <th className="px-3 py-2 font-medium">Categoria</th>
                        <th className="px-3 py-2 font-medium">Registro</th>
                        <th className="px-3 py-2 font-medium">Local</th>
                        <th className="px-3 py-2 font-medium">Quem pediu</th>
                        <th className="px-3 py-2 font-medium">Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((r) => {
                        const t = tipoRegistroDe(tipos, r.tipo)
                        return (
                          <tr key={r.id} className="border-b border-slate-800/50 align-top last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmtDataHora(r.ocorridoEm)}</td>
                            <td className="whitespace-nowrap px-3 py-2"><span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: t.color, background: `${t.color}1e` }}>{t.label}</span></td>
                            <td className="px-3 py-2 text-slate-200">{r.titulo}{r.ticketCode && <span className="ml-1 text-[10px] text-red-300">→ {r.ticketCode}</span>}</td>
                            <td className="px-3 py-2 text-slate-400">{r.localName || '—'}</td>
                            <td className="px-3 py-2 text-slate-400">{r.solicitante || '—'}</td>
                            <td className="px-3 py-2 text-slate-400">{r.autorName}</td>
                          </tr>
                        )
                      })}
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
