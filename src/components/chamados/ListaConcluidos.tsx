import { useEffect, useMemo, useState } from 'react'
import { Loader2, Building2, Clock, User as UserIcon, Check, ChevronDown, ChevronRight, ChevronLeft, Package, Wrench, MessageSquare, CalendarDays, Users, Phone } from 'lucide-react'
import { Button, EmptyState, Modal, Select } from '@/components/ui'
import { useMobile } from '@/lib/useMediaQuery'
import { PhotoInput } from '@/components/PhotoInput'
import { useStore, useCurrentUser } from '@/lib/store'
import { aplicarFiltros, type FiltroChamados } from './FiltrosChamados'
import { api } from '@/lib/api'
import { fmtDataHora, fmtMinutos } from '@/lib/utils'
import type { Ticket } from '@/lib/types'

/** Data que manda no histórico: quando o chamado foi concluído (ou arquivado à mão). */
const dataDoFim = (t: Ticket) => t.resolvedAt ?? t.archivedAt ?? t.updatedAt
const DIA_MS = 86400000

function rotuloDia(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(Date.now() - DIA_MS)
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (mesmo(d, hoje)) return 'Hoje'
  if (mesmo(d, ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

/** Segunda-feira da semana de uma data, às 00:00. */
function inicioDaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dia = (x.getDay() + 6) % 7 // segunda = 0
  x.setDate(x.getDate() - dia)
  return x
}
const curto = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/**
 * CONCLUÍDOS: uma lista só. Recém-concluídos e histórico antigo aparecem juntos e iguais
 * — concluído é concluído, sem estado "arquivado" para a pessoa administrar. Navega
 * semana a semana; "Tudo" solta a lista inteira.
 */
export function ListaConcluidos({ rows, filtros, labelOf, podeHistorico, onDetail }: {
  /** Concluídos que ainda estão no quadro, já filtrados. */
  rows: Ticket[]
  /** Os mesmos filtros da barra de cima, aplicados também ao histórico. */
  filtros: FiltroChamados
  labelOf: (k: string) => string
  podeHistorico: boolean
  onDetail: (t: Ticket) => void
}) {
  const showToast = useStore((s) => s.showToast)
  const me = useCurrentUser()

  const [historico, setHistorico] = useState<Ticket[] | null>(null)
  const [modo, setModo] = useState<'semana' | 'tudo' | 'custom'>('semana')
  const [semana, setSemana] = useState<Date>(() => inicioDaSemana(new Date()))
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const mobile = useMobile()

  async function carregarHistorico() {
    if (!podeHistorico) return setHistorico([])
    try { setHistorico(await api.ticketsHistory()) } catch { setHistorico([]) }
  }
  useEffect(() => { carregarHistorico() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [podeHistorico])

  // O histórico vem cru do servidor; aplica os mesmos filtros da barra de cima.
  const arquivados = useMemo(
    () => (historico ?? []).filter((t) => aplicarFiltros(t, filtros, me?.id ?? '')),
    [historico, filtros, me?.id],
  )

  const todos = useMemo(() => {
    const mapa = new Map<string, Ticket>()
    for (const t of [...rows, ...arquivados]) mapa.set(t.id, t)
    return [...mapa.values()].sort((a, b) => new Date(dataDoFim(b)).getTime() - new Date(dataDoFim(a)).getTime())
  }, [rows, arquivados])

  const fimDaSemana = new Date(semana.getTime() + 7 * DIA_MS)
  const naSemana = useMemo(() => {
    if (modo === 'tudo') return todos
    if (modo === 'custom') {
      const ini = de ? new Date(`${de}T00:00:00`).getTime() : -Infinity
      const fim = ate ? new Date(`${ate}T23:59:59`).getTime() : Infinity
      return todos.filter((t) => {
        const d = new Date(dataDoFim(t)).getTime()
        return d >= ini && d <= fim
      })
    }
    return todos.filter((t) => {
      const d = new Date(dataDoFim(t)).getTime()
      return d >= semana.getTime() && d < fimDaSemana.getTime()
    })
  }, [todos, modo, semana, fimDaSemana, de, ate])

  const porDia = useMemo(() => {
    const grupos: { dia: string; itens: Ticket[] }[] = []
    for (const t of naSemana) {
      const dia = new Date(dataDoFim(t)).toDateString()
      const g = grupos[grupos.length - 1]
      if (g && g.dia === dia) g.itens.push(t)
      else grupos.push({ dia, itens: [t] })
    }
    return grupos
  }, [naSemana])

  // Semanas anteriores que ainda têm chamado — evita ficar clicando no vazio até 2019.
  const maisAntigo = todos.length ? new Date(dataDoFim(todos[todos.length - 1])) : null
  const temAnterior = !!(maisAntigo && maisAntigo.getTime() < semana.getTime())
  const temProxima = fimDaSemana.getTime() < Date.now()

  /** Só a lista ativa abre o chamado inteiro; o histórico antigo é leitura aqui mesmo. */
  const estaNaListaAtiva = (t: Ticket) => rows.some((r) => r.id === t.id)
  const abertoNoMobile = aberto ? todos.find((t) => t.id === aberto) ?? null : null

  if (historico === null) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>

  return (
    <div>
      <div className="mb-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {modo === 'semana' ? (
              <>
                <button
                  onClick={() => setSemana((x) => new Date(x.getTime() - 7 * DIA_MS))}
                  disabled={!temAnterior}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
                  aria-label="Semana anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="inline-flex items-center gap-1.5 px-1 text-[12px] text-slate-300">
                  <CalendarDays size={13} className="text-slate-500" />
                  {curto(semana)} a {curto(new Date(fimDaSemana.getTime() - DIA_MS))}
                </span>
                <button
                  onClick={() => setSemana((x) => new Date(x.getTime() + 7 * DIA_MS))}
                  disabled={!temProxima}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
                  aria-label="Próxima semana"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 text-[12px] text-slate-300">
                <CalendarDays size={13} className="text-slate-500" />
                {modo === 'tudo' ? 'Todo o histórico' : 'Período escolhido'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">{naSemana.length} de {todos.length}</span>
            <Select
              className="py-1 text-xs"
              value={modo}
              onValueChange={(v) => setModo(v as typeof modo)}
              aria-label="Período"
            >
              <option value="semana">Por semana</option>
              <option value="custom">Escolher datas</option>
              <option value="tudo">Tudo</option>
            </Select>
          </div>
        </div>

        {modo === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-slate-500">De</span>
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-red-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-slate-500">Até</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-red-500" />
            </label>
          </div>
        )}
      </div>

      {porDia.length === 0 ? (
        <EmptyState>
          {todos.length === 0
            ? 'Nada concluído ainda.'
            : modo === 'semana' ? 'Nenhum chamado concluído nesta semana — use as setas, ou troque o período.' : 'Nenhum chamado no período escolhido.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {porDia.map((g) => (
            <section key={g.dia}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 first-letter:uppercase">{rotuloDia(dataDoFim(g.itens[0]))}</h2>
              <ol className="relative ml-2 border-l border-slate-800">
                {g.itens.map((t) => {
                  const expandido = aberto === t.id
                  const naLista = estaNaListaAtiva(t)
                  return (
                    <li key={t.id} className="relative mb-3 ml-5 last:mb-0">
                      <span className="absolute -left-[27px] top-3.5 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] bg-emerald-500" />
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50">
                        <button onClick={() => setAberto(expandido ? null : t.id)} aria-expanded={expandido} className="flex w-full items-start gap-2 px-3 py-2.5 text-left">
                          {expandido ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-slate-500" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-slate-500" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] text-red-400">{t.code}</span>
                              <span className="min-w-0 truncate text-sm font-medium text-slate-100">{t.title}</span>
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">{labelOf(t.status)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                              {t.localName && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {t.localName}</span>}
                              {t.resolvedAt && <span className="inline-flex items-center gap-1 text-emerald-500/80"><Check size={11} /> {fmtDataHora(t.resolvedAt)}</span>}
                              {t.assigneeName && <span className="inline-flex items-center gap-1"><UserIcon size={11} /> {t.assigneeName}</span>}
                              {!!t.minutosTotais && <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtMinutos(t.minutosTotais)}</span>}
                              {!!t.commentCount && <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> {t.commentCount}</span>}
                            </div>
                          </div>
                        </button>

                        {/* No desktop o chamado abre ali mesmo; no celular vira modal —
                            ler um chamado inteiro dentro de uma lista espremida não funciona. */}
                        {expandido && !mobile && (
                          <ConteudoConcluido t={t} podeAbrir={naLista} onDetail={() => onDetail(t)} />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {!podeHistorico && (
        <p className="mt-4 text-center text-[11px] text-slate-600">Você vê os concluídos recentes. O histórico completo precisa da permissão “ver arquivados”.</p>
      )}

      {mobile && abertoNoMobile && (
        <Modal
          open
          wide
          onClose={() => setAberto(null)}
          tituloTexto={`${abertoNoMobile.code} · ${abertoNoMobile.title}`}
          // Mesmo cabeçalho do chamado aberto: código pequeno em cima, título embaixo e o
          // estado logo abaixo dele, tudo fixo no topo.
          title={
            <div className="min-w-0">
              <div className="font-mono text-[11px] tracking-wide text-red-400/80">{abertoNoMobile.code}</div>
              <h2 className="truncate text-[15px] font-semibold leading-tight text-slate-100">{abertoNoMobile.title}</h2>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <Check size={11} /> {labelOf(abertoNoMobile.status)}
                {abertoNoMobile.resolvedAt ? ` · ${fmtDataHora(abertoNoMobile.resolvedAt)}` : ''}
              </span>
            </div>
          }
          fechar="Fechar"
          footer={estaNaListaAtiva(abertoNoMobile)
            ? <Button onClick={() => { setAberto(null); onDetail(abertoNoMobile) }}>Abrir chamado</Button>
            : undefined}
        >
          <ConteudoConcluido t={abertoNoMobile} podeAbrir={false} onDetail={() => { setAberto(null); onDetail(abertoNoMobile) }} />
        </Modal>
      )}
    </div>
  )
}

function Bloco({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <p className="whitespace-pre-wrap text-[13px] text-slate-200">{valor}</p>
    </div>
  )
}


/** O chamado concluído por inteiro: o que aconteceu, o atendimento, as horas e as fotos. */
function ConteudoConcluido({ t, podeAbrir, onDetail }: {
  t: Ticket
  /** Chamado ainda na lista ativa: dá para abrir o chamado inteiro. */
  podeAbrir: boolean
  onDetail: () => void
}) {
  return (
  <div className="space-y-3 border-t border-slate-800 px-3 py-3 text-[13px]">
    {/* Mesma linha do chamado aberto: local · solicitante · quem abriu · responsável,
        separados por ponto. Quatro caixinhas para quatro palavras era desperdício de tela. */}
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-slate-400">
      <span className="inline-flex items-center gap-1"><Building2 size={12} className="text-slate-500" />{t.localName ?? 'sem local'}</span>
      <span className="text-slate-700">·</span>
      <span className="inline-flex items-center gap-1"><Phone size={12} className="text-slate-500" />{t.solicitante || 'sem solicitante'}</span>
      <span className="text-slate-700">·</span>
      <span className="inline-flex items-center gap-1"><Clock size={12} className="text-slate-500" />{t.createdByName} · {fmtDataHora(t.createdAt)}</span>
      {t.assigneeName && (
        <>
          <span className="text-slate-700">·</span>
          <span className="inline-flex items-center gap-1 text-slate-300">
            <UserIcon size={12} className="text-slate-500" />{t.assigneeName}
            {!!t.sharedWith?.length && (
              <span className="inline-flex items-center gap-0.5 text-slate-500" title={t.sharedWith.map((x) => x.name).join(', ')}>
                <Users size={11} />+{t.sharedWith.length}
              </span>
            )}
          </span>
        </>
      )}
    </div>

    {t.description && (
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">O que aconteceu</div>
        <p className="whitespace-pre-wrap text-slate-300">{t.description}</p>
      </div>
    )}
  
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
      <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-200"><Wrench size={13} className="text-red-400" /> Atendimento técnico</div>
      <div className="space-y-2">
        <Bloco label="Análise" valor={t.analise} />
        <Bloco label="Solução" valor={t.solucao} />
        <Bloco label="Ações tomadas" valor={t.acoesTomadas} />
        {!!t.visitas?.length && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Idas ao local</div>
            <div className="mt-1 space-y-1">
              {t.visitas.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-900/60 px-2 py-1 text-[12px]">
                  <span className="text-slate-300">{new Date(v.data + 'T12:00').toLocaleDateString('pt-BR')}{v.inicio && v.fim ? ` · ${v.inicio} → ${v.fim}` : ''}</span>
                  <span className="text-slate-400">{v.tecnicoNome} · <span className="font-medium text-slate-200">{fmtMinutos(v.minutos)}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!!t.itens?.length && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Itens</div>
            <div className="mt-1 space-y-1">
              {t.itens.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded bg-slate-900/60 px-2 py-1 text-[12px]">
                  <span className="min-w-0 truncate text-slate-200"><Package size={11} className="mr-1 inline text-slate-500" />{i.quantidade}× {i.descricao}</span>
                  <span className="shrink-0 text-slate-400">{i.tipo}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  
    {!!(t.photos?.length || t.donePhotos?.length) && (
      <div className="space-y-2">
        {!!t.photos?.length && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Fotos do problema</div>
            <PhotoInput photos={t.photos} />
          </div>
        )}
        {!!t.donePhotos?.length && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Fotos finais</div>
            <PhotoInput photos={t.donePhotos} />
          </div>
        )}
      </div>
    )}
  
    {podeAbrir && (
      <div className="flex justify-end border-t border-slate-800 pt-2">
        <Button size="sm" variant="subtle" onClick={() => onDetail()}>Abrir chamado</Button>
      </div>
    )}
  </div>
  )
}
