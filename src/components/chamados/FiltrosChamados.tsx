import { useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Select } from '@/components/ui'
import { api } from '@/lib/api'
import { useStore, useCurrentUser } from '@/lib/store'
import type { FaseChamado, TecnicoRef, Ticket, TicketStatusDef } from '@/lib/types'

/**
 * Filtros de chamado. `tecnico` e `autor` guardam 'eu'/'sem' ou o id de alguém — é o que a
 * operação pergunta na prática ("o que é meu?", "o que ninguém pegou?", "o que o Zé abriu?").
 */
export interface FiltroChamados {
  q: string
  localId: string
  tecnico: string
  autor: string
  coluna: string
  periodo: '' | '7' | '30' | 'custom'
  de: string
  ate: string
}

export const FILTRO_VAZIO: FiltroChamados = { q: '', localId: '', tecnico: '', autor: '', coluna: '', periodo: '', de: '', ate: '' }

/** Quantos filtros estão valendo (fora a busca, que fica sempre à vista). */
export function contarFiltros(f: FiltroChamados): number {
  return [f.localId, f.tecnico, f.autor, f.coluna, f.periodo].filter(Boolean).length
}

/** Aplica os filtros a um chamado. Fora daqui ninguém decide o que aparece. */
export function aplicarFiltros(t: Ticket, f: FiltroChamados, meuId: string): boolean {
  const termo = f.q.trim().toLowerCase()
  if (termo && !`${t.code} ${t.title} ${t.localName ?? ''} ${t.assigneeName ?? ''} ${t.createdByName} ${t.solicitante ?? ''}`.toLowerCase().includes(termo)) return false
  if (f.localId) {
    if (f.localId === 'sem' ? !!t.localId : t.localId !== f.localId) return false
  }
  if (f.tecnico) {
    if (f.tecnico === 'sem' && t.assigneeId) return false
    if (f.tecnico === 'eu' && t.assigneeId !== meuId && !(t.sharedWith ?? []).some((s) => s.id === meuId)) return false
    if (f.tecnico !== 'sem' && f.tecnico !== 'eu' && t.assigneeId !== f.tecnico) return false
  }
  if (f.autor === 'eu' && t.createdById !== meuId) return false
  if (f.coluna && t.status !== f.coluna) return false
  if (f.periodo) {
    const abertura = new Date(t.createdAt).getTime()
    if (f.periodo === 'custom') {
      if (f.de && abertura < new Date(`${f.de}T00:00:00`).getTime()) return false
      if (f.ate && abertura > new Date(`${f.ate}T23:59:59`).getTime()) return false
    } else {
      const dias = Number(f.periodo)
      if (Date.now() - abertura > dias * 86400000) return false
    }
  }
  return true
}

export function FiltrosChamados({ fase, valor, onChange, colunas }: {
  fase: FaseChamado
  valor: FiltroChamados
  onChange: (f: FiltroChamados) => void
  colunas: TicketStatusDef[]
}) {
  const locais = useStore((s) => s.locais)
  const me = useCurrentUser()
  const [aberto, setAberto] = useState(false)
  const [tecnicos, setTecnicos] = useState<TecnicoRef[]>([])

  useEffect(() => {
    let vivo = true
    api.tecnicos().then((r) => vivo && setTecnicos(r)).catch(() => {})
    return () => { vivo = false }
  }, [])

  const set = (p: Partial<FiltroChamados>) => onChange({ ...valor, ...p })
  const ativos = contarFiltros(valor)

  /** Etiquetas do que está filtrando agora — some com um toque no X. */
  const chips = useMemo(() => {
    const out: { chave: keyof FiltroChamados; texto: string; limpar: Partial<FiltroChamados> }[] = []
    if (valor.localId) {
      const nome = valor.localId === 'sem' ? 'Sem local' : locais.find((l) => l.id === valor.localId)?.name ?? 'Local'
      out.push({ chave: 'localId', texto: nome, limpar: { localId: '' } })
    }
    if (valor.tecnico) {
      const nome = valor.tecnico === 'eu' ? 'Comigo' : valor.tecnico === 'sem' ? 'Sem técnico' : tecnicos.find((t) => t.id === valor.tecnico)?.name ?? 'Técnico'
      out.push({ chave: 'tecnico', texto: nome, limpar: { tecnico: '' } })
    }
    if (valor.autor) out.push({ chave: 'autor', texto: 'Abertos por mim', limpar: { autor: '' } })
    if (valor.coluna) out.push({ chave: 'coluna', texto: colunas.find((c) => c.key === valor.coluna)?.label ?? 'Coluna', limpar: { coluna: '' } })
    if (valor.periodo) {
      const texto = valor.periodo === 'custom'
        ? `${valor.de || '…'} até ${valor.ate || '…'}`
        : `Últimos ${valor.periodo} dias`
      out.push({ chave: 'periodo', texto, limpar: { periodo: '', de: '', ate: '' } })
    }
    return out
  }, [valor, locais, tecnicos, colunas])

  /** Os mesmos controles nos dois tamanhos de tela; muda só onde eles aparecem. */
  const controles = (
    <>
      <Rotulo texto="Local">
        <Select className="w-full" value={valor.localId} onValueChange={(v) => set({ localId: v })}>
          <option value="">Todos os locais</option>
          <option value="sem">Sem local</option>
          {locais.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
        </Select>
      </Rotulo>

      <Rotulo texto="Técnico">
        <Select className="w-full" value={valor.tecnico} onValueChange={(v) => set({ tecnico: v })}>
          <option value="">Qualquer técnico</option>
          <option value="eu">Comigo</option>
          {fase !== 'aberto' && <option value="sem">Ainda sem técnico</option>}
          {tecnicos.filter((t) => t.id !== me?.id).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </Select>
      </Rotulo>

      {fase === 'andamento' && colunas.length > 1 && (
        <Rotulo texto="Coluna">
          <Select className="w-full" value={valor.coluna} onValueChange={(v) => set({ coluna: v })}>
            <option value="">Todas as colunas</option>
            {colunas.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
          </Select>
        </Rotulo>
      )}

      <Rotulo texto="Aberto em">
        <Select className="w-full" value={valor.periodo} onValueChange={(v) => set({ periodo: v as FiltroChamados['periodo'] })}>
          <option value="">Qualquer data</option>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="custom">Escolher datas…</option>
        </Select>
      </Rotulo>

      <Rotulo texto="Quem abriu">
        <Select className="w-full" value={valor.autor} onValueChange={(v) => set({ autor: v })}>
          <option value="">Qualquer pessoa</option>
          <option value="eu">Abertos por mim</option>
        </Select>
      </Rotulo>

      {valor.periodo === 'custom' && (
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <Rotulo texto="De">
            <input type="date" value={valor.de} onChange={(e) => set({ de: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-red-500" />
          </Rotulo>
          <Rotulo texto="Até">
            <input type="date" value={valor.ate} onChange={(e) => set({ ate: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-red-500" />
          </Rotulo>
        </div>
      )}
    </>
  )

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input
            data-busca
            value={valor.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Buscar chamado…"
            aria-label="Buscar chamados"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500"
          />
        </div>

        {/* Desktop: os filtros ficam à vista, na mesma linha. */}
        <div className="hidden flex-1 flex-wrap items-end gap-2 sm:flex [&>*]:min-w-[8.5rem]">{controles}</div>

        {/* Celular: recolhidos atrás de um botão, com o número do que está valendo. */}
        <button
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium sm:hidden ${
            ativos ? 'border-red-700 bg-red-500/10 text-red-300' : 'border-slate-700 text-slate-300'
          }`}
        >
          <SlidersHorizontal size={14} /> Filtros
          {ativos > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{ativos}</span>}
        </button>

        {ativos > 0 && (
          <button onClick={() => onChange({ ...FILTRO_VAZIO, q: valor.q })} className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200">
            Limpar
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:hidden">{controles}</div>
      )}

      {/* O que está filtrando, sempre à vista: um toque na etiqueta desfaz o filtro. */}
      {!aberto && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
          {chips.map((c) => (
            <button
              key={c.chave}
              onClick={() => set(c.limpar)}
              className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20"
            >
              {c.texto} <X size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Rotulo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{texto}</span>
      {children}
    </label>
  )
}
