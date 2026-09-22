import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, MessageSquare, Undo2, Building2, Clock, Settings2, X, Search, Loader2, HandHelping, Camera, GripVertical, TriangleAlert, CheckCircle2, Phone, Ban, MapPin, Users, Wrench, CalendarClock, ArrowRight, MoveRight, MessagesSquare, ArrowRightLeft, Navigation, Copy } from 'lucide-react'
import { Button, EmptyState, Modal, PageHeader, Field, FieldBox, Input, Select, Textarea } from '@/components/ui'
import { useStore, useCan, useCurrentUser } from '@/lib/store'
import { useMobile } from '@/lib/useMediaQuery'
import { api, assetUrl } from '@/lib/api'
import { coresDoStatus, esperaDesde, FASES, faseDoTicket, paraInputLocal, parseStatuses } from '@/lib/tickets'
import { fmtDataHora, fmtMinutos } from '@/lib/utils'
import { PhotoInput } from '@/components/PhotoInput'
import { AtendimentoTecnico, BotaoPonto, minutosDoTexto, ModalAtendimento } from '@/components/AtendimentoTecnico'
import { ChatChamado } from '@/components/chamados/ChatChamado'
import { LocalSelect, mapsUrl } from '@/components/LocalSelect'
import { CompartilharChamado } from '@/components/CompartilharChamado'
import { ListaConcluidos } from '@/components/chamados/ListaConcluidos'
import { aplicarFiltros, FiltrosChamados, FILTRO_VAZIO, type FiltroChamados } from '@/components/chamados/FiltrosChamados'
import { AvatarPessoa } from '@/components/Pessoa'
import { SiglaLocal } from '@/components/SiglaLocal'
import type { FaseChamado, Registro, TecnicoRef, Ticket, TicketStatus, TicketStatusDef, Visita } from '@/lib/types'

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
  /** Serviço que já foi feito: nasce concluído, no nome de quem está registrando. */
  jaRealizado: boolean
  realizadoEm: string
  /** Tempo no local do serviço já realizado ("1:30" ou "1,5"): vira a ida do atendimento. */
  duracao: string
  /** O que precisa ser feito — escrito por quem abre, para quem for pegar. */
  servico: string
  solucao: string
  acoesTomadas: string
  /** Datas do chamado (só para quem tem `ajustar_datas_chamado`). */
  createdAt: string
  resolvedAt: string
}
const emptyForm = (firstStatus: string, localId = ''): TForm => ({
  title: '', description: '', solicitante: '', status: firstStatus, localId, photos: [],
  jaRealizado: false, realizadoEm: agoraLocal(), duracao: '', servico: '', solucao: '', acoesTomadas: '', createdAt: '', resolvedAt: '',
})
/** Campos de data do chamado são data E hora: "ontem" sem a hora não diz quando foi. */
const agoraLocal = () => paraInputLocal(new Date().toISOString())
const paraIso = (local: string) => (local ? new Date(local).toISOString() : '')

const TITULO: Record<FaseChamado, { titulo: string; subtitulo: string }> = {
  aberto: { titulo: 'Abertos', subtitulo: 'A fila — chamados esperando um técnico pegar' },
  andamento: { titulo: 'Em andamento', subtitulo: 'O que está sendo atendido agora, por coluna' },
  concluido: { titulo: 'Concluídos', subtitulo: 'O que foi entregue — do mais recente ao histórico' },
}

/**
 * Uma tela por fase do chamado (abertos / em andamento / concluídos). O que é comum —
 * detalhe, formulário, cancelamento, exclusão — vive aqui uma vez só; o corpo é que muda.
 */
export default function Chamados({ fase }: { fase: FaseChamado }) {
  const tickets = useStore((s) => s.tickets)
  const locais = useStore((s) => s.locais)
  const settings = useStore((s) => s.settings)
  const setSetting = useStore((s) => s.setSetting)
  const { addTicket, updateTicket, removeTicket, cancelTicket, acceptTicket, releaseTicket, transferirTicket, refreshTickets, showToast } = useStore()
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
  const canComentar = useCan('comentar_chamados')
  const canCancel = useCan('cancelar_chamados')
  const canShare = useCan('compartilhar_chamados')
  const canDatas = useCan('ajustar_datas_chamado')
  const canServico = useCan('definir_servico')
  const canHistorico = useCan('ver_arquivados')
  const canEditarConcluido = useCan('editar_concluidos')
  const location = useLocation()
  const navigate = useNavigate()

  const statuses = useMemo(() => parseStatuses(settings), [settings])
  const doneKeys = useMemo(() => new Set(statuses.filter((s) => s.done).map((s) => s.key)), [statuses])
  const labelOf = (key: string) => statuses.find((s) => s.key === key)?.label ?? key
  // Colunas desta tela: uma só em Abertos e Concluídos, quantas precisar em Em andamento.
  const colunas = useMemo(() => statuses.filter((s) => s.fase === fase), [statuses, fase])
  const entrada = statuses.find((s) => s.fase === 'aberto') ?? statuses[0]

  const [params, setParams] = useSearchParams()
  const [filtros, setFiltros] = useState<FiltroChamados>(FILTRO_VAZIO)
  const [editing, setEditing] = useState<Ticket | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Ticket | null>(null)
  const [canceling, setCanceling] = useState<Ticket | null>(null)
  const [motivo, setMotivo] = useState('')
  // O atendimento é preenchido num modal por cima do chamado (no celular, tela cheia).
  const [atendendo, setAtendendo] = useState<Ticket | null>(null)
  // A conversa é janela própria: quem está em campo não rola o atendimento para ler recado.
  const [conversando, setConversando] = useState<Ticket | null>(null)
  const [passando, setPassando] = useState<Ticket | null>(null)
  const mobile = useMobile()
  // No celular o quadro não cabe lado a lado: cada coluna vira uma aba.
  const [colunaAtiva, setColunaAtiva] = useState('')
  // No celular não se arrasta cartão: mover é por uma listinha de colunas.
  const [movendo, setMovendo] = useState<Ticket | null>(null)
  const [form, setForm] = useState<TForm>(emptyForm('aberto'))
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null)
  const [managing, setManaging] = useState(false)

  // Detalhe aberto pela URL (?t=<id>) — é para onde as notificações levam.
  const detailId = params.get('t')
  const naLista = detailId ? tickets.find((t) => t.id === detailId) ?? null : null
  /**
   * Concluído antigo não está na lista ativa. Em vez de dizer "não encontrado", o app
   * busca o chamado pelo id — é o que faz o histórico abrir igual ao resto.
   */
  const [detalheRemoto, setDetalheRemoto] = useState<Ticket | null>(null)
  const [buscandoDetalhe, setBuscandoDetalhe] = useState(false)
  useEffect(() => {
    if (!detailId || naLista) { setDetalheRemoto(null); return }
    if (detalheRemoto?.id === detailId) return
    let vivo = true
    setBuscandoDetalhe(true)
    api.ticket(detailId)
      .then((t) => { if (vivo) setDetalheRemoto(t) })
      .catch(() => { if (vivo) setDetalheRemoto(null) })
      .finally(() => { if (vivo) setBuscandoDetalhe(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, naLista])
  const detail = naLista ?? (detalheRemoto?.id === detailId ? detalheRemoto : null)
  const recarregarDetalhe = () => {
    refreshTickets()
    if (detailId && !naLista) api.ticket(detailId).then(setDetalheRemoto).catch(() => {})
  }
  const openDetail = (t: Ticket) => setParams((p) => { p.set('t', t.id); return p })
  const closeDetail = () => setParams((p) => { p.delete('t'); return p })

  const ehMeu = (t: Ticket) => t.assigneeId === me.id
  const rows = useMemo(
    () => tickets.filter((t) => faseDoTicket(statuses, t) === fase && aplicarFiltros(t, filtros, me.id)),
    [tickets, filtros, statuses, fase, me.id],
  )

  function openNew() {
    setForm(emptyForm(entrada?.key ?? 'aberto', locais.length === 1 ? locais[0].id : ''))
    setEditing('new')
  }
  function openEdit(t: Ticket) {
    setForm({
      ...emptyForm(t.status, t.localId ?? ''),
      title: t.title, description: t.description ?? '', status: t.status,
      solicitante: t.solicitante ?? '',
      photos: t.photos ?? [],
      createdAt: paraInputLocal(t.createdAt),
      resolvedAt: paraInputLocal(t.resolvedAt),
    })
    setEditing(t)
  }

  /**
   * Quem pode cancelar este chamado: a permissão, ou quem abriu enquanto ele ainda está
   * na fila — desfazer o chamado que você mesmo acabou de abrir não exige ser gestor.
   */
  /** Chamado concluído é registro fechado: mexer nele exige permissão. */
  const podeMexer = (t: Ticket) => !doneKeys.has(t.status) || canEditarConcluido

  function podeExcluir(t: Ticket): boolean {
    if (canDelete) return true
    // Quem abriu desfaz o próprio chamado enquanto ninguém pegou (o conteúdo fica na auditoria).
    return t.createdById === me.id && !t.assigneeId && !doneKeys.has(t.status)
  }
  function podeCancelar(t: Ticket): boolean {
    if (canCancel) return true
    return t.createdById === me.id && !t.assigneeId && !doneKeys.has(t.status)
  }
  async function cancelar() {
    const alvo = canceling
    setCanceling(null)
    if (!alvo) return
    try {
      await cancelTicket(alvo.id, motivo.trim() || undefined)
      if (detailId === alvo.id) closeDetail()
      showToast(`${alvo.code} cancelado — fica registrado na auditoria`)
    } catch (e: any) {
      showToast(e?.message ?? 'Não foi possível cancelar')
    } finally {
      setMotivo('')
    }
  }

  // Veio da linha do tempo com "Abrir chamado": formulário já preenchido com o registro.
  useEffect(() => {
    const r = (location.state as { deRegistro?: Registro } | null)?.deRegistro
    if (!r || !canCreate) return
    setForm({
      ...emptyForm(entrada?.key ?? 'aberto', r.localId ?? ''),
      title: (r.titulo || r.descricao.split('\n')[0]).slice(0, 90),
      description: r.descricao || r.titulo,
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

  /**
   * O chamado mudou de fase: a tela vai atrás dele. Sem isso a pessoa clica em "pegar",
   * o cartão some da frente dela e ela não sabe para onde ele foi.
   */
  function irParaFase(destino: FaseChamado, manterDetalhe: string | null = null) {
    if (destino === fase) return
    const rota = FASES.find((f) => f.id === destino)?.rota ?? '/abertos'
    navigate(manterDetalhe ? `${rota}?t=${manterDetalhe}` : rota)
  }

  async function accept(t: Ticket) {
    try {
      await acceptTicket(t.id)
      showToast(`${t.code} é seu — preencha o atendimento`)
      // Pegar joga o chamado em "Em andamento": leva quem pegou junto, com o chamado aberto.
      irParaFase('andamento', t.id)
    } catch (e: any) { showToast(e?.message ?? 'Não foi possível pegar o chamado') }
  }
  const doneKey = statuses.find((s) => s.done)?.key
  async function devolver(t: Ticket) {
    try {
      await releaseTicket(t.id)
      showToast(`${t.code} voltou para a fila`)
      irParaFase('aberto', t.id)
    } catch (e: any) { showToast(e?.message ?? 'Não foi possível devolver o chamado') }
  }
  /** Conclui o chamado e leva para a lista dos concluídos. */
  async function concluir(t: Ticket) {
    if (!doneKey) return showToast('O quadro não tem coluna de conclusão')
    if (!t.solucao?.trim()) {
      showToast('Escreva a solução do atendimento antes de concluir')
      return setAtendendo(t)
    }
    try {
      await updateTicket(t.id, { status: doneKey })
      showToast(`${t.code} concluído`)
      closeDetail()
      irParaFase('concluido')
    } catch (e: any) { showToast(e?.message ?? 'Não foi possível concluir o chamado') }
  }

  /**
   * A ÚNICA ação que faz sentido agora, com o nome do que vai acontecer. Em Abertos é
   * pegar; no meio do caminho é ir para a próxima coluna; na última, é concluir. Isso
   * substituiu o seletor de "mover para", que obrigava a escolher entre colunas que a
   * pessoa nem sabia o que eram.
   */
  function proximaEtapa(t: Ticket): { label: string; icone: 'pegar' | 'mover' | 'concluir'; acao: () => void } | null {
    const f = faseDoTicket(statuses, t)
    if (f === 'aberto') {
      if (!canAccept || t.assigneeId) return null
      return { label: 'Pegar chamado', icone: 'pegar', acao: () => accept(t) }
    }
    if (f !== 'andamento') return null
    const meio = statuses.filter((x) => x.fase === 'andamento')
    const i = meio.findIndex((x) => x.key === t.status)
    const proxima = i >= 0 ? meio[i + 1] : undefined
    if (proxima) {
      if (!canManage) return null
      return { label: `Mover para ${proxima.label}`, icone: 'mover', acao: () => moveTo(t.id, proxima.key) }
    }
    if (!canFinish) return null
    return { label: 'Finalizar chamado', icone: 'concluir', acao: () => concluir(t) }
  }

  /**
   * O tempo digitado no serviço já realizado vira a ida do atendimento: chegada na hora
   * informada, saída na hora informada + o tempo. Assim as horas entram no relatório sem
   * ninguém ter de reabrir um chamado que já nasceu fechado.
   */
  function idaDoServico(): Visita[] | undefined {
    if (!form.jaRealizado || !form.duracao.trim() || !form.realizadoEm) return undefined
    const minutos = minutosDoTexto(form.duracao)
    if (!minutos) return undefined
    const chegada = new Date(form.realizadoEm)
    const saida = new Date(chegada.getTime() + minutos * 60000)
    const hhmm = (d: Date) => d.toTimeString().slice(0, 5)
    const aaaammdd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return [{ data: aaaammdd(chegada), inicio: hhmm(chegada), fimData: aaaammdd(saida), fim: hhmm(saida), minutos }]
  }

  async function save() {
    if (!form.title.trim()) return showToast('Informe um título para o chamado')
    if (form.jaRealizado && !form.solucao.trim()) return showToast('Descreva o que foi feito para registrar um serviço já realizado')
    if (form.jaRealizado && form.duracao.trim() && !minutosDoTexto(form.duracao)) {
      return showToast('Tempo inválido — escreva como 1:30 ou 1,5')
    }
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
        const jaRealizado = form.jaRealizado
        await addTicket({
          ...payload,
          registroId: form.registroId,
          ...(jaRealizado
            ? {
                jaRealizado: true,
                realizadoEm: paraIso(form.realizadoEm),
                solucao: form.solucao.trim(),
                acoesTomadas: form.acoesTomadas.trim() || null,
                visitas: idaDoServico(),
              }
            : {
                ...(canServico && form.servico.trim() ? { possivelSolucao: form.servico.trim() } : {}),
                ...(canDatas && form.createdAt ? { createdAt: paraIso(form.createdAt) } : {}),
              }),
        })
        // Serviço antigo nasce concluído com data velha: o quadro não o mostra, o histórico sim.
        const velho = jaRealizado && Date.now() - new Date(form.realizadoEm).getTime() > 7 * 24 * 3600 * 1000
        showToast(jaRealizado ? (velho ? 'Serviço registrado — pela data, já está em Arquivados' : 'Serviço registrado e concluído') : 'Chamado aberto')
      } else if (editing) {
        // Datas: só vão no payload de quem pode mexer nelas e só quando mudaram.
        const datas: Partial<Ticket> = {}
        if (canDatas) {
          if (form.createdAt && form.createdAt !== paraInputLocal(editing.createdAt)) datas.createdAt = paraIso(form.createdAt)
          if (form.resolvedAt !== paraInputLocal(editing.resolvedAt)) datas.resolvedAt = paraIso(form.resolvedAt) || null
        }
        await updateTicket(editing.id, { ...payload, ...datas })
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

  // Serviço já realizado nasce concluído: exige as duas permissões do fim do atendimento.
  const podeRegistrarFeito = canAtender && canFinish

  return (
    <div>
      <PageHeader
        title={TITULO[fase].titulo}
        subtitle={`${rows.length} chamado(s) · ${TITULO[fase].subtitulo}`}
        actions={fase === 'aberto' && canCreate && <Button onClick={openNew}><Plus size={15} /> Novo chamado</Button>}
        // Colunas só existem em Em andamento — as outras duas fases são uma coluna só.
        menu={[fase === 'andamento' && canManageStatus && { label: 'Colunas', icon: <Settings2 size={15} />, onClick: () => setManaging(true) }]}
      />

      <FiltrosChamados fase={fase} valor={filtros} onChange={setFiltros} colunas={colunas} />

      {/* Um cartão comum às três telas, mudando só como eles são arrumados. */}
      {(() => {
        const cartao = (t: Ticket) => (
          <TicketCard
            key={t.id}
            t={t}
            concluido={doneKeys.has(t.status)}
            canManage={canManage && podeMexer(t)}
            canDelete={podeExcluir(t)}
            canCancel={podeCancelar(t) && !podeExcluir(t)}
            etapa={proximaEtapa(t)}
            onEdit={() => openEdit(t)}
            onDelete={() => setDeleting(t)}
            onCancel={() => setCanceling(t)}
            onMover={fase === 'andamento' && canManage && colunas.length > 1 ? () => setMovendo(t) : undefined}
            // Preencher o atendimento é o que o técnico mais faz — do cartão, num toque.
            onAtender={
              fase === 'andamento' && canAtender && !!t.assigneeId && podeMexer(t) && (ehMeu(t) || canCorrigir)
                ? () => setAtendendo(t)
                : undefined
            }
            onChat={() => setConversando(t)}
            onDetail={() => openDetail(t)}
          />
        )

        if (fase === 'concluido') {
          return <ListaConcluidos rows={rows} filtros={filtros} labelOf={labelOf} podeHistorico={canHistorico} podeEditar={canEditarConcluido && canManage} onDetail={openDetail} />
        }

        // Abertos: é uma fila, não um quadro — cartões lado a lado, do mais antigo na espera.
        if (fase === 'aberto') {
          return rows.length === 0 ? (
            <EmptyState>
              {tickets.length === 0
                ? <>Nenhum chamado aberto.{canCreate && ' Clique em “Novo chamado” para abrir o primeiro.'}</>
                : 'Nenhum chamado aberto com esses filtros.'}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(cartao)}
            </div>
          )
        }

        // Em andamento no celular: abas. Uma coluna por vez, sem rolagem infinita.
        if (mobile && colunas.length > 1) {
          const atual = colunas.find((c) => c.key === colunaAtiva) ?? colunas[0]
          const items = rows.filter((t) => t.status === atual.key)
          return (
            <div>
              <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {colunas.map((c) => {
                  const n = rows.filter((t) => t.status === c.key).length
                  const ativa = c.key === atual.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setColunaAtiva(c.key)}
                      aria-pressed={ativa}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                        ativa ? coresDoStatus(statuses, c.key).ativo : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      {c.label}
                      <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${ativa ? 'bg-slate-900/40' : 'bg-slate-800'}`}>{n}</span>
                    </button>
                  )
                })}
              </div>
              <div className="space-y-2">
                {items.map(cartao)}
                {items.length === 0 && <div className="px-3 py-8 text-center text-[12px] text-slate-600">nada nesta coluna</div>}
              </div>
            </div>
          )
        }

        // Em andamento: o quadro. Mobile empilha as colunas; desktop põe lado a lado.
        return (
          <div className="grid grid-cols-1 gap-3 md:[grid-template-columns:var(--kb-cols)]" style={{ ['--kb-cols' as any]: `repeat(${Math.min(colunas.length, 4)}, minmax(0, 1fr))` }}>
            {colunas.map((col) => {
              const items = rows.filter((t) => t.status === col.key)
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => { if (canManage) { e.preventDefault(); setDragOver(col.key) } }}
                  onDragLeave={() => setDragOver((x) => (x === col.key ? null : x))}
                  onDrop={(e) => { const id = e.dataTransfer.getData('text/ticket'); setDragOver(null); if (id) moveTo(id, col.key) }}
                  className={`min-w-0 rounded-xl p-1 transition-colors ${dragOver === col.key ? 'bg-red-500/5 ring-1 ring-red-700' : ''}`}
                >
                  {/* Sem caixa em volta: a tela já é só esta fase, o cartão fica solto. */}
                  <div className="mb-2 flex items-center gap-2 px-1">
                    {/* O pontinho da fase: o quadro inteiro na cor do estado em que está. */}
                    <span className={`h-2 w-2 shrink-0 rounded-full ${coresDoStatus(statuses, col.key).ponto}`} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{col.label}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${coresDoStatus(statuses, col.key).badge}`}>{items.length}</span>
                    <span className="h-px flex-1 bg-slate-800" />
                  </div>
                  <div className="space-y-2">
                    {items.map(cartao)}
                    {items.length === 0 && <div className="px-3 py-5 text-center text-[12px] text-slate-600">nada aqui</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Criar / editar */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Novo chamado' : `Editar ${typeof editing === 'object' && editing ? editing.code : ''}`}
        wide
        telaCheia
        onSubmit={save}
        footer={<><Button variant="subtle" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Salvar</Button></>}
      >
        <div className="space-y-3">
          {form.registroId && (
            <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[12px] text-sky-200/90">Aberto a partir de um registro da linha do tempo — o registro fica ligado a este chamado.</p>
          )}

          {/* Serviço já feito não passa pela fila: nasce concluído no nome de quem registra. */}
          {editing === 'new' && podeRegistrarFeito && (
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-950/40 p-0.5" role="radiogroup" aria-label="Tipo de lançamento">
              {([[false, 'Chamado novo', HandHelping], [true, 'Serviço já realizado', Wrench]] as const).map(([v, label, Icon]) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={form.jaRealizado === v}
                  onClick={() => setForm({ ...form, jaRealizado: v })}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${form.jaRealizado === v ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          )}
          {form.jaRealizado && (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-200/90">
              Você já resolveu isso no local. O chamado entra concluído, com você como responsável — sem passar pela fila. O tempo no local vai aqui mesmo; itens e fotos entram depois, pelo atendimento.
            </p>
          )}

          {/* O local vem primeiro: é a primeira coisa que se pergunta no telefone, e é ele
              que decide quem enxerga o chamado. */}
          <FieldBox label="Local" hint="não está na lista? cadastre por aqui mesmo">
            <LocalSelect value={form.localId} onChange={(v) => setForm({ ...form, localId: v })} />
          </FieldBox>

          <Field label={form.jaRealizado ? 'O que foi feito (título)' : 'Título'}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.jaRealizado ? 'Ex.: Troca da câmera da portaria' : 'Ex.: Portão da garagem não abre'} autoFocus />
          </Field>
          <Field label={form.jaRealizado ? 'Contexto' : 'O que aconteceu'}>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={form.jaRealizado ? 2 : 4} placeholder={form.jaRealizado ? 'Por que você estava no local, o que encontrou…' : 'Relate o problema: o que foi informado, desde quando, onde exatamente…'} />
          </Field>

          {/* Quem já sabe o serviço escreve aqui: é a instrução que o técnico lê antes de
              sair. Não é a solução — a solução é o que ele escreve quando termina. */}
          {!form.jaRealizado && canServico && editing === 'new' && (
            <Field label="O que precisa ser feito" hint="opcional — o serviço que você já sabe que este chamado exige">
              <Textarea rows={2} value={form.servico} onChange={(e) => setForm({ ...form, servico: e.target.value })} placeholder="Ex.: trocar o motor do portão social e regular o fim de curso" />
            </Field>
          )}

          {form.jaRealizado && (
            <>
              <Field label="Solução" hint="obrigatória — é o que o relatório e a próxima visita vão ler">
                <Textarea value={form.solucao} onChange={(e) => setForm({ ...form, solucao: e.target.value })} rows={2} placeholder="O que resolveu" />
              </Field>
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                <Field label="Quando cheguei no local" hint="dia e hora — até 90 dias atrás">
                  <Input type="datetime-local" value={form.realizadoEm} max={agoraLocal()} onChange={(e) => setForm({ ...form, realizadoEm: e.target.value })} />
                </Field>
                {/* O tempo entra aqui e já vira a ida do atendimento: mandar lançar as
                    horas depois, num chamado que nasce concluído, é pedir para não lançar. */}
                <Field label="Quanto tempo levou" hint="1:30 ou 1,5 — opcional">
                  <Input value={form.duracao} onChange={(e) => setForm({ ...form, duracao: e.target.value })} placeholder="Ex.: 1:30" inputMode="decimal" />
                </Field>
              </div>
              <Field label="Ações tomadas"><Input value={form.acoesTomadas} onChange={(e) => setForm({ ...form, acoesTomadas: e.target.value })} placeholder="opcional" /></Field>
            </>
          )}

          <Field label="Solicitante" hint="quem pediu ou avisou (nome, unidade, telefone)">
            <Input value={form.solicitante} onChange={(e) => setForm({ ...form, solicitante: e.target.value })} placeholder="Ex.: Sr. Carlos, síndico — (11) 9…" />
          </Field>

          {/* Data e hora do chamado se ajustam DEPOIS, na edição, por quem tem a permissão —
              na hora de abrir, o campo só atrapalha quem está atendendo alguém. */}
          {canDatas && !form.jaRealizado && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
              <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-300"><CalendarClock size={13} className="text-slate-500" /> Datas do chamado</div>
              <p className="mb-2 text-[11px] text-slate-500">
                {editing === 'new'
                  ? 'Para o chamado que foi pedido ontem e só agora está sendo aberto. Em branco, vale agora.'
                  : 'Para acertar um chamado que foi solicitado antes de alguém abrir. Fica registrado na auditoria.'}
              </p>
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                <Field label="Aberto em" hint={editing === 'new' ? 'em branco = agora' : undefined}>
                  <Input type="datetime-local" value={form.createdAt} max={agoraLocal()} onChange={(e) => setForm({ ...form, createdAt: e.target.value })} />
                </Field>
                {/* Chamado que está nascendo não tem conclusão para acertar. */}
                {editing !== 'new' && (
                  <Field label="Concluído em" hint="vazio = ainda não concluído">
                    <Input type="datetime-local" value={form.resolvedAt} max={agoraLocal()} onChange={(e) => setForm({ ...form, resolvedAt: e.target.value })} />
                  </Field>
                )}
              </div>
            </div>
          )}

          {canAttach && (
            <Field label={form.jaRealizado ? 'Fotos do serviço' : 'Fotos do problema'}><PhotoInput photos={form.photos} onChange={(photos) => setForm({ ...form, photos })} /></Field>
          )}
        </div>
      </Modal>

      {managing && (
        <StatusManager
          statuses={colunas}
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

      <Modal
        open={canceling !== null}
        onClose={() => { setCanceling(null); setMotivo('') }}
        title="Cancelar chamado"
        onSubmit={cancelar}
        footer={
          <>
            <Button variant="subtle" onClick={() => { setCanceling(null); setMotivo('') }}>Voltar</Button>
            <Button variant="danger" onClick={cancelar}><Ban size={14} /> Cancelar chamado</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Cancelar <span className="font-medium text-slate-100">{canceling?.code} · {canceling?.title}</span>? Ele sai do quadro e não volta.
            O que foi escrito — título, relato, quem abriu e o motivo — fica guardado na auditoria.
          </p>
          <Field label="Motivo" hint="opcional, mas é o que explica o cancelamento depois">
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: aberto em duplicidade; o síndico resolveu por conta" />
          </Field>
        </div>
      </Modal>

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
        tituloTexto={detail ? `${detail.code} · ${detail.title}` : 'Chamado'}
        title={detail ? (
          <div className="min-w-0">
            <div className="font-mono text-[11px] tracking-wide text-red-400/80">{detail.code}</div>
            <h2 className="truncate text-[15px] font-semibold leading-tight text-slate-100">{detail.title}</h2>
            {!detail.assigneeId && !doneKeys.has(detail.status) && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                <HandHelping size={11} /> na fila há {esperaDesde(detail.createdAt)}
              </span>
            )}
          </div>
        ) : 'Chamado'}
        fechar={null}
        wide
        footer={detail ? (
          <>
            {/* Conversa e o ponto em cima, fechar e a ação da etapa embaixo: no celular o
                que se usa o dia inteiro (cheguei/saí) fica ao alcance do polegar, e o
                atendimento inteiro continua no corpo do chamado. */}
            <Button variant="subtle" onClick={() => setConversando(detail)}>
              <MessagesSquare size={14} /> Conversa{detail.commentCount ? ` (${detail.commentCount})` : ''}
            </Button>
            {!!detail.assigneeId && !doneKeys.has(detail.status) && podeMexer(detail) &&
              ((canAtender && (ehMeu(detail) || canCorrigir)) || (detail.sharedWith ?? []).some((p) => p.id === me.id)) && (
              <BotaoPonto t={detail} onSalvo={recarregarDetalhe} />
            )}
            {/* Fechar não é o primeiro do rodapé: no celular ele fica na linha de baixo,
                ao lado da ação que termina o chamado. No desktop volta para a ponta. */}
            <Button variant="subtle" className="sm:order-first" onClick={closeDetail}>Fechar</Button>
            {(() => {
              const etapa = proximaEtapa(detail)
              if (!etapa) return null
              const Icone = etapa.icone === 'pegar' ? HandHelping : etapa.icone === 'concluir' ? CheckCircle2 : ArrowRight
              return <Button onClick={etapa.acao}><Icone size={15} /> {etapa.label}</Button>
            })()}
          </>
        ) : undefined}
      >
        {detail && (
          <DetalheChamado
            t={detail}
            labelOf={labelOf}
            concluido={doneKeys.has(detail.status)}
            onRefresh={recarregarDetalhe}
            // Quem pegou preenche; quem corrige atendimento (administrador) também.
            podeAtender={canAtender && (ehMeu(detail) || canCorrigir) && podeMexer(detail)}
            podeCompartilhar={canShare && !!detail.assigneeId && !doneKeys.has(detail.status) && (ehMeu(detail) || canCorrigir)}
            onEditarAtendimento={() => setAtendendo(detail)}
            onPassar={
              detail.assigneeId && !doneKeys.has(detail.status) && (ehMeu(detail) || canCorrigir || (detail.sharedWith ?? []).some((p) => p.id === me.id))
                ? () => setPassando(detail)
                : undefined
            }
            secundarias={[
              detail.assigneeId && !doneKeys.has(detail.status) && (ehMeu(detail) || canCorrigir) && { label: 'Devolver à fila', icone: <Undo2 size={13} />, onClick: () => devolver(detail) },
              canManage && podeMexer(detail) && { label: 'Editar dados', icone: <Pencil size={13} />, onClick: () => { const d = detail; closeDetail(); openEdit(d) } },
              podeCancelar(detail) && !podeExcluir(detail) && { label: 'Cancelar chamado', icone: <Ban size={13} />, perigo: true, onClick: () => setCanceling(detail) },
              podeExcluir(detail) && { label: 'Excluir chamado', icone: <Trash2 size={13} />, perigo: true, onClick: () => setDeleting(detail) },
            ]}
          />
        )}
      </Modal>

      {movendo && (
        <Modal
          open
          onClose={() => setMovendo(null)}
          tituloTexto={`Mover ${movendo.code}`}
          title={
            <div className="min-w-0">
              <div className="font-mono text-[11px] tracking-wide text-red-400/80">{movendo.code}</div>
              <h2 className="truncate text-[15px] font-semibold leading-tight text-slate-100">{movendo.title}</h2>
            </div>
          }
        >
          <div className="space-y-1.5">
            <p className="mb-2 text-[12px] text-slate-500">Para qual coluna de Em andamento?</p>
            {colunas.map((c) => (
              <button
                key={c.key}
                onClick={() => { moveTo(movendo.id, c.key); setMovendo(null) }}
                disabled={c.key === movendo.status}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left text-sm ${
                  c.key === movendo.status
                    ? 'border-slate-800 bg-slate-900/40 text-slate-500'
                    : 'border-slate-800 text-slate-200 hover:border-red-700 hover:bg-red-500/5'
                }`}
              >
                {c.label}
                {c.key === movendo.status ? <span className="text-[11px]">está aqui</span> : <ArrowRight size={15} className="text-slate-600" />}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {conversando && (
        <ChatChamado
          t={tickets.find((x) => x.id === conversando.id) ?? conversando}
          podeComentar={canComentar || conversando.createdById === me.id || conversando.assigneeId === me.id || (conversando.sharedWith ?? []).some((p) => p.id === me.id)}
          onFechar={() => setConversando(null)}
          onMudou={recarregarDetalhe}
        />
      )}

      {passando && (
        <PassarChamado
          t={passando}
          onFechar={() => setPassando(null)}
          onPassar={async (paraId, motivo) => {
            try {
              await transferirTicket(passando.id, paraId, motivo)
              setPassando(null)
              showToast(paraId ? 'Chamado passado — o técnico foi avisado' : `${passando.code} voltou para a fila`)
              if (!paraId) irParaFase('aberto', passando.id)
            } catch (e: any) {
              showToast(e?.message ?? 'Não foi possível passar o chamado')
            }
          }}
        />
      )}

      {atendendo && (
        <ModalAtendimento
          t={tickets.find((x) => x.id === atendendo.id) ?? detail ?? atendendo}
          onFechar={() => setAtendendo(null)}
          onSalvo={recarregarDetalhe}
        />
      )}

      {/* Só depois de procurar no servidor é que o chamado realmente não existe. */}
      {detailId && !detail && !buscandoDetalhe && tickets.length > 0 && (
        <Modal open onClose={closeDetail} title="Chamado não encontrado">
          <p className="text-sm text-slate-300">Este chamado não existe mais — pode ter sido excluído ou cancelado.</p>
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

function DetalheChamado({ t, labelOf, concluido, onRefresh, podeAtender, podeCompartilhar, onPassar, onEditarAtendimento, secundarias }: {
  t: Ticket
  labelOf: (k: string) => string
  concluido: boolean
  onRefresh: () => void
  podeAtender: boolean
  podeCompartilhar: boolean
  /** Passar o chamado para outro técnico — fica junto do compartilhar, é o mesmo assunto. */
  onPassar?: () => void
  onEditarAtendimento: () => void
  /** Ações que não cabem no rodapé: editar dados, arquivar, cancelar, excluir. */
  secundarias: ({ label: string; icone: React.ReactNode; onClick: () => void; perigo?: boolean } | false | undefined)[]
}) {
  const local = useStore((s) => s.locais.find((l) => l.id === t.localId))
  const me = useCurrentUser()
  const mapa = mapsUrl(local ?? (t.localName ? { name: t.localName } : null))
  const endereco = [local?.address, local?.city, local?.cep].filter(Boolean).join(', ')
  const [copiou, setCopiou] = useState(false)
  // Está no chamado: abriu, pegou ou foi posto junto. Esses sempre podem falar no andamento.
  const noChamado = t.createdById === me?.id || t.assigneeId === me?.id || (t.sharedWith ?? []).some((s) => s.id === me?.id)
  const acoes = secundarias.filter(Boolean) as { label: string; icone: React.ReactNode; onClick: () => void; perigo?: boolean }[]
  const emAtendimento = !!t.assigneeId

  const botaoPassar = onPassar ? (
    <Button size="sm" variant="subtle" onClick={onPassar}>
      <ArrowRightLeft size={12} /> Passar para outro técnico
    </Button>
  ) : null

  return (
    <div className="space-y-4 text-sm">
      {/* Uma linha só para o que antes eram quatro caixinhas. O status e a espera já
          estão no cabeçalho fixo, grudados no título — não se repetem aqui. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Building2 size={12} className="text-slate-500" />
          <SiglaLocal localId={t.localId} />
          {t.localName ?? 'sem local'}
        </span>
        <span className="text-slate-700">·</span>
        <span className="inline-flex items-center gap-1"><Phone size={12} className="text-slate-500" />{t.solicitante || 'sem solicitante'}</span>
        <span className="text-slate-700">·</span>
        <span className="inline-flex items-center gap-1"><Clock size={12} className="text-slate-500" />{t.createdByName} · {fmtDataHora(t.createdAt)}</span>
        {t.assigneeName && (
          <>
            <span className="text-slate-700">·</span>
            <span className="inline-flex items-center gap-1 text-slate-300">
              <AvatarPessoa nome={t.assigneeName} id={t.assigneeId} size={16} />{t.assigneeName}
              {(t.sharedWith ?? []).map((p) => (<AvatarPessoa key={p.id} nome={p.name} id={p.id} size={16} className="-ml-1 ring-1 ring-slate-900" />))}
            </span>
          </>
        )}
        {t.resolvedAt && (
          <>
            <span className="text-slate-700">·</span>
            <span className="inline-flex items-center gap-1 text-emerald-500/90"><CheckCircle2 size={12} /> concluído {fmtDataHora(t.resolvedAt)}</span>
          </>
        )}
      </div>

      {/*
        Chegar no local é a primeira coisa depois de pegar o chamado — mas é UMA linha de
        endereço, não meia tela. Com os botões na mesma linha, o endereço ficava espremido
        numa coluna estreita e quebrava em cinco linhas; aqui ele usa a largura toda e os
        botões vão para baixo, pequenos.
      */}
      {endereco && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2">
          <div className="flex items-start gap-1.5">
            <MapPin size={13} className="mt-px shrink-0 text-red-400" />
            <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-300">{endereco}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <a
              href={mapa ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-100 hover:border-red-700 hover:bg-red-500/10"
            >
              <Navigation size={12} /> Abrir no GPS
            </a>
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(endereco); setCopiou(true); setTimeout(() => setCopiou(false), 1500) } catch { /* sem área de transferência */ }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 text-[11px] text-slate-400 hover:border-slate-700 hover:text-slate-100"
            >
              {copiou ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />} {copiou ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {t.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200">{t.description}</p>}

      {/* A instrução de serviço, escrita por quem abriu. Fica em destaque enquanto o
          chamado não termina: é o que o técnico lê antes de sair. */}
      {t.possivelSolucao && !concluido && (
        <div className="rounded-lg border border-blue-500/25 bg-blue-500/[0.06] px-3 py-2">
          <div className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-300"><Wrench size={12} /> O que precisa ser feito</div>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-200">{t.possivelSolucao}</p>
        </div>
      )}

      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-400">Fotos do problema</div>
        <PhotoInput photos={t.photos ?? []} />
      </div>

      {/* Gente no chamado: quem está junto e para quem ele passa — o mesmo assunto, a
          mesma linha. */}
      {(podeCompartilhar || onPassar) && (
        podeCompartilhar ? (
          <CompartilharChamado t={t} onSaved={onRefresh} aoLado={onPassar && botaoPassar} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">{botaoPassar}</div>
        )
      )}

      {/* Atendimento só existe depois que alguém pega o chamado — na fila ele seria uma
          caixa vazia pedindo dados que ninguém pode preencher ainda. */}
      {emAtendimento && (
        <AtendimentoTecnico
          t={t}
          podeEditar={podeAtender}
          onEditar={onEditarAtendimento}
          onSalvo={onRefresh}
        />
      )}
      {acoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {acoes.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                a.perigo ? 'border-slate-800 text-slate-400 hover:border-red-800 hover:bg-red-500/10 hover:text-red-300' : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
              }`}
            >
              {a.icone} {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TicketCard({ t, concluido, canManage, canDelete, canCancel, etapa, onEdit, onDelete, onCancel, onMover, onAtender, onChat, onDetail }: {
  t: Ticket
  concluido: boolean
  canManage: boolean
  canDelete: boolean
  canCancel: boolean
  /** A única ação de fluxo do cartão: pegar, ir para a próxima coluna ou concluir. */
  etapa: { label: string; icone: 'pegar' | 'mover' | 'concluir'; acao: () => void } | null
  onEdit: () => void
  onDelete: () => void
  onCancel: () => void
  /** Mover para outra coluna sem arrastar (celular). */
  onMover?: () => void
  /** Abre o atendimento direto do cartão: é o que o técnico faz o dia inteiro. */
  onAtender?: () => void
  /** Abre a conversa do chamado — sem precisar pegar o chamado nem abrir o detalhe. */
  onChat: () => void
  onDetail: () => void
}) {
  const allPhotos = [...(t.photos ?? []), ...(t.startPhotos ?? []), ...(t.donePhotos ?? [])]
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
        {(canManage || canDelete || canCancel) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onMover && (
              <button onClick={stop(onMover)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 md:hidden" title="Mover para outra coluna">
                <MoveRight size={14} />
              </button>
            )}
            {canManage && <button onClick={stop(onEdit)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Editar"><Pencil size={13} /></button>}
            {canCancel && <button onClick={stop(onCancel)} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Cancelar chamado"><Ban size={13} /></button>}
            {canDelete && <button onClick={stop(onDelete)} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Excluir"><Trash2 size={13} /></button>}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        {t.localName && (
          <span className="inline-flex items-center gap-1">
            <Building2 size={11} /> <SiglaLocal localId={t.localId} /> {t.localName}
          </span>
        )}
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
          <span className="inline-flex shrink-0 items-center gap-1 text-slate-400">
            <AvatarPessoa nome={t.assigneeName} id={t.assigneeId} size={15} /> {t.assigneeName}
            {(t.sharedWith ?? []).map((p) => (<AvatarPessoa key={p.id} nome={p.name} id={p.id} size={15} className="-ml-1 ring-1 ring-slate-900" />))}
          </span>
        ) : (
          <span className="shrink-0 text-amber-400/80">sem técnico</span>
        )}
      </div>

      {/*
        A AÇÃO GRANDE É A DO DIA A DIA. Com o chamado na mão, o que o técnico faz o tempo
        todo é abrir o atendimento — finalizar acontece uma vez só, no fim. Por isso, tendo
        atendimento, é ele que ocupa a linha, e "Finalizar" encolhe: continua vermelho,
        para ser achado na hora certa, sem ser o que a mão encontra primeiro.
      */}
      <div className="mt-2 flex items-stretch gap-1.5">
        {onAtender && (
          <button
            onClick={stop(onAtender)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700/70 py-2 text-[12px] font-semibold text-slate-100 hover:bg-slate-700"
          >
            <Wrench size={14} /> Atendimento
          </button>
        )}
        {etapa && (
          <button
            onClick={stop(etapa.acao)}
            title={etapa.label}
            className={
              onAtender
                ? `inline-flex shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 py-2 text-[11px] font-semibold ${
                    etapa.icone === 'concluir'
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'border border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700'
                  }`
                : `flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[12px] font-medium ${
                    etapa.icone === 'pegar'
                      ? 'border-emerald-800/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                      : etapa.icone === 'concluir'
                        ? 'border-red-800/60 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                        : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700'
                  }`
            }
          >
            {etapa.icone === 'pegar' ? <HandHelping size={14} /> : etapa.icone === 'concluir' ? <CheckCircle2 size={14} /> : <ArrowRight size={14} />}
            {/* Encolhido, o botão mostra só o verbo: "Finalizar chamado" não cabe. */}
            {onAtender ? (etapa.icone === 'concluir' ? 'Finalizar' : '') : etapa.label}
          </button>
        )}
        <button
          onClick={stop(onChat)}
          title="Conversa do chamado"
          aria-label="Conversa do chamado"
          className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-[12px] font-medium text-slate-200 hover:bg-slate-700 ${etapa || onAtender ? '' : 'flex-1'}`}
        >
          <MessagesSquare size={14} />
          {t.commentCount ? <span className="tabular-nums">{t.commentCount}</span> : !etapa && !onAtender && 'Conversa'}
        </button>
      </div>

    </div>
  )
}

// Colunas de Em andamento: criar, renomear, remover, reordenar. Abertos e Concluídos
// não entram aqui — são as pontas do caminho e não se mexem.
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
    setList([...list, { key, label: l, fase: 'andamento' }])
    setLabel('')
  }
  const rename = (i: number, l: string) => setList(list.map((s, idx) => (idx === i ? { ...s, label: l } : s)))
  const remove = (i: number) => setList(list.filter((_, idx) => idx !== i))
  function reorder(from: number, to: number) {
    setList((l) => {
      const c = [...l]
      const [m] = c.splice(from, 1)
      c.splice(to, 0, m)
      return c
    })
  }
  const somem = statuses.filter((s) => !list.some((x) => x.key === s.key) && (contagem[s.key] ?? 0) > 0)
  const quantos = somem.reduce((n, s) => n + (contagem[s.key] ?? 0), 0)
  // Sem coluna nenhuma, um chamado pego não teria onde ficar.
  const valido = list.length > 0 && list.every((s) => s.label.trim())

  return (
    <Modal
      open
      onClose={onClose}
      title="Colunas de Em andamento"
      footer={<><Button variant="subtle" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(list)} disabled={!valido}>Salvar</Button></>}
    >
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500">
          Estas são as colunas do quadro de <span className="text-slate-300">Em andamento</span> — por exemplo “Aguardando peça” ou “Aguardando cliente”.
          Arraste pela alça para reordenar. <span className="text-slate-300">Abertos</span> e <span className="text-slate-300">Concluídos</span> são telas próprias e não entram aqui.
        </p>
        <div className="space-y-1.5">
          {list.map((s, i) => (
            <div
              key={s.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null) }}
              className={`flex items-center gap-2 rounded-lg border bg-slate-950/40 px-2 py-1.5 ${dragIdx === i ? 'border-red-600 opacity-60' : 'border-slate-800'}`}
            >
              <span
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => setDragIdx(null)}
                className="shrink-0 cursor-grab text-slate-600 hover:text-slate-300 active:cursor-grabbing"
                title="Arraste para reordenar"
              >
                <GripVertical size={16} />
              </span>
              <Input value={s.label} onChange={(e) => rename(i, e.target.value)} className="flex-1" aria-label="Nome da coluna" />
              {(contagem[s.key] ?? 0) > 0 && <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{contagem[s.key]}</span>}
              {list.length > 1 && (
                <button onClick={() => remove(i)} className="shrink-0 rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Remover coluna"><X size={14} /></button>
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


/**
 * PASSAR O CHAMADO. O técnico foi, voltou e não vai conseguir terminar — alguém precisa
 * continuar de onde ele parou, sem o chamado voltar para o fim da fila e sem perder as
 * horas e o texto já registrados. Quem sai continua acompanhando como apoio.
 */
function PassarChamado({ t, onFechar, onPassar }: {
  t: Ticket
  onFechar: () => void
  onPassar: (paraId: string | null, motivo: string) => void
}) {
  const me = useCurrentUser()
  const [tecnicos, setTecnicos] = useState<TecnicoRef[] | null>(null)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    let vivo = true
    api.tecnicos(t.localId).then((r) => { if (vivo) setTecnicos(r.filter((x) => x.id !== t.assigneeId)) }).catch(() => { if (vivo) setTecnicos([]) })
    return () => { vivo = false }
  }, [t.localId, t.assigneeId])

  const souApoio = (t.sharedWith ?? []).some((p) => p.id === me.id)

  return (
    <Modal
      open
      onClose={onFechar}
      tituloTexto={`Passar o ${t.code}`}
      title={
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-wide text-red-400/80">{t.code}</div>
          <h2 className="truncate text-[15px] font-semibold leading-tight text-slate-100">Passar o chamado</h2>
        </div>
      }
      fechar="Cancelar"
      footer={<Button onClick={() => onPassar(escolhido, motivo)} disabled={!escolhido}><ArrowRightLeft size={14} /> Passar</Button>}
    >
      <div className="space-y-3">
        <p className="text-[12.5px] text-slate-400">
          Está com <span className="text-slate-200">{t.assigneeName ?? 'ninguém'}</span>. Quem receber continua de onde parou — as horas,
          os itens e o que já foi escrito ficam no chamado, e quem sai continua acompanhando.
        </p>

        {souApoio && t.assigneeId !== me.id && (
          <button
            onClick={() => setEscolhido(me.id)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left text-sm ${
              escolhido === me.id ? 'border-red-700 bg-red-500/10 text-red-200' : 'border-slate-800 text-slate-200 hover:border-slate-700'
            }`}
          >
            <span className="inline-flex items-center gap-2"><AvatarPessoa nome={me.name} id={me.id} size={22} /> Assumir eu mesmo</span>
            <ArrowRightLeft size={15} className="text-slate-600" />
          </button>
        )}

        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">Passar para</div>
          {tecnicos === null ? (
            <div className="py-4 text-center"><Loader2 size={16} className="mx-auto animate-spin text-slate-600" /></div>
          ) : tecnicos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-[12px] text-slate-500">
              Nenhum outro técnico atende este local.
            </p>
          ) : (
            <div className="space-y-1.5">
              {tecnicos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setEscolhido(p.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${
                    escolhido === p.id ? 'border-red-700 bg-red-500/10 text-red-200' : 'border-slate-800 text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-2"><AvatarPessoa nome={p.name} id={p.id} size={22} /> {p.name}</span>
                  {escolhido === p.id && <CheckCircle2 size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Motivo" hint="opcional — fica no histórico do chamado, para quem pegar entender o que houve">
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: precisa de escada maior; volto só na quinta" />
        </Field>

        <button
          onClick={() => onPassar(null, motivo)}
          className="w-full rounded-lg border border-slate-800 py-2.5 text-[12px] text-slate-400 hover:border-slate-700 hover:text-slate-200"
        >
          Nenhum destes — devolver para a fila
        </button>
      </div>
    </Modal>
  )
}
