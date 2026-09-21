import { useEffect, useState, type ReactNode } from 'react'
import { Users, Loader2, Check, Plus, X } from 'lucide-react'
import { Button } from './ui'
import { api } from '@/lib/api'
import { useStore, useCurrentUser } from '@/lib/store'
import type { TecnicoRef, Ticket } from '@/lib/types'

/**
 * Compartilhar o chamado: põe outros técnicos junto — eles passam a ver o chamado e a ser
 * avisados do que acontece nele. Quem preenche o atendimento continua sendo só o
 * responsável, então não há duas pessoas escrevendo a mesma solução.
 */
export function CompartilharChamado({ t, onSaved, aoLado }: {
  t: Ticket
  onSaved: () => void
  /** Outra ação de gente no chamado (passar o bastão), na mesma linha e no mesmo estilo. */
  aoLado?: ReactNode
}) {
  const shareTicket = useStore((s) => s.shareTicket)
  const showToast = useStore((s) => s.showToast)
  const me = useCurrentUser()
  const [aberto, setAberto] = useState(false)
  const [tecnicos, setTecnicos] = useState<TecnicoRef[] | null>(null)
  const [sel, setSel] = useState<string[]>(() => (t.sharedWith ?? []).map((x) => x.id))
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { setSel((t.sharedWith ?? []).map((x) => x.id)) }, [t.id, t.sharedWith])
  useEffect(() => {
    if (!aberto || tecnicos) return
    let vivo = true
    api.tecnicos(t.localId)
      .then((r) => { if (vivo) setTecnicos(r.filter((x) => x.id !== t.assigneeId)) })
      .catch(() => { if (vivo) setTecnicos([]) })
    return () => { vivo = false }
  }, [aberto, tecnicos, t.localId, t.assigneeId])

  const juntos = t.sharedWith ?? []
  const mudou = sel.length !== juntos.length || sel.some((id) => !juntos.some((j) => j.id === id))

  async function salvar() {
    setSalvando(true)
    try {
      await shareTicket(t.id, sel)
      onSaved()
      setAberto(false)
      showToast(sel.length ? 'Chamado compartilhado' : 'Chamado não está mais compartilhado')
    } catch (e: any) {
      showToast(e?.message ?? 'Não foi possível compartilhar')
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="subtle" onClick={() => setAberto(true)}>
          <Users size={12} /> {juntos.length ? 'Quem está junto' : 'Compartilhar com outro técnico'}
        </Button>
        {aoLado}
        {juntos.map((j) => (
          <span key={j.id} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
            <Users size={10} /> {j.id === me?.id ? 'você' : j.name}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-200"><Users size={14} className="text-red-400" /> Quem está junto neste chamado</span>
          <button type="button" onClick={() => setAberto(false)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" aria-label="Fechar"><X size={14} /></button>
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          Eles acompanham o chamado e recebem os avisos. Quem preenche o atendimento continua sendo {t.assigneeName ?? 'o responsável'}.
        </p>
        {tecnicos === null ? (
          <div className="py-4 text-center"><Loader2 size={16} className="mx-auto animate-spin text-slate-600" /></div>
        ) : tecnicos.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-slate-500">Nenhum outro técnico disponível para este local.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tecnicos.map((tec) => {
              const on = sel.includes(tec.id)
              return (
                <button
                  key={tec.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSel(on ? sel.filter((id) => id !== tec.id) : [...sel, tec.id])}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${on ? 'border-red-700 bg-red-500/10 text-red-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'}`}
                >
                  {on ? <Check size={12} /> : <Plus size={12} />} {tec.name}
                </button>
              )
            })}
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="subtle" onClick={() => { setSel(juntos.map((j) => j.id)); setAberto(false) }}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={salvando || !mudou}>{salvando && <Loader2 size={12} className="animate-spin" />} Salvar</Button>
        </div>
      </div>
      {/* Com o painel aberto a ação vizinha desce, em vez de sumir da tela. */}
      {aoLado && <div className="flex flex-wrap items-center gap-2">{aoLado}</div>}
    </div>
  )
}
