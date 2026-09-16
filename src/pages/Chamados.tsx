import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, MessageSquare, User as UserIcon, Undo2, Building2, Clock, Archive, Settings2, X, Check, Search, Loader2, HandHelping, Camera, GripVertical, TriangleAlert, CheckCircle2, Phone } from 'lucide-react'
import { Button, Modal, PageHeader, Field, Input, Select, Textarea } from '@/components/ui'
import { useStore, useCan, useCurrentUser } from '@/lib/store'
import { api, assetUrl } from '@/lib/api'
import { esperaDesde, parseStatuses } from '@/lib/tickets'
import { fmtDataHora, fmtMinutos } from '@/lib/utils'
import { TicketComments } from '@/components/TicketComments'
import { PhotoInput } from '@/components/PhotoInput'
import { AtendimentoTecnico } from '@/components/AtendimentoTecnico'
import type { Registro, Ticket, TicketStatus, TicketStatusDef } from '@/lib/types'

function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

interface TForm {
  title: string
  description: string
  solicitante: string
  status: TicketStatus
  localId: string
  photos: string[]
  /** Chamado aberto a partir de um registro da linha do tempo. */
  registroId?: string
}
const emptyForm = (firstStatus: string, localId = ''): TForm => ({ title: '', description: '', solicitante: '', status: firstStatus, localId, photos: [] })

type Filtro = 'todos' | 'meus' | 'fila'

export default function Chamados() {
  const tickets = useStore((s) => s.tickets)
  const locais = useStore((s) => s.locais)
  const settings = useStore((s) => s.settings)
  const setSetting = useStore((s) => s.setSetting)
  const { addTicket, updateTicket, removeTicket, acceptTicket, releaseTicket, archiveTicket, refreshTickets, showToast } = useStore()
  const me = useCurrentUser()
  const canManage = useCan('gerenciar_chamados')
  const canCreate = useCan('criar_chamados')
  const canAccept = useCan('aceitar_chamados')
  const canManageStatus = useCan('gerenciar_status_chamados')
  const canFinish = useCan('concluir_chamados')
  const canReopen = useCan('reabrir_chamados')
  const canDelete = useCan('excluir_chamados')
  const canCorrigir = useCan('corrigir_atendimento')
  const canAttach = useCan('anexar_fotos_chamado')
  const canAtender = useCan('registrar_atendimento')
  const location = useLocation()
  const navigate = useNavigate()

  const statuses = useMemo(() => parseStatuses(settings), [settings])
  const doneKeys = useMemo(() => new Set(statuses.filter((s) => s.done).map((s) => s.key)), [statuses])
  const labelOf = (key: string) => statuses.find((s) => s.key === key)?.label ?? key

  const [params, setParams] = useSearchParams()
  const [localFilter, setLocalFilter] = useState('todos')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Ticket | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Ticket | null>(null)
  const [form, setForm] = useState<TForm>(emptyForm('aberto'))
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null)
  const [managing, setManaging] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Detalhe aberto pela URL (?t=<id>) — é para onde as notificações levam.
  const detailId = params.get('t')
  const detail = detailId ? tickets.find((t) => t.id === detailId) ?? null : null
  const openDetail = (t: Ticket) => setParams((p) => { p.set('t', t.id); return p })
  const closeDetail = () => setParams((p) => { p.delete('t'); return p })

  const ehMeu = (t: Ticket) => t.assigneeId === me.id
  const rows = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return tickets.filter((t) => {
      if (localFilter !== 'todos' && (localFilter === 'sem' ? !!t.localId : t.localId !== localFilter)) return false
      if (filtro === 'meus' && !ehMeu(t)) return false
      if (filtro === 'fila' && t.assigneeId) return false
      if (termo && !`${t.code} ${t.title} ${t.localName ?? ''} ${t.assigneeName ?? ''} ${t.createdByName}`.toLowerCase().includes(termo)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, localFilter, filtro, q, doneKeys, me.id, me.roleId])

  function openNew() {
    setForm(emptyForm(statuses[0]?.key ?? 'aberto', locais.length === 1 ? locais[0].id : ''))
    setEditing('new')
  }
  function openEdit(t: Ticket) {
    setForm({
      title: t.title, description: t.description ?? '', status: t.status,
      solicitante: t.solicitante ?? '',
      localId: t.localId ?? '',
      photos: t.photos ?? [],
    })
    setEditing(t)
  }

  // Veio da linha do tempo com "Abrir chamado": formulário já preenchido com o registro.
  useEffect(() => {
    const r = (location.state as { deRegistro?: Registro } | null)?.deRegistro
    if (!r || !canCreate) return
    setForm({
      ...emptyForm(statuses[0]?.key ?? 'aberto', r.localId ?? ''),
      title: r.descricao.split('\n')[0].slice(0, 90),
      description: r.descricao,
      solicitante: r.solicitante ?? '',
      registroId: r.id,
    })
    setEditing('new')
    navigate(location.pathname + location.search, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])
  useEffect(() => {
    const h = () => { if (canCreate) openNew() }
    window.addEventListener('shortcut:new', h)
    return () => window.removeEventListener('shortcut:new', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, statuses, locais])

  async function accept(t: Ticket) {
    try { await acceptTicket(t.id); showToast(`${t.code} é seu — preencha o atendimento`) } catch (e: any) { showToast(e?.message ?? 'Não foi possível pegar o chamado') }
  }
  const doneKey = statuses.find((s) => s.done)?.key
  async function devolver(t: Ticket) {
    try { await releaseTicket(t.id); showToast(`${t.code} voltou para a fila`) } catch (e: any) { showToast(e?.message ?? 'Não foi possível devolver o chamado') }
  }
  async function finalizar(t: Ticket) {
    try { await archiveTicket(t.id); showToast(`${t.code} finalizado — está no histórico`); if (detailId === t.id) closeDetail() }
    catch (e: any) { showToast(e?.message ?? 'Não foi possível finalizar') }
  }

  async function save() {
    if (!form.title.trim()) return showToast('Informe um título para o chamado')
    const payload: Partial<Ticket> & { title: string } = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      solicitante: form.solicitante.trim() || null,
      status: form.status,
      localId: form.localId || null,
      photos: form.photos,
    }
    setSaving(true)
    try {
      if (editing === 'new') {
        await addTicket({ ...payload, registroId: form.registroId })
        showToast('Chamado aberto')
      } else if (editing) {
        await updateTicket(editing.id, payload)
        showToast('Chamado salvo')
      }
      setEditing(null)
    } catch (e: any) {
      showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o chamado')
    } finally {
      setSaving(false)
    }
  }

  function moveTo(id: string, status: TicketStatus) {
    const t = tickets.find((x) => x.id === id)
    if (!t || t.status === status) return
    if (doneKeys.has(status) && !doneKeys.has(t.status) && !canFinish) return showToast('Você não tem permissão para concluir chamados')
    if (!doneKeys.has(status) && doneKeys.has(t.status) && !canReopen) return showToast('Você não tem permissão para reabrir chamados')
    updateTicket(id, { status }).catch((e) => showToast(e?.message ?? 'Não foi possível mover o chamado'))
  }

  const openCount = tickets.filter((t) => !doneKeys.has(t.status)).length
  const filtros: { key: Filtro; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'meus', label: 'Meus' },
    { key: 'fila', label: 'Na fila' },
  ]

  return (
    <div>
      <PageHeader
        title="Chamados"
        subtitle={`${openCount} em aberto · ${tickets.length} ativos`}
        actions={
          <>
            <Button variant="subtle" onClick={() => setHistoryOpen(true)}><Archive size={15} /> Histórico</Button>
            {canManageStatus && <Button variant="subtle" onClick={() => setManaging(true)}><Settings2 size={15} /> Colunas</Button>}
            {canCreate && <Button onClick={openNew}><Plus size={15} /> Novo chamado</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input
            data-busca
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código, título, local…"
            aria-label="Buscar chamados"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500"
          />
        </div>
        <Select value={localFilter} onValueChange={setLocalFilter} aria-label="Filtrar por local">
          <option value="todos">Todos os locais</option>
          <option value="sem">Sem local</option>
          {locais.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </Select>
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-0.5">
          {filtros.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${filtro === f.key ? 'bg-red-500/15 text-red-300' : 'text-slate-400 hover:text-slate-200'}`}
              aria-pressed={filtro === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: colunas empilhadas. Desktop (md+): lado a lado. */}
      <div className="grid grid-cols-1 gap-3 md:[grid-template-columns:var(--kb-cols)]" style={{ ['--kb-cols' as any]: `repeat(${Math.min(statuses.length, 4)}, minmax(0, 1fr))` }}>
        {statuses.map((col) => {
          const items = rows.filter((t) => t.status === col.key)
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (canManage) { e.preventDefault(); setDragOver(col.key) } }}
              onDragLeave={() => setDragOver((s) => (s === col.key ? null : s))}
              onDrop={(e) => { const id = e.dataTransfer.getData('text/ticket'); setDragOver(null); if (id) moveTo(id, col.key) }}
              className={`min-w-0 rounded-xl border p-2 ${dragOver === col.key ? 'border-red-600 bg-red-500/5' : 'border-slate-800 bg-slate-950/30'}`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-200">
                  {col.done && <Check size={13} className="text-emerald-400" />}{col.label}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <TicketCard
                    key={t.id}
                    t={t}
                    concluido={doneKeys.has(t.status)}
                    canManage={canManage}
                    canDelete={canDelete}
                    canAccept={canAccept && !t.assigneeId}
                    statuses={statuses}
                    onEdit={() => openEdit(t)}
                    onDelete={() => setDeleting(t)}
                    onMove={moveTo}
                    onAccept={() => accept(t)}
                    onDetail={() => openDetail(t)}
                    onFinish={canFinish ? () => finalizar(t) : undefined}
                  />
                ))}
                {items.length === 0 && <div className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-[12px] text-slate-600">vazio</div>}
              </div>
            </div>
          )
        })}
      </div>

      {tickets.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Nenhum chamado ativo.{canCreate && ' Clique em “Novo chamado” para abrir o primeiro.'}
        </p>
      )}

      {/* Criar / editar */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Novo chamado' : `Editar ${typeof editing === 'object' && editing ? editing.code : ''}`}
        wide
        onSubmit={save}
        footer={<><Button variant="subtle" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Salvar</Button></>}
      >
        <div className="space-y-3">
          {form.registroId && (
            <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[12px] text-sky-200/90">Aberto a partir de um registro da linha do tempo — o registro fica ligado a este chamado.</p>
          )}
          <Field label="Título"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Portão da garagem não abre" autoFocus /></Field>
          <Field label="O que aconteceu">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Relate o problema: o que foi informado, desde quando, onde exatamente…" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Solicitante" hint="quem pediu ou avisou (nome, unidade, telefone)">
              <Input value={form.solicitante} onChange={(e) => setForm({ ...form, solicitante: e.target.value })} placeholder="Ex.: Sr. Carlos, síndico — (11) 9…" />
            </Field>
            <Field label="Local">
              <Select className="w-full" value={form.localId} onValueChange={(v) => setForm({ ...form, localId: v })}>
                <option value="">— nenhum —</option>
                {locais.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </Select>
            </Field>
            {canManage && editing !== 'new' && (
              <Field label="Status">
                <Select className="w-full" value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  {statuses.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                </Select>
              </Field>
            )}
          </div>

          {canAttach && (
            <Field label="Fotos do problema"><PhotoInput photos={form.photos} onChange={(photos) => setForm({ ...form, photos })} /></Field>
          )}
        </div>
      </Modal>

      {managing && (
        <StatusManager
          statuses={statuses}
          contagem={tickets.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc }, {})}
          onClose={() => setManaging(false)}
          onSave={async (list) => {
            try {
              await setSetting('ticket_statuses', JSON.stringify(list))
              await refreshTickets()
              showToast('Colunas salvas')
              setManaging(false)
            } catch (e: any) {
              showToast(e?.message ?? 'Não foi possível salvar as colunas')
            }
          }}
        />
      )}

      {historyOpen && <HistoryModal labelOf={labelOf} onClose={() => setHistoryOpen(false)} />}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Excluir chamado"
        footer={
          <>
            <Button variant="subtle" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const alvo = deleting
                setDeleting(null)
                if (!alvo) return
                try { await removeTicket(alvo.id); if (detailId === alvo.id) closeDetail(); showToast(`${alvo.code} excluído`) }
                catch (e: any) { showToast(e?.message ?? 'Não foi possível excluir') }
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">Excluir <span className="font-medium text-slate-100">{deleting?.code} · {deleting?.title}</span>? Não dá para desfazer; fica registrado na auditoria.</p>
      </Modal>

      {/* Detalhe do chamado */}
      <Modal
        open={detail !== null}
        onClose={closeDetail}
        title={detail ? `${detail.code} · ${detail.title}` : 'Chamado'}
        wide
        footer={detail ? (
          <>
            {canDelete && <Button variant="danger" onClick={() => setDeleting(detail)}><Trash2 size={14} /> Excluir</Button>}
            {canFinish && doneKeys.has(detail.status) && <Button variant="subtle" onClick={() => finalizar(detail)}><Archive size={14} /> Finalizar</Button>}
            {canAccept && !detail.assigneeId && <Button variant="subtle" onClick={() => accept(detail)}><HandHelping size={14} /> Pegar chamado</Button>}
            {canFinish && doneKey && !doneKeys.has(detail.status) && ehMeu(detail) && (
              <Button
                variant="subtle"
                onClick={() => {
                  if (!detail.solucao?.trim()) return showToast('Preencha a solução no atendimento técnico antes de concluir')
                  moveTo(detail.id, doneKey)
                }}
              >
                <CheckCircle2 size={14} /> Concluir
              </Button>
            )}
            {detail.assigneeId && !doneKeys.has(detail.status) && (ehMeu(detail) || canCorrigir) && (
              <Button variant="subtle" onClick={() => devolver(detail)} title="Solta o chamado para outro técnico pegar"><Undo2 size={14} /> Devolver à fila</Button>
            )}
            {canManage && <Button onClick={() => { const d = detail; closeDetail(); openEdit(d) }}><Pencil size={14} /> Editar</Button>}
          </>
        ) : undefined}
      >
        {detail && (
          <DetalheChamado
            t={detail}
            labelOf={labelOf}
            concluido={doneKeys.has(detail.status)}
            statuses={statuses}
            canMove={canManage}
            onMove={moveTo}
            onRefresh={() => refreshTickets()}
            // Quem pegou preenche; administrador e gestor corrigem.
            podeAtender={canAtender && (ehMeu(detail) || canCorrigir)}
          />
        )}
      </Modal>

      {/* Link de notificação para chamado que não está mais na lista ativa. */}
      {detailId && !detail && tickets.length > 0 && (
        <Modal open onClose={closeDetail} title="Chamado não encontrado" footer={<Button variant="subtle" onClick={closeDetail}>Fechar</Button>}>
          <p className="text-sm text-slate-300">Este chamado não está mais entre os ativos — pode ter sido finalizado (veja o Histórico) ou excluído.</p>
        </Modal>
      )}
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-200">{children}</div>
    </div>
  )
}

function DetalheChamado({ t, labelOf, concluido, statuses, canMove, onMove, onRefresh, podeAtender }: {
  t: Ticket
  labelOf: (k: string) => string
  concluido: boolean
  statuses: TicketStatusDef[]
  canMove: boolean
  onMove: (id: string, s: string) => void
  onRefresh: () => void
  podeAtender: boolean
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {canMove ? (
          <Select value={t.status} onValueChange={(v) => onMove(t.id, v)} className="py-1 text-xs" aria-label="Status">
            {statuses.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
          </Select>
        ) : (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{labelOf(t.status)}</span>
        )}
        {!t.assigneeId && !concluido && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
            <HandHelping size={11} /> na fila há {esperaDesde(t.createdAt)}
          </span>
        )}
      </div>
      {t.description && <p className="whitespace-pre-wrap text-slate-300">{t.description}</p>}
      <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
        <Info label="Local">{t.localName ?? '—'}</Info>
        <Info label="Solicitante">{t.solicitante || '—'}</Info>
        <Info label="Aberto por">{t.createdByName} · {fmtDataHora(t.createdAt)}</Info>
        <Info label="Técnico">{t.assigneeName ?? 'ninguém pegou ainda'}</Info>
        {t.resolvedAt && <Info label="Concluído em">{fmtDataHora(t.resolvedAt)}</Info>}
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">Fotos do problema</div>
        <PhotoInput photos={t.photos ?? []} />
      </div>
      <AtendimentoTecnico t={t} podeEditar={podeAtender} onSaved={onRefresh} />
      <div className="border-t border-slate-800 pt-3">
        <TicketComments ticketId={t.id} onCountChange={onRefresh} />
      </div>
    </div>
  )
}

function TicketCard({ t, concluido, canManage, canDelete, canAccept, statuses, onEdit, onDelete, onMove, onAccept, onDetail, onFinish }: {
  t: Ticket
  concluido: boolean
  canManage: boolean
  canDelete: boolean
  canAccept: boolean
  statuses: TicketStatusDef[]
  onEdit: () => void
  onDelete: () => void
  onMove: (id: string, s: TicketStatus) => void
  onAccept: () => void
  onDetail: () => void
  onFinish?: () => void
}) {
  const allPhotos = [...(t.photos ?? []), ...(t.donePhotos ?? [])]
  const thumbs = allPhotos.slice(0, 4)
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }
  return (
    <div
      draggable={canManage}
      onDragStart={(e) => e.dataTransfer.setData('text/ticket', t.id)}
      onClick={onDetail}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onDetail() }}
      tabIndex={0}
      role="button"
      aria-label={`${t.code} ${t.title}`}
      className={`rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 outline-none hover:border-red-700/50 focus-visible:border-red-600 ${canManage ? 'md:cursor-grab md:active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-slate-500">{t.code}</span>
            {!t.assigneeId && !concluido && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 text-[9px] font-medium text-amber-300" title="Tempo esperando um técnico pegar">
                na fila há {esperaDesde(t.createdAt)}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium text-slate-100">{t.title}</div>
        </div>
        {(canManage || canDelete) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {canManage && <button onClick={stop(onEdit)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Editar"><Pencil size={13} /></button>}
            {canDelete && <button onClick={stop(onDelete)} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Excluir"><Trash2 size={13} /></button>}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        {t.localName && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {t.localName}</span>}
        {!!t.commentCount && <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> {t.commentCount}</span>}
        {!!t.minutosTotais && <span className="inline-flex items-center gap-1" title="Tempo no local"><Clock size={11} /> {fmtMinutos(t.minutosTotais)}</span>}
        {t.solicitante && <span className="inline-flex min-w-0 items-center gap-1 truncate"><Phone size={11} /> {t.solicitante}</span>}
      </div>

      {thumbs.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1">
          {thumbs.map((src) => (<img key={src} src={assetUrl(src)} alt="" loading="lazy" className="h-9 w-9 rounded border border-slate-800 object-cover" />))}
          {allPhotos.length > thumbs.length && (
            <span className="inline-flex h-9 items-center gap-1 rounded border border-slate-800 px-1.5 text-[10px] text-slate-500"><Camera size={10} /> +{allPhotos.length - thumbs.length}</span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-800/60 pt-1.5 text-[10px] text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1 truncate"><Clock size={10} /> {fmtDataHora(t.createdAt)} · {t.createdByName}</span>
        {t.assigneeName ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-slate-400"><UserIcon size={11} /> {t.assigneeName}</span>
        ) : (
          <span className="shrink-0 text-amber-400/80">sem técnico</span>
        )}
      </div>

      {canAccept && (
        <button onClick={stop(onAccept)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-800/60 bg-emerald-500/10 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/20">
          <HandHelping size={13} /> Pegar este chamado
        </button>
      )}

      {concluido && onFinish && (
        <button onClick={stop(onFinish)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-slate-700" title="Manda para o histórico agora, sem esperar a semana">
          <Archive size={13} /> Finalizar chamado
        </button>
      )}

      {/* Mobile: mover status (arrastar é só no desktop) */}
      {canManage && (
        <div className="mt-2 md:hidden" onClick={(e) => e.stopPropagation()}>
          <Select className="w-full" value={t.status} onValueChange={(v) => onMove(t.id, v)} aria-label="Mover para">
            {statuses.map((c) => (<option key={c.key} value={c.key}>Mover para: {c.label}</option>))}
          </Select>
        </div>
      )}
    </div>
  )
}

// Colunas: criar, renomear, remover, reordenar. A coluna de conclusão fica sempre por último.
function StatusManager({ statuses, contagem, onClose, onSave }: {
  statuses: TicketStatusDef[]
  contagem: Record<string, number>
  onClose: () => void
  onSave: (list: TicketStatusDef[]) => void
}) {
  const [list, setList] = useState<TicketStatusDef[]>(statuses.map((s) => ({ ...s })))
  const [label, setLabel] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  function add() {
    const l = label.trim()
    if (!l) return
    let key = slugify(l) || `status-${list.length + 1}`
    if (list.some((s) => s.key === key)) key = `${key}-${list.length + 1}`
    const at = list.findIndex((s) => s.done)
    const next = [...list]
    next.splice(at < 0 ? next.length : at, 0, { key, label: l })
    setList(next)
    setLabel('')
  }
  const rename = (i: number, l: string) => setList(list.map((s, idx) => (idx === i ? { ...s, label: l } : s)))
  const remove = (i: number) => setList(list.filter((_, idx) => idx !== i))
  function reorder(from: number, to: number) {
    setList((l) => {
      const c = [...l]
      const [m] = c.splice(from, 1)
      c.splice(to, 0, m)
      const d = c.findIndex((s) => s.done)
      if (d >= 0 && d !== c.length - 1) c.push(...c.splice(d, 1))
      return c
    })
  }
  const somem = statuses.filter((s) => !list.some((x) => x.key === s.key) && (contagem[s.key] ?? 0) > 0)
  const quantos = somem.reduce((n, s) => n + (contagem[s.key] ?? 0), 0)
  const valido = list.length > 0 && list.every((s) => s.label.trim())

  return (
    <Modal
      open
      onClose={onClose}
      title="Colunas dos chamados"
      footer={<><Button variant="subtle" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(list)} disabled={!valido}>Salvar</Button></>}
    >
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500">Arraste pela alça para reordenar. A última coluna é a de conclusão — os chamados dela vão para o histórico depois de 1 semana (ou na hora, com “Finalizar”).</p>
        <div className="space-y-1.5">
          {list.map((s, i) => (
            <div
              key={s.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null) }}
              className={`flex items-center gap-2 rounded-lg border bg-slate-950/40 px-2 py-1.5 ${dragIdx === i ? 'border-red-600 opacity-60' : 'border-slate-800'}`}
            >
              <span
                draggable={!s.done}
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => setDragIdx(null)}
                className={s.done ? 'shrink-0 text-slate-700' : 'shrink-0 cursor-grab text-slate-600 hover:text-slate-300 active:cursor-grabbing'}
                title={s.done ? 'A coluna de conclusão fica sempre por último' : 'Arraste para reordenar'}
              >
                <GripVertical size={16} />
              </span>
              <Input value={s.label} onChange={(e) => rename(i, e.target.value)} className="flex-1" aria-label="Nome da coluna" />
              {s.done ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"><Archive size={11} /> conclui</span>
              ) : (
                <>
                  {(contagem[s.key] ?? 0) > 0 && <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{contagem[s.key]}</span>}
                  <button onClick={() => remove(i)} className="shrink-0 rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Remover coluna"><X size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        {quantos > 0 && (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            <span>{quantos} chamado(s) em {somem.map((s) => `"${s.label}"`).join(', ')} vão para <span className="font-medium">"{list[0]?.label}"</span> ao salvar. Nenhum chamado é apagado.</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Nova coluna (ex.: Aguardando peça)" className="flex-1" />
          <Button variant="subtle" onClick={add}><Plus size={15} /> Adicionar</Button>
        </div>
      </div>
    </Modal>
  )
}

// Histórico: chamados finalizados ou concluídos há mais de 1 semana.
function HistoryModal({ labelOf, onClose }: { labelOf: (k: string) => string; onClose: () => void }) {
  const [items, setItems] = useState<Ticket[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    api.ticketsHistory().then((r) => { if (alive) setItems(r) }).catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [])

  const filtered = (items ?? []).filter((t) => `${t.code} ${t.title} ${t.localName ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <Modal open onClose={onClose} title="Histórico de chamados" wide footer={<Button variant="subtle" onClick={onClose}>Fechar</Button>}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, título ou local…" aria-label="Buscar no histórico" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500" />
        </div>
        {items === null ? (
          <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 px-3 py-8 text-center text-sm text-slate-500">Nenhum chamado no histórico.</div>
        ) : (
          <div className="max-h-[55vh] space-y-1.5 overflow-auto">
            {filtered.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="font-mono text-[11px] text-red-400">{t.code}</span>
                    <span className="truncate text-sm font-medium text-slate-100">{t.title}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{labelOf(t.status)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                  {t.localName && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {t.localName}</span>}
                  <span className="inline-flex items-center gap-1"><Clock size={11} /> aberto {fmtDataHora(t.createdAt)}</span>
                  {t.resolvedAt && <span className="inline-flex items-center gap-1 text-emerald-500/80"><Check size={11} /> concluído {fmtDataHora(t.resolvedAt)}</span>}
                  {t.assigneeName && <span className="inline-flex items-center gap-1"><UserIcon size={11} /> {t.assigneeName}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
