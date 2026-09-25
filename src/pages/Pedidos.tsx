import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Plus, Search, Building2, Pencil, Trash2, Loader2, Phone, Tags, Package, Wrench, Boxes, Paperclip, X, Check, Minus, Undo2, CalendarClock, Camera, Lock, ChevronLeft, ChevronRight, CalendarDays, FileBarChart, Download, Hash, StickyNote, ChevronDown, DoorOpen } from 'lucide-react'
import { Button, EmptyState, Field, FieldBox, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui'
import { useStore, useCan, useCurrentUser } from '@/lib/store'
import { LocalSelect } from '@/components/LocalSelect'
import { AvatarPessoa } from '@/components/Pessoa'
import { PhotoInput } from '@/components/PhotoInput'
import { Comprovantes, PreviaComprovante } from '@/components/pedidos/Comprovantes'
import { brl, corDa, parseCatalogo, pedePortao, ResumoPedidos } from '@/components/pedidos/ResumoPedidos'
import { SaldosConsignados } from '@/components/pedidos/Saldos'
import { api } from '@/lib/api'
import { paraInputLocal } from '@/lib/tickets'
import { fmtDataHora } from '@/lib/utils'
import { useClickFora } from '@/lib/useClickFora'
import { CORES_CATEGORIA } from '@/lib/registros'
import type { CategoriaCatalogo, ItemPedido, ModalidadePedido, Pedido, RelatorioPedidos, SaldoLocal } from '@/lib/types'

const MODALIDADES: { id: ModalidadePedido; label: string; curto: string; icon: typeof Package; ajuda: string }[] = [
  { id: 'pedido', label: 'Pedido de controle', curto: 'Pedido', icon: Package, ajuda: 'Controle ou tag novo para uma unidade.' },
  { id: 'manutencao', label: 'Manutenção', curto: 'Manutenção', icon: Wrench, ajuda: 'Aparelho que voltou com defeito — anote o serial e o problema.' },
  { id: 'lote', label: 'Pedido de lote', curto: 'Lote', icon: Boxes, ajuda: 'O condomínio recebe em quantidade, CONSIGNADO: cada pedido de morador abate do saldo.' },
]
const modalidadeDe = (id: string) => MODALIDADES.find((m) => m.id === id) ?? MODALIDADES[0]

type Etapa = 'pago' | 'feito' | 'entregue'
type EtapaDef = { id: Etapa; label: string; acao: string; em: 'pagoEm' | 'feitoEm' | 'entregueEm'; por: 'pagoPor' | 'feitoPor' | 'entreguePor'; cor: string }
const ETAPA: Record<Etapa, EtapaDef> = {
  pago: { id: 'pago', label: 'Pago', acao: 'Marcar pago', em: 'pagoEm', por: 'pagoPor', cor: '#34d399' },
  feito: { id: 'feito', label: 'Feito', acao: 'Marcar feito', em: 'feitoEm', por: 'feitoPor', cor: '#38bdf8' },
  entregue: { id: 'entregue', label: 'Entregue', acao: 'Entregar', em: 'entregueEm', por: 'entreguePor', cor: '#a78bfa' },
}
/**
 * Cada modalidade tem o seu caminho (o servidor exige a mesma ordem):
 * pedido: pago → feito → entregue · lote: entregue (é consignado: quem paga é o pedido do
 * morador que abate do saldo) · manutenção: resolvido/não resolvido → entregue.
 */
function etapasDe(modalidade: ModalidadePedido, p?: Pick<Pedido, 'resultado'>): EtapaDef[] {
  if (modalidade === 'lote') return [{ ...ETAPA.entregue, label: 'Entregue (consignado)', acao: 'Entregar ao condomínio' }]
  if (modalidade === 'manutencao') {
    const nao = p?.resultado === 'nao_resolvido'
    return [{ ...ETAPA.feito, label: nao ? 'Não resolvido' : 'Resolvido', acao: 'Fechar manutenção', cor: nao ? '#fb923c' : '#f472b6' }, ETAPA.entregue]
  }
  return [ETAPA.pago, ETAPA.feito, ETAPA.entregue]
}
/** Tudo feito menos a entrega: é o que está na faixa de "prontos". */
const pronto = (p: Pedido) => etapasDe(p.modalidade).slice(0, -1).every((e) => !!p[e.em])

const totalDe = (itens: ItemPedido[]) => itens.reduce((s, i) => s + (i.valor ?? 0) * i.quantidade, 0)
const agoraLocal = () => paraInputLocal(new Date().toISOString())
/** Serial é sempre em maiúsculas — é assim que vem gravado no aparelho. */
const maiusculas = (v: string) => v.toUpperCase()
/** "Cond. Jardim · Bloco B · Apto 42" — local, bloco e apartamento numa linha só. */
const ondeDe = (p: Pick<Pedido, 'localName' | 'bloco' | 'apartamento'>) =>
  [p.localName ?? 'sem local', p.bloco && `Bloco ${p.bloco}`, p.apartamento && `Apto ${p.apartamento}`].filter(Boolean).join(' · ')
/** Valor digitado ("12,50") → número; vazio → null. */
const lerValor = (t: string) => { const x = t.replace(/[^\d,]/g, ''); if (!x) return null; const n = Number(x.replace(',', '.')); return Number.isFinite(n) ? n : null }
const mostrarValor = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))

const DIA_MS = 86400000
function inicioDaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const curto = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
function rotuloDia(iso: string) {
  const d = new Date(iso)
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (mesmo(d, new Date())) return 'Hoje'
  if (mesmo(d, new Date(Date.now() - DIA_MS))) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

/** Os itens do pedido em pílulas, na cor da categoria. */
function Itens({ itens, catalogo }: { itens: ItemPedido[]; catalogo: CategoriaCatalogo[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {itens.map((i, k) => {
        const cor = corDa(catalogo, i.categoria)
        return (
          <span key={k} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: cor, background: `${cor}1e` }} title={i.categoriaLabel}>
            <span className="tabular-nums">{i.quantidade}×</span> {i.itemLabel}
          </span>
        )
      })}
    </div>
  )
}

/**
 * As etapas na vertical, no lugar do "próxima etapa" dos chamados: o que já foi marcado
 * vira linha com quem e quando; a próxima é o botão; as seguintes esperam a vez.
 */
function Etapas({ p, podeMarcar, onMarcar, onDesfazer, ocupado }: {
  p: Pedido
  podeMarcar: boolean
  onMarcar: (e: Etapa) => void
  onDesfazer: (e: Etapa) => void
  ocupado: Etapa | null
}) {
  const etapas = etapasDe(p.modalidade, p)
  const proxima = etapas.find((e) => !p[e.em])?.id
  const ultima = [...etapas].reverse().find((e) => p[e.em])?.id
  const stop = (fn: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); fn() }
  return (
    <div className="mt-2 space-y-1">
      {etapas.map((e) => {
        if (p[e.em]) {
          return (
            <div key={e.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]" style={{ color: e.cor, background: `${e.cor}14` }}>
              {e.id === 'feito' && p.resultado === 'nao_resolvido' ? <X size={12} className="shrink-0" /> : <Check size={12} className="shrink-0" />}
              <span className="font-semibold">{e.label}</span>
              <span className="min-w-0 truncate text-slate-400" title={e.id === 'feito' && p.resultadoObs ? p.resultadoObs : undefined}>· {p[e.por]} · {fmtDataHora(p[e.em]!)}</span>
              {podeMarcar && ultima === e.id && (
                <button onClick={stop(() => onDesfazer(e.id))} className="ml-auto shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title={`Desfazer ${e.label.toLowerCase()}`} aria-label={`Desfazer ${e.label.toLowerCase()}`}>
                  <Undo2 size={12} />
                </button>
              )}
            </div>
          )
        }
        if (e.id === proxima && podeMarcar) {
          return (
            <button
              key={e.id}
              onClick={stop(() => onMarcar(e.id))}
              disabled={ocupado === e.id}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-[12px] font-semibold disabled:opacity-60"
              style={{ color: e.cor, borderColor: `${e.cor}66`, background: `${e.cor}12` }}
            >
              {ocupado === e.id ? <Loader2 size={13} className="animate-spin" /> : <span className="h-3 w-3 rounded border border-current" />} {e.acao}
            </button>
          )
        }
        return (
          <div key={e.id} className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-800 px-2 py-1 text-[11px] text-slate-600">
            <span className="h-3 w-3 rounded border border-current" /> {e.label}
          </div>
        )
      })}
    </div>
  )
}

/**
 * "Adicionar item" abre a lista na hora — categoria em cima, os modelos embaixo, com o
 * valor de cada um. Um <select> nativo exigiria um segundo toque para abrir.
 */
function EscolherItem({ catalogo, verValores, onEscolher }: { catalogo: CategoriaCatalogo[]; verValores: boolean; onEscolher: (c: CategoriaCatalogo, i: CategoriaCatalogo['itens'][number]) => void }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickFora(ref, aberto, () => setAberto(false))
  return (
    <div ref={ref} className="relative">
      <Button type="button" size="sm" variant="subtle" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        <Plus size={13} /> Adicionar item <ChevronDown size={12} className={aberto ? 'rotate-180' : ''} />
      </Button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1 max-h-72 w-72 max-w-[calc(100vw-3rem)] overflow-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl" role="menu">
          {catalogo.map((c) => (
            <div key={c.key}>
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.label}
              </div>
              {c.itens.length === 0 && <div className="px-3 py-1 text-[12px] text-slate-600">sem itens — cadastre em "Categorias e itens"</div>}
              {c.itens.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  onClick={() => { onEscolher(c, it); setAberto(false) }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 pl-6 text-left text-[13px] text-slate-200 hover:bg-slate-800"
                >
                  <span className="truncate">{it.label}</span>
                  {verValores && it.valor != null && <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{brl(it.valor)}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface PForm {
  modalidade: ModalidadePedido
  localId: string
  bloco: string
  apartamento: string
  solicitante: string
  pedidoEm: string
  itens: ItemPedido[]
  seriais: string
  observacao: string
  comprovantes: string[]
  portao: string
  doSaldo: boolean
  /** Datas das etapas já marcadas — só se mexe com `ajustar_datas_pedido`. */
  datas: Partial<Record<'pagoEm' | 'feitoEm' | 'entregueEm', string>>
}
const vazio = (modalidade: ModalidadePedido = 'pedido', localId = ''): PForm => ({
  modalidade, localId, bloco: '', apartamento: '', solicitante: '', pedidoEm: agoraLocal(), itens: [], seriais: '', observacao: '', comprovantes: [],
  portao: '', doSaldo: false, datas: {},
})

/**
 * CONTROLES & TAGS. Alguém pede; o operador lança (de preferência já com o comprovante);
 * o técnico configura e marca feito; depois entrega. Em cima, as faixas do que está andando
 * (recém pedidos, feitos); embaixo, os entregues por data — como os concluídos dos chamados.
 */
export default function Pedidos() {
  const locais = useStore((s) => s.locais)
  const settings = useStore((s) => s.settings)
  const setSetting = useStore((s) => s.setSetting)
  const showToast = useStore((s) => s.showToast)
  const me = useCurrentUser()
  const canCreate = useCan('criar_pedidos')
  const canMarcar = useCan('marcar_etapas_pedido')
  const canEditOutros = useCan('editar_pedidos')
  const canExcluirOutros = useCan('excluir_pedidos')
  const canCatalogo = useCan('gerenciar_catalogo_pedidos')
  const canValores = useCan('ver_valores_pedido') || canCatalogo
  const canAjustarDatas = useCan('ajustar_datas_pedido')

  const catalogo = useMemo(() => parseCatalogo(settings), [settings])

  const [itens, setItens] = useState<Pedido[] | null>(null)
  const [saldos, setSaldos] = useState<SaldoLocal[]>([])
  const [verSaldos, setVerSaldos] = useState(false)
  const [modalidade, setModalidade] = useState<'' | ModalidadePedido>('')
  const [localId, setLocalId] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Pedido | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Pedido | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [form, setForm] = useState<PForm>(vazio())
  const [comSerial, setComSerial] = useState(false)
  const [comObs, setComObs] = useState(false)
  const [comComprovante, setComComprovante] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editandoCatalogo, setEditandoCatalogo] = useState(false)
  const [relatorio, setRelatorio] = useState(false)
  const [ocupado, setOcupado] = useState<{ id: string; etapa: Etapa } | null>(null)
  /** Janela que pede a prova da etapa: comprovante (pago) ou serial/foto (feito). */
  const [prova, setProva] = useState<{ p: Pedido; etapa: Etapa; comprovantes: string[]; seriais: string; fotos: string[]; resultado?: 'resolvido' | 'nao_resolvido'; resultadoObs?: string } | null>(null)
  const [previa, setPrevia] = useState<string[] | null>(null)
  /** Serial sendo escrito no detalhe (null = fechado). */
  const [serialDetalhe, setSerialDetalhe] = useState<string | null>(null)
  // Período, em cima, como nos concluídos dos chamados. Começa em "Tudo" e vale para o
  // quadro inteiro, pela data do pedido.
  const [periodo, setPeriodo] = useState<'tudo' | 'semana' | 'custom'>('tudo')
  const [semana, setSemana] = useState<Date>(() => inicioDaSemana(new Date()))
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const carregar = useCallback(
    () => Promise.all([
      api.pedidos().then(setItens).catch(() => { setItens([]); showToast('Não foi possível carregar os pedidos') }),
      api.saldosPedidos().then(setSaldos).catch(() => {}),
    ]),
    [showToast],
  )
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const id = setInterval(carregar, 30000); return () => clearInterval(id) }, [carregar])

  const ehMeu = (p: Pedido) => !!p.autorId && p.autorId === me.id
  const podeEditar = (p: Pedido) => canEditOutros || (canCreate && ehMeu(p))
  const podeExcluir = (p: Pedido) => canExcluirOutros || (canCreate && ehMeu(p))
  const podeFotos = (p: Pedido) => podeEditar(p) || canMarcar

  function openNew() {
    const f = vazio(modalidade || 'pedido')
    setForm(comLocal(f, localId || (locais.length === 1 ? locais[0].id : '')))
    setComSerial(false)
    setComObs(false)
    setComComprovante(false)
    setEditing('new')
  }
  function openEdit(p: Pedido) {
    setForm({
      modalidade: p.modalidade, localId: p.localId ?? '', bloco: p.bloco, apartamento: p.apartamento,
      solicitante: p.solicitante ?? '', pedidoEm: paraInputLocal(p.pedidoEm), itens: p.itens.map((i) => ({ ...i })),
      seriais: p.seriais, observacao: p.observacao, comprovantes: [...p.comprovantes],
      portao: p.portao ?? '', doSaldo: !!p.doSaldo,
      datas: Object.fromEntries((['pagoEm', 'feitoEm', 'entregueEm'] as const).filter((k) => p[k]).map((k) => [k, paraInputLocal(p[k]!)])),
    })
    setComSerial(!!p.seriais)
    setComObs(!!p.observacao)
    setComComprovante(p.comprovantes.length > 0)
    setAberto(null)
    setEditing(p)
  }
  useEffect(() => {
    const h = () => { if (canCreate) openNew() }
    window.addEventListener('shortcut:new', h)
    return () => window.removeEventListener('shortcut:new', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, modalidade, localId, locais])

  const trocar = (p: Pedido) => setItens((xs) => (xs ?? []).map((x) => (x.id === p.id ? p : x)))

  async function salvar() {
    const lote = form.modalidade === 'lote'
    if (!form.localId) return showToast('Escolha o local do pedido')
    if (!lote && !form.apartamento.trim()) return showToast('Informe o apartamento')
    if (!form.itens.length) return showToast('Adicione ao menos um item')
    if (editing === 'new' && precisaPortao && !form.portao.trim()) return showToast('Informe em qual portão vai ser configurado')
    const body: Record<string, unknown> = {
      modalidade: form.modalidade, localId: form.localId,
      bloco: lote ? '' : form.bloco.trim(), apartamento: lote ? '' : form.apartamento.trim(),
      solicitante: form.solicitante.trim() || null,
      pedidoEm: form.pedidoEm ? new Date(form.pedidoEm).toISOString() : undefined,
      itens: form.itens, seriais: form.seriais.trim(), observacao: form.observacao.trim(),
      portao: precisaPortao ? form.portao.trim() : '',
    }
    // Datas das etapas: só vão quando mudaram — o servidor exige a permissão para isso.
    if (editing && editing !== 'new' && canAjustarDatas) {
      for (const k of ['pagoEm', 'feitoEm', 'entregueEm'] as const) {
        const v = form.datas[k]
        if (v && editing[k] && paraInputLocal(editing[k]!) !== v) body[k] = new Date(v).toISOString()
      }
    }
    // Quem não vê o comprovante não o reenvia (recebeu a lista vazia).
    if (editing === 'new' || (editing && editing.podeVerComprovante)) body.comprovantes = form.comprovantes
    setSaving(true)
    try {
      if (editing === 'new') {
        const p = await api.createPedido(body)
        showToast(p.pagoEm ? `${p.code} lançado e já pago` : `${p.code} lançado`)
      } else if (editing) {
        await api.updatePedido(editing.id, body)
        showToast('Pedido salvo')
      }
      setEditing(null)
      await carregar()
    } catch (e: any) {
      showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o pedido')
    } finally {
      setSaving(false)
    }
  }

  async function enviarEtapa(p: Pedido, etapa: Etapa, valor: boolean, extra: Record<string, unknown> = {}) {
    setOcupado({ id: p.id, etapa })
    try {
      trocar(await api.etapaPedido(p.id, etapa, valor, extra))
      return true
    } catch (e: any) {
      showToast(e?.message ?? 'Não foi possível marcar')
      return false
    } finally {
      setOcupado(null)
    }
  }

  /** Cada etapa pede a sua prova — faltando, abre a janela; tendo, marca direto. */
  function marcar(p: Pedido, etapa: Etapa) {
    if (etapa === 'pago' && !p.qtdComprovantes) return setProva({ p, etapa, comprovantes: [], seriais: '', fotos: [] })
    if (etapa === 'feito' && p.modalidade === 'pedido' && !p.seriais.trim() && !p.fotos.length) return setProva({ p, etapa, comprovantes: [], seriais: '', fotos: [] })
    // Manutenção fecha sempre pela janela: resolvido ou não, e o que aconteceu.
    if (etapa === 'feito' && p.modalidade === 'manutencao') return setProva({ p, etapa, comprovantes: [], seriais: '', fotos: [], resultadoObs: '' })
    enviarEtapa(p, etapa, true)
  }

  async function confirmarProva() {
    if (!prova) return
    const { p, etapa } = prova
    const manutencao = etapa === 'feito' && p.modalidade === 'manutencao'
    if (etapa === 'pago' && !prova.comprovantes.length) return showToast('Anexe o comprovante')
    if (manutencao) {
      if (!prova.resultado) return showToast('Diga se foi resolvido ou não')
      if (!prova.resultadoObs?.trim()) return showToast('Descreva o que aconteceu')
    } else if (etapa === 'feito' && !prova.seriais.trim() && !prova.fotos.length) return showToast('Informe o serial ou tire a foto do serial')
    const extra = etapa === 'pago'
      ? { comprovantes: [...p.comprovantes, ...prova.comprovantes] }
      : manutencao
        ? { resultado: prova.resultado, resultadoObs: prova.resultadoObs!.trim() }
        : { seriais: prova.seriais.trim(), fotos: prova.fotos }
    if (await enviarEtapa(p, etapa, true, extra)) setProva(null)
  }

  async function salvarNoDetalhe(p: Pedido, body: Record<string, unknown>) {
    try { trocar(await api.updatePedido(p.id, body)); return true } catch (e: any) { showToast(e?.message ?? 'Não foi possível salvar'); return false }
  }

  const fimDaSemana = new Date(semana.getTime() + 7 * DIA_MS)
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    const ini = periodo === 'semana' ? semana.getTime() : periodo === 'custom' && de ? new Date(`${de}T00:00:00`).getTime() : -Infinity
    const fim = periodo === 'semana' ? semana.getTime() + 7 * DIA_MS : periodo === 'custom' && ate ? new Date(`${ate}T23:59:59`).getTime() + 1 : Infinity
    return (itens ?? []).filter((p) => {
      if (modalidade && p.modalidade !== modalidade) return false
      if (localId && p.localId !== localId) return false
      const quando = new Date(p.pedidoEm).getTime()
      if (quando < ini || quando >= fim) return false
      if (!t) return true
      return `${p.code} ${p.localName ?? ''} ${p.bloco} ${p.apartamento} ${p.solicitante ?? ''} ${p.seriais} ${p.observacao} ${p.autorName} ${p.itens.map((i) => i.itemLabel).join(' ')}`.toLowerCase().includes(t)
    })
  }, [itens, q, modalidade, localId, periodo, semana, de, ate])

  const faixas = useMemo(() => [
    { id: 'pedidos', titulo: 'Recém pedidos', cor: '#fbbf24', itens: filtrados.filter((p) => !p.entregueEm && !pronto(p)) },
    { id: 'feitos', titulo: 'Feitos — prontos para entregar', cor: '#38bdf8', itens: filtrados.filter((p) => !p.entregueEm && pronto(p)) },
  ], [filtrados])

  const entregues = useMemo(
    () => filtrados.filter((p) => p.entregueEm).sort((a, b) => new Date(b.entregueEm!).getTime() - new Date(a.entregueEm!).getTime()),
    [filtrados],
  )
  const naJanela = entregues
  const porDia = useMemo(() => {
    const grupos: { dia: string; itens: Pedido[] }[] = []
    for (const p of naJanela) {
      const dia = new Date(p.entregueEm!).toDateString()
      const g = grupos[grupos.length - 1]
      if (g && g.dia === dia) g.itens.push(p)
      else grupos.push({ dia, itens: [p] })
    }
    return grupos
  }, [naJanela])
  const todosPorData = (itens ?? []).map((p) => new Date(p.pedidoEm).getTime())
  const maisAntigo = todosPorData.length ? new Date(Math.min(...todosPorData)) : null
  const temAnterior = !!(maisAntigo && maisAntigo.getTime() < semana.getTime())
  const temProxima = fimDaSemana.getTime() < Date.now()

  const detalhe = aberto ? (itens ?? []).find((p) => p.id === aberto) ?? null : null
  useEffect(() => { setSerialDetalhe(null) }, [aberto])
  const lote = form.modalidade === 'lote'
  const localDoForm = locais.find((l) => l.id === form.localId)
  const saldoDoForm = saldos.find((s) => s.localId === form.localId)
  /** Quanto resta de um item no saldo do local do formulário (somando o que ESTE pedido já tirou). */
  const restaNoSaldo = (categoria: string, item: string) => {
    const linha = saldoDoForm?.itens.find((i) => i.categoria === categoria && i.item === item)
    if (!linha) return 0
    const jaMeu = editing && editing !== 'new' && editing.doSaldo && editing.localId === form.localId
      ? editing.itens.filter((i) => i.categoria === categoria && i.item === item).reduce((s, i) => s + i.quantidade, 0)
      : 0
    return linha.saldo + jaMeu
  }
  const precisaPortao = form.modalidade !== 'lote' && form.itens.some((i) => pedePortao(catalogo.find((c) => c.key === i.categoria)))
  /** Os itens que o local usa (cadastro do local); vazio = o catálogo inteiro. */
  const catalogoDoLocal = useMemo(() => {
    const usa = localDoForm?.itensPedido ?? []
    if (!usa.length) return catalogo
    return catalogo.map((c) => (c.tipo === 'manutencao' ? c : { ...c, itens: c.itens.filter((i) => usa.includes(`${c.key}|${i.key}`)) })).filter((c) => c.itens.length)
  }, [catalogo, localDoForm])
  /** Portões já usados neste local — sugestão, não lista fechada. */
  const portoesDoLocal = useMemo(
    () => [...new Set((itens ?? []).filter((p) => p.localId === form.localId && p.portao).map((p) => p.portao))].sort(),
    [itens, form.localId],
  )
  /**
   * Abater do saldo não é escolha: é o LOCAL que diz se usa lote (o servidor decide igual).
   * Aqui é só para a tela mostrar quanto sobra.
   */
  const comLocal = (f: PForm, localId: string, modalidade = f.modalidade): PForm => {
    const usa = modalidade === 'pedido' && !!locais.find((l) => l.id === localId)?.usaLote
    return { ...f, localId, modalidade, doSaldo: usa }
  }

  const cartao = (p: Pedido) => {
    const m = modalidadeDe(p.modalidade)
    const MIcon = m.icon
    const total = totalDe(p.itens)
    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        onClick={() => setAberto(p.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setAberto(p.id) }}
        className="flex cursor-pointer flex-col rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 outline-none hover:border-red-700/50 focus-visible:border-red-600"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-slate-500">{p.code}</span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"><MIcon size={10} /> {m.curto}</span>
          {p.modalidade === 'lote' && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">Consignado</span>}
          {p.doSaldo && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300" title="Abatido do saldo consignado do local">do saldo</span>}
          <span className="ml-auto text-[10px] text-slate-500">{fmtDataHora(p.pedidoEm)}</span>
        </div>
        {/* Local, bloco e apartamento na mesma linha; quem pediu logo embaixo. */}
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[13px] font-medium text-slate-100">
          <Building2 size={13} className="shrink-0 text-slate-500" /> <span className="truncate">{ondeDe(p)}</span>
        </div>
        {p.solicitante && <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-slate-400"><Phone size={11} className="shrink-0" /> <span className="truncate">{p.solicitante}</span></div>}
        {p.portao && <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-slate-400"><DoorOpen size={11} className="shrink-0" /> <span className="truncate">Portão: {p.portao}</span></div>}

        <div className="mt-1.5"><Itens itens={p.itens} catalogo={catalogo} /></div>
        {p.resultadoObs && <p className="mt-1.5 line-clamp-2 text-[11px] text-slate-400"><span className={p.resultado === 'nao_resolvido' ? 'text-orange-400' : 'text-pink-400'}>{p.resultado === 'nao_resolvido' ? 'Não resolvido' : 'Resolvido'}:</span> {p.resultadoObs}</p>}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          {canValores && total > 0 && <span className="font-medium text-slate-300">{brl(total)}</span>}
          {p.seriais && <span className="min-w-0 truncate font-mono" title={p.seriais}>SN {p.seriais.split('\n').filter(Boolean).join(' · ')}</span>}
          {p.fotos.length > 0 && <span className="inline-flex items-center gap-1"><Camera size={11} /> {p.fotos.length}</span>}
          {p.qtdComprovantes > 0 && (p.podeVerComprovante ? (
            // Quem pode ver confere o comprovante direto do cartão, sem abrir o pedido.
            <button onClick={(e) => { e.stopPropagation(); setPrevia(p.comprovantes) }} className="inline-flex items-center gap-1 text-emerald-400/90 hover:underline">
              <Paperclip size={11} /> comprovante
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-500" title="Sem permissão para ver"><Lock size={10} /> comprovante</span>
          ))}
        </div>

        <Etapas
          p={p}
          podeMarcar={canMarcar}
          ocupado={ocupado?.id === p.id ? ocupado.etapa : null}
          onMarcar={(e) => marcar(p, e)}
          onDesfazer={(e) => enviarEtapa(p, e, false)}
        />
      </div>
    )
  }

  const faixa = (titulo: string, cor: string, n: number) => (
    <div className="mb-2 flex items-center gap-2 px-1">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</span>
      <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">{n}</span>
      <span className="h-px flex-1 bg-slate-800" />
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Controles & Tags"
        subtitle="Do pedido à entrega: pago, feito, entregue"
        actions={canCreate && <Button onClick={openNew}><Plus size={15} /> Novo pedido</Button>}
        menu={[
          { label: 'Relatório', icon: <FileBarChart size={15} />, onClick: () => setRelatorio(true) },
          canCatalogo && { label: 'Categorias e itens', icon: <Tags size={15} />, onClick: () => setEditandoCatalogo(true) },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input data-busca value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, apto, serial, item…" aria-label="Buscar pedidos" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500" />
        </div>
        <Select value={modalidade} onValueChange={(v) => setModalidade(v as '' | ModalidadePedido)} aria-label="Modalidade">
          <option value="">Todas as modalidades</option>
          {MODALIDADES.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
        </Select>
        <Select value={localId} onValueChange={setLocalId} aria-label="Local">
          <option value="">Todos os locais</option>
          {locais.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
        </Select>
      </div>

      {/* Período em cima, igual aos concluídos dos chamados — vale para o quadro todo. */}
      <div className="mb-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {periodo === 'semana' ? (
              <>
                <button onClick={() => setSemana((x) => new Date(x.getTime() - 7 * DIA_MS))} disabled={!temAnterior} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30" aria-label="Semana anterior"><ChevronLeft size={16} /></button>
                <span className="inline-flex items-center gap-1.5 px-1 text-[12px] text-slate-300"><CalendarDays size={13} className="text-slate-500" />{curto(semana)} a {curto(new Date(fimDaSemana.getTime() - DIA_MS))}</span>
                <button onClick={() => setSemana((x) => new Date(x.getTime() + 7 * DIA_MS))} disabled={!temProxima} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30" aria-label="Próxima semana"><ChevronRight size={16} /></button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 text-[12px] text-slate-300"><CalendarDays size={13} className="text-slate-500" /> {periodo === 'tudo' ? 'Todos os pedidos' : 'Período escolhido'}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">{filtrados.length} de {(itens ?? []).length}</span>
            <Select className="py-1 text-xs" value={periodo} onValueChange={(v) => setPeriodo(v as typeof periodo)} aria-label="Período">
              <option value="tudo">Tudo</option>
              <option value="semana">Por semana</option>
              <option value="custom">Escolher datas</option>
            </Select>
          </div>
        </div>
        {periodo === 'custom' && (
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

      {/* Os locais que têm lote consignado e quanto ainda resta — o estado de agora. */}
      {saldos.length > 0 && (
        <section className="mb-5 rounded-lg border border-violet-900/40 bg-violet-500/[0.03] p-2">
          <button onClick={() => setVerSaldos((v) => !v)} className="flex w-full items-center gap-2 px-1 py-0.5 text-left" aria-expanded={verSaldos}>
            <Boxes size={14} className="text-violet-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Saldo consignado</span>
            <span className="text-[11px] text-slate-500">{saldos.length} local(is) · {saldos.reduce((s, x) => s + x.saldo, 0)} unidade(s) disponíveis</span>
            <ChevronDown size={14} className={`ml-auto text-slate-500 transition-transform ${verSaldos ? 'rotate-180' : ''}`} />
          </button>
          {verSaldos && (
            <div className="mt-2">
              <SaldosConsignados saldos={saldos} catalogo={catalogo} onLocal={(id) => setLocalId(id)} />
            </div>
          )}
        </section>
      )}

      {itens === null ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : (
        <div className="space-y-6">
          {faixas.map((f) => (
            <section key={f.id}>
              {faixa(f.titulo, f.cor, f.itens.length)}
              {f.itens.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-slate-600">nada aqui</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{f.itens.map(cartao)}</div>
              )}
            </section>
          ))}

          {/* Entregues: como os concluídos dos chamados — semana a semana, separados por data. */}
          <section>
            {faixa('Entregues', '#a78bfa', naJanela.length)}
            {porDia.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-slate-600">Nada entregue{periodo === 'tudo' ? ' ainda' : ' no período'}.</div>
            ) : (
              <ol className="relative ml-2 border-l border-slate-800">
                {porDia.map((g) => (
                  <li key={g.dia} className="relative mb-6 ml-5 last:mb-0">
                    <span className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] bg-violet-400" />
                    <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className="first-letter:uppercase">{rotuloDia(g.itens[0].entregueEm!)}</span>
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">{g.itens.length}</span>
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{g.itens.map(cartao)}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {/* Detalhe: clicar no cartão abre, e é daqui que se põe serial e foto do controle. */}
      {detalhe && (
        <Modal
          open
          wide
          onClose={() => setAberto(null)}
          tituloTexto={`${detalhe.code} · ${ondeDe(detalhe)}`}
          title={
            <div className="min-w-0">
              <div className="font-mono text-[11px] tracking-wide text-red-400/80">{detalhe.code} · {modalidadeDe(detalhe.modalidade).label}</div>
              <h2 className="truncate text-[15px] font-semibold leading-tight text-slate-100">{ondeDe(detalhe)}</h2>
            </div>
          }
          footer={
            <>
              {podeExcluir(detalhe) && <Button variant="subtle" onClick={() => { setDeleting(detalhe); setAberto(null) }}><Trash2 size={14} /> Excluir</Button>}
              {podeEditar(detalhe) && <Button variant="subtle" onClick={() => openEdit(detalhe)}><Pencil size={14} /> Editar</Button>}
              <Button onClick={() => setAberto(null)}>Fechar</Button>
            </>
          }
        >
          <div className="space-y-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-slate-400">
              {detalhe.solicitante && <><span className="inline-flex items-center gap-1"><Phone size={12} className="text-slate-500" />{detalhe.solicitante}</span><span className="text-slate-700">·</span></>}
              <span className="inline-flex items-center gap-1"><CalendarClock size={12} className="text-slate-500" />pedido em {fmtDataHora(detalhe.pedidoEm)}</span>
              <span className="text-slate-700">·</span>
              <span className="inline-flex items-center gap-1"><AvatarPessoa nome={detalhe.autorName} id={detalhe.autorId} size={16} />lançado por {detalhe.autorName}</span>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Itens</div>
              <div className="space-y-1">
                {detalhe.itens.map((i, k) => (
                  <div key={k} className="flex items-center justify-between gap-2 rounded bg-slate-900/60 px-2 py-1 text-[12px]">
                    <span className="min-w-0 truncate text-slate-200">
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: corDa(catalogo, i.categoria) }} />
                      {i.quantidade}× {i.categoriaLabel} · <span className="font-medium">{i.itemLabel}</span>
                    </span>
                    {canValores && <span className="shrink-0 tabular-nums text-slate-400">{i.valor != null ? brl(i.valor * i.quantidade) : '—'}</span>}
                  </div>
                ))}
                {canValores && totalDe(detalhe.itens) > 0 && <div className="text-right text-[12px] font-medium text-slate-200">Total {brl(totalDe(detalhe.itens))}</div>}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Serial</span>
                {podeFotos(detalhe) && serialDetalhe === null && detalhe.modalidade !== 'lote' && (
                  <button onClick={() => setSerialDetalhe(detalhe.seriais)} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800">
                    {detalhe.seriais ? <><Pencil size={11} /> Editar serial</> : <><Plus size={11} /> Adicionar serial</>}
                  </button>
                )}
              </div>
              {serialDetalhe !== null ? (
                <div className="space-y-1.5">
                  <Textarea rows={2} value={serialDetalhe} onChange={(e) => setSerialDetalhe(maiusculas(e.target.value))} placeholder="Um por linha" className="font-mono uppercase" autoFocus />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="subtle" onClick={() => setSerialDetalhe(null)}>Cancelar</Button>
                    <Button size="sm" onClick={async () => { if (await salvarNoDetalhe(detalhe, { seriais: serialDetalhe.trim() })) setSerialDetalhe(null) }}>Salvar serial</Button>
                  </div>
                </div>
              ) : detalhe.seriais ? (
                <p className="whitespace-pre-wrap font-mono text-[12px] text-slate-200">{detalhe.seriais}</p>
              ) : (
                <p className="text-[12px] text-slate-600">Sem serial ainda.</p>
              )}
            </div>

            {(detalhe.portao || detalhe.doSaldo || detalhe.modalidade === 'lote') && (
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                {detalhe.portao && <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-slate-200"><DoorOpen size={12} className="text-slate-400" /> Portão: {detalhe.portao}</span>}
                {detalhe.doSaldo && <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-violet-300">Abatido do saldo consignado</span>}
                {detalhe.modalidade === 'lote' && (() => {
                  const s = saldos.find((x) => x.localId === detalhe.localId)
                  return <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-violet-300">Consignado{s ? ` · o local tem ${s.saldo} de ${s.consignado} em saldo` : ''}</span>
                })()}
              </div>
            )}

            {detalhe.observacao && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{detalhe.modalidade === 'manutencao' ? 'Defeito' : 'Observação'}</div>
                <p className="whitespace-pre-wrap text-slate-300">{detalhe.observacao}</p>
              </div>
            )}

            {detalhe.resultadoObs && (
              <div>
                <div className={`text-[10px] font-medium uppercase tracking-wide ${detalhe.resultado === 'nao_resolvido' ? 'text-orange-400' : 'text-pink-400'}`}>
                  {detalhe.resultado === 'nao_resolvido' ? 'Não resolvido' : 'Resolvido'} — o que aconteceu
                </div>
                <p className="whitespace-pre-wrap text-slate-300">{detalhe.resultadoObs}</p>
              </div>
            )}

            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Fotos do serial / do controle</div>
              {podeFotos(detalhe)
                ? <PhotoInput photos={detalhe.fotos} onChange={(fotos) => salvarNoDetalhe(detalhe, { fotos })} />
                : detalhe.fotos.length ? <PhotoInput photos={detalhe.fotos} /> : <p className="text-[12px] text-slate-600">Nenhuma foto.</p>}
            </div>

            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Comprovante</div>
              {detalhe.podeVerComprovante ? (
                detalhe.comprovantes.length ? <Comprovantes lista={detalhe.comprovantes} /> : <p className="text-[12px] text-slate-600">Sem comprovante ainda.</p>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-[12px] text-slate-500"><Lock size={12} /> {detalhe.qtdComprovantes ? 'Anexado — você não tem permissão para ver.' : 'Sem comprovante ainda.'}</p>
              )}
            </div>

            <Etapas
              p={detalhe}
              podeMarcar={canMarcar}
              ocupado={ocupado?.id === detalhe.id ? ocupado.etapa : null}
              onMarcar={(e) => marcar(detalhe, e)}
              onDesfazer={(e) => enviarEtapa(detalhe, e, false)}
            />
          </div>
        </Modal>
      )}

      {previa && <PreviaComprovante lista={previa} onClose={() => setPrevia(null)} />}

      {/* A prova que a etapa pede: sem ela a etapa não fecha. */}
      {prova && (
        <Modal
          open
          onClose={() => setProva(null)}
          title={prova.etapa === 'pago' ? `Pagamento de ${prova.p.code}` : prova.p.modalidade === 'manutencao' ? `Fechar manutenção ${prova.p.code}` : `Concluir ${prova.p.code}`}
          onSubmit={confirmarProva}
          footer={
            <>
              <Button variant="subtle" onClick={() => setProva(null)}>Cancelar</Button>
              <Button onClick={confirmarProva} disabled={!!ocupado}>{ocupado && <Loader2 size={14} className="animate-spin" />} <Check size={14} /> {prova.etapa === 'pago' ? 'Marcar pago' : prova.p.modalidade === 'manutencao' ? 'Fechar' : 'Marcar feito'}</Button>
            </>
          }
        >
          {prova.etapa === 'pago' ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">Para marcar como pago, anexe o comprovante (foto ou PDF).</p>
              <Comprovantes lista={prova.comprovantes} onChange={(comprovantes) => setProva({ ...prova, comprovantes })} />
            </div>
          ) : prova.p.modalidade === 'manutencao' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Resultado da manutenção">
                {([['resolvido', 'Resolvido', '#f472b6'], ['nao_resolvido', 'Não resolvido', '#fb923c']] as const).map(([v, l, cor]) => {
                  const on = prova.resultado === v
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setProva({ ...prova, resultado: v })}
                      className="flex items-center justify-center gap-1.5 rounded-lg border py-3 text-sm font-semibold"
                      style={on ? { color: cor, borderColor: `${cor}99`, background: `${cor}1a` } : { color: '#94a3b8', borderColor: '#334155' }}
                    >
                      {v === 'resolvido' ? <Check size={15} /> : <X size={15} />} {l}
                    </button>
                  )
                })}
              </div>
              <Field label="O que aconteceu" hint="obrigatório">
                <Textarea
                  rows={3}
                  value={prova.resultadoObs ?? ''}
                  onChange={(e) => setProva({ ...prova, resultadoObs: e.target.value })}
                  placeholder={prova.resultado === 'nao_resolvido' ? 'Ex.: placa queimada, precisa trocar o controle' : 'Ex.: trocada a pilha e reconfigurado no portão da garagem'}
                />
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">Para marcar como feito, informe o serial <span className="text-slate-500">ou</span> tire a foto do serial.</p>
              <Field label="Serial" hint="um por linha">
                <Textarea rows={2} value={prova.seriais} onChange={(e) => setProva({ ...prova, seriais: maiusculas(e.target.value) })} placeholder="Ex.: 4A1F-22C9" className="font-mono uppercase" autoFocus />
              </Field>
              <FieldBox label="Foto do serial / do controle">
                <PhotoInput photos={prova.fotos} onChange={(fotos) => setProva({ ...prova, fotos })} />
              </FieldBox>
            </div>
          )}
        </Modal>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Novo pedido' : `Editar ${typeof editing === 'object' && editing ? editing.code : ''}`}
        wide
        telaCheia
        onSubmit={salvar}
        footer={<><Button variant="subtle" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Salvar</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/40 p-0.5" role="radiogroup" aria-label="Modalidade">
            {MODALIDADES.map((m) => {
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={form.modalidade === m.id}
                  onClick={() => setForm(comLocal(form, form.localId, m.id))}
                  title={m.ajuda}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${form.modalidade === m.id ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Icon size={13} className="shrink-0" /> <span className="truncate">{m.label}</span>
                </button>
              )
            })}
          </div>

          {/* Local, bloco e apartamento numa faixa só. */}
          <div className={`grid gap-2 ${lote ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_4.5rem_4.5rem]'}`}>
            <FieldBox label="Local">
              <LocalSelect value={form.localId} onChange={(v) => setForm(comLocal(form, v))} />
            </FieldBox>
            {!lote && <Field label="Bloco"><Input value={form.bloco} onChange={(e) => setForm({ ...form, bloco: e.target.value })} placeholder="—" /></Field>}
            {!lote && <Field label="Apto"><Input value={form.apartamento} onChange={(e) => setForm({ ...form, apartamento: e.target.value })} placeholder="42" /></Field>}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <Field label="Quem pediu" hint="nome, telefone">
              <Input value={form.solicitante} onChange={(e) => setForm({ ...form, solicitante: e.target.value })} placeholder="Ex.: Sr. Carlos — (11) 9…" />
            </Field>
            <Field label="Pedido em">
              <Input type="datetime-local" value={form.pedidoEm} max={agoraLocal()} onChange={(e) => setForm({ ...form, pedidoEm: e.target.value })} />
            </Field>
          </div>

          <FieldBox label={form.modalidade === 'manutencao' ? 'Serviços e itens' : 'Itens'} hint={canValores ? 'o valor vem do catálogo e pode ser ajustado aqui' : undefined}>
            <div className="space-y-1.5">
              {form.itens.map((i, k) => {
                const cor = corDa(catalogo, i.categoria)
                const mudar = (parte: Partial<ItemPedido>) => setForm({ ...form, itens: form.itens.map((x, j) => (j === k ? { ...x, ...parte } : x)) })
                return (
                  <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: `${cor}55`, background: `${cor}0c` }}>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                      <span className="text-[11px] text-slate-400">{i.categoriaLabel} · </span>{i.itemLabel}
                      {form.doSaldo && form.modalidade === 'pedido' && (() => {
                        const sobra = restaNoSaldo(i.categoria, i.item) - i.quantidade
                        return <span className={`ml-1.5 text-[11px] ${sobra < 0 ? 'text-red-400' : 'text-violet-300'}`}>saldo fica {sobra}</span>
                      })()}
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => mudar({ quantidade: Math.max(1, i.quantidade - 1) })} className="rounded-md border border-slate-700 p-1 text-slate-300 hover:bg-slate-800" aria-label="Menos"><Minus size={12} /></button>
                      <input value={i.quantidade} onChange={(e) => mudar({ quantidade: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} inputMode="numeric" aria-label="Quantidade" className="w-10 rounded-md border border-slate-700 bg-slate-950 py-0.5 text-center text-sm tabular-nums text-slate-100 outline-none focus:border-red-500" />
                      <button type="button" onClick={() => mudar({ quantidade: i.quantidade + 1 })} className="rounded-md border border-slate-700 p-1 text-slate-300 hover:bg-slate-800" aria-label="Mais"><Plus size={12} /></button>
                    </div>
                    {/* Valor unitário: vem do catálogo, mas cada pedido pode ter o seu. */}
                    {canValores && <div className="relative w-24">
                      <span className="pointer-events-none absolute left-2 top-1 text-[11px] text-slate-500">R$</span>
                      <input
                        value={mostrarValor(i.valor)}
                        onChange={(e) => mudar({ valor: lerValor(e.target.value) })}
                        inputMode="decimal"
                        placeholder="valor"
                        aria-label="Valor unitário"
                        title="Valor unitário"
                        className="w-full rounded-md border border-slate-700 bg-slate-950 py-0.5 pl-7 pr-1.5 text-right text-sm tabular-nums text-slate-100 outline-none focus:border-red-500"
                      />
                    </div>}
                    <button type="button" onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== k) })} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Remover item"><X size={14} /></button>
                  </div>
                )
              })}
              <div className="flex items-center justify-between gap-2">
                <EscolherItem
                  verValores={canValores}
                  // Manutenção mostra os serviços primeiro (e os itens, se for trocar o aparelho);
                  // pedido e lote só os itens.
                  // Só os itens que o local usa (cadastro do local), quando ele diz quais.
                  catalogo={form.modalidade === 'manutencao'
                    ? [...catalogoDoLocal.filter((c) => c.tipo === 'manutencao'), ...catalogoDoLocal.filter((c) => c.tipo !== 'manutencao')]
                    : catalogoDoLocal.filter((c) => c.tipo !== 'manutencao')}
                  onEscolher={(c, it) => {
                    const ja = form.itens.findIndex((x) => x.categoria === c.key && x.item === it.key)
                    setForm({
                      ...form,
                      itens: ja >= 0
                        ? form.itens.map((x, j) => (j === ja ? { ...x, quantidade: x.quantidade + 1 } : x))
                        : [...form.itens, { categoria: c.key, categoriaLabel: c.label, item: it.key, itemLabel: it.label, quantidade: 1, valor: it.valor }],
                    })
                  }}
                />
                {canValores && totalDe(form.itens) > 0 && <span className="text-[12px] text-slate-300">Total <span className="font-semibold">{brl(totalDe(form.itens))}</span></span>}
              </div>
            </div>
          </FieldBox>

          {/* Controle e tag veicular vão num portão: é a primeira pergunta de quem configura. */}
          {precisaPortao && (
            <Field label="Portão" hint="em qual portão vai ser configurado">
              <Input value={form.portao} onChange={(e) => setForm({ ...form, portao: e.target.value })} placeholder="Ex.: Garagem, Social, Eclusa bloco B" list="portoes-do-local" />
              <datalist id="portoes-do-local">{portoesDoLocal.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
          )}

          {/* Local com lote consignado: todo pedido de morador sai do saldo — sem escolha.
              Faltando saldo, ele fica negativo (sinal de que precisa de outro lote). */}
          {form.modalidade === 'pedido' && form.doSaldo && (
            <div className="rounded-lg border border-violet-900/50 bg-violet-500/[0.05] px-3 py-2 text-[12px] text-slate-300">
              <span className="font-medium text-violet-300">Abate do saldo consignado</span> — {localDoForm?.name ?? 'o local'} usa pedido em lote
              {saldoDoForm ? <> e tem <span className={saldoDoForm.saldo < 0 ? 'text-red-400' : 'text-slate-100'}>{saldoDoForm.saldo}</span> de {saldoDoForm.consignado} unidade(s).</> : ', mas ainda não recebeu lote — o saldo vai ficar negativo.'}
            </div>
          )}

          {/* Datas das etapas já marcadas: acerto à mão, com permissão própria. */}
          {editing && editing !== 'new' && canAjustarDatas && Object.keys(form.datas).length > 0 && (
            <FieldBox label="Datas das etapas" hint="corrija quando a marcação foi feita depois">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {etapasDe(editing.modalidade, editing).filter((e) => form.datas[e.em]).map((e) => (
                  <label key={e.id} className="block">
                    <span className="mb-1 block text-[11px]" style={{ color: e.cor }}>{e.label}</span>
                    <Input type="datetime-local" value={form.datas[e.em]} max={agoraLocal()} onChange={(ev) => setForm({ ...form, datas: { ...form.datas, [e.em]: ev.target.value } })} />
                  </label>
                ))}
              </div>
            </FieldBox>
          )}

          {/* Serial e observação só abrem quando se precisa deles. */}
          {comSerial ? (
            <Field label="Serial" hint="um por linha">
              <Textarea rows={2} value={form.seriais} onChange={(e) => setForm({ ...form, seriais: maiusculas(e.target.value) })} placeholder={'Ex.: 4A1F-22C9\n4A1F-22D0'} className="font-mono uppercase" autoFocus={!form.seriais} />
            </Field>
          ) : null}
          {comObs ? (
            <Field label={form.modalidade === 'manutencao' ? 'Defeito / o que precisa' : 'Observação'}>
              <Textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder={form.modalidade === 'manutencao' ? 'Ex.: botão 2 não abre o portão da garagem' : 'Combinado, prazo, forma de pagamento…'} autoFocus={!form.observacao} />
            </Field>
          ) : null}
          {/* Comprovante depois dos itens: é quando já se sabe quanto pagar. */}
          {comComprovante && (editing === 'new' || (editing && editing.podeVerComprovante)) && (
            <FieldBox label="Comprovante" hint={form.modalidade === 'pedido' ? 'com ele o pedido já entra como pago' : undefined}>
              <Comprovantes lista={form.comprovantes} onChange={(comprovantes) => setForm({ ...form, comprovantes })} />
            </FieldBox>
          )}
          {(!comSerial || !comObs || !comComprovante) && (
            <div className="flex flex-wrap gap-2">
              {!comComprovante && (editing === 'new' || (editing && editing.podeVerComprovante)) && (
                <Button type="button" size="sm" variant="subtle" onClick={() => setComComprovante(true)}><Paperclip size={13} /> Adicionar comprovante</Button>
              )}
              {!comSerial && <Button type="button" size="sm" variant="subtle" onClick={() => setComSerial(true)}><Hash size={13} /> Adicionar serial</Button>}
              {!comObs && <Button type="button" size="sm" variant="subtle" onClick={() => setComObs(true)}><StickyNote size={13} /> {form.modalidade === 'manutencao' ? 'Adicionar defeito' : 'Adicionar observação'}</Button>}
            </div>
          )}
        </div>
      </Modal>

      {relatorio && <RelatorioModal catalogo={catalogo} onClose={() => setRelatorio(false)} />}

      {editandoCatalogo && (
        <EditorCatalogo
          inicial={catalogo}
          onClose={() => setEditandoCatalogo(false)}
          onSave={async (list) => {
            try {
              await setSetting('pedido_catalogo', JSON.stringify(list))
              showToast('Categorias e itens salvos')
              setEditandoCatalogo(false)
            } catch (e: any) {
              showToast(e?.message ?? 'Não foi possível salvar')
            }
          }}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Excluir pedido"
        footer={<><Button variant="subtle" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" onClick={async () => {
          const p = deleting
          setDeleting(null)
          if (!p) return
          try { await api.deletePedido(p.id); await carregar(); showToast(`${p.code} excluído`) } catch (e: any) { showToast(e?.message ?? 'Não foi possível excluir') }
        }}>Excluir</Button></>}
      >
        <p className="text-sm text-slate-300">Excluir <span className="font-medium text-slate-100">{deleting?.code}</span>? Comprovantes e fotos vão junto. Fica registrado na auditoria.</p>
      </Modal>
    </div>
  )
}

function ultimosMeses(n = 12) {
  const hoje = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
  })
}

/** CSV com `;` (abre direto no Excel em pt-BR) e BOM para os acentos. */
function baixarCsv(r: RelatorioPedidos) {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const n = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const cab = ['Código', 'Pedido em', 'Modalidade', 'Local', 'Bloco', 'Apto', 'Quem pediu', 'Portão', 'Do saldo', 'Categoria', 'Item', 'Qtd.', 'Valor unit.', 'Valor', 'Serial', 'Pago em', 'Feito/resolvido em', 'Resultado', 'Entregue em']
  const resultado = (p: Pedido) => (p.resultado ? `${p.resultado === 'resolvido' ? 'Resolvido' : 'Não resolvido'}: ${p.resultadoObs}` : '')
  const linhas = r.lista.flatMap((p) => p.itens.map((i) => [
    p.code, fmtDataHora(p.pedidoEm), modalidadeDe(p.modalidade).label, p.localName ?? '', p.bloco, p.apartamento, p.solicitante ?? '', p.portao, p.doSaldo ? 'sim' : '',
    i.categoriaLabel, i.itemLabel, i.quantidade, i.valor != null ? n(i.valor) : '', i.valor != null ? n(i.valor * i.quantidade) : '',
    p.seriais.replace(/\n/g, ' '), p.pagoEm ? fmtDataHora(p.pagoEm) : '', p.feitoEm ? fmtDataHora(p.feitoEm) : '', resultado(p).replace(/\n/g, ' '), p.entregueEm ? fmtDataHora(p.entregueEm) : '',
  ].map(esc).join(';')))
  const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `controles-e-tags-${r.periodo.mes}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Relatório próprio: os mesmos resumos do relatório mensal no topo e, embaixo, cada pedido. */
function RelatorioModal({ catalogo, onClose }: { catalogo: CategoriaCatalogo[]; onClose: () => void }) {
  const locais = useStore((s) => s.locais)
  const meses = useMemo(() => ultimosMeses(), [])
  const [mes, setMes] = useState(meses[0].key)
  const [localId, setLocalId] = useState('')
  const [dados, setDados] = useState<RelatorioPedidos | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    let vivo = true
    setErro(null)
    api.relatorioPedidos(mes, localId || undefined)
      .then((r) => { if (vivo) setDados(r) })
      .catch((e) => { if (vivo) { setDados(null); setErro(e?.message ?? 'Não foi possível carregar o relatório') } })
    return () => { vivo = false }
  }, [mes, localId])

  return (
    <Modal
      open
      wide
      telaCheia
      onClose={onClose}
      title="Relatório de Controles & Tags"
      footer={
        <>
          <Button variant="subtle" onClick={() => dados && baixarCsv(dados)} disabled={!dados?.lista.length}><Download size={14} /> CSV</Button>
          <Button
            variant="subtle"
            disabled={!dados || gerando}
            onClick={async () => {
              if (!dados) return
              setGerando(true)
              try {
                // A biblioteca do PDF só desce na hora de gerar.
                const { baixarPedidosPdf } = await import('@/lib/pedidosPdf')
                baixarPedidosPdf(dados, meses.find((m) => m.key === mes)?.label ?? mes, locais.find((l) => l.id === localId)?.name)
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
        ) : !dados ? (
          <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : (
          <>
            <ResumoPedidos r={dados.resumo} catalogo={catalogo} />

            {!!dados.saldos?.length && (
              <div>
                <div className="mb-2 text-[12px] font-medium text-slate-300">Saldo consignado <span className="text-slate-500">— o que cada local ainda tem hoje</span></div>
                <SaldosConsignados saldos={dados.saldos} catalogo={catalogo} />
              </div>
            )}

            <div>
              <div className="mb-2 text-[12px] font-medium text-slate-300">Pedidos do mês <span className="text-slate-500">({dados.lista.length})</span></div>
              {dados.lista.length === 0 ? (
                <EmptyState>Nenhum pedido neste mês.</EmptyState>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-medium">Pedido</th>
                        <th className="px-3 py-2 font-medium">Onde</th>
                        <th className="px-3 py-2 font-medium">Itens</th>
                        {dados.comValores && <th className="px-3 py-2 text-right font-medium">Valor</th>}
                        <th className="px-3 py-2 font-medium">Pago</th>
                        <th className="px-3 py-2 font-medium">Feito</th>
                        <th className="px-3 py-2 font-medium">Entregue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.lista.map((p) => (
                        <tr key={p.id} className="border-b border-slate-800/50 align-top last:border-0">
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="font-mono text-[11px] text-slate-400">{p.code}</div>
                            <div className="text-slate-500">{fmtDataHora(p.pedidoEm)}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {ondeDe(p)}
                            {p.solicitante && <div className="text-[11px] text-slate-500">{p.solicitante}</div>}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {p.itens.map((i, k) => <div key={k}>{i.quantidade}× {i.itemLabel}</div>)}
                            {p.seriais && <div className="font-mono text-[11px] text-slate-500">SN {p.seriais.split('\n').filter(Boolean).join(' · ')}</div>}
                          </td>
                          {dados.comValores && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-200">{totalDe(p.itens) ? brl(totalDe(p.itens)) : '—'}</td>}
                          {(['pagoEm', 'feitoEm', 'entregueEm'] as const).map((k) => (
                            <td key={k} className="whitespace-nowrap px-3 py-2 text-slate-400">{p[k] ? fmtDataHora(p[k]!) : <span className="text-slate-700">—</span>}</td>
                          ))}
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

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const chaveNova = (label: string, usadas: string[]) => {
  let k = slug(label) || `item-${usadas.length + 1}`
  while (usadas.includes(k)) k = `${k}-${usadas.length + 1}`
  return k
}

/**
 * Categorias (Controle, Tag…) com os itens dentro (Nice New Evo, Era 2…) e o valor de
 * cada item. Mudar aqui não reescreve pedido antigo: ele guardou o nome e o valor do dia.
 */
function EditorCatalogo({ inicial, onClose, onSave }: { inicial: CategoriaCatalogo[]; onClose: () => void; onSave: (l: CategoriaCatalogo[]) => void }) {
  const [lista, setLista] = useState<CategoriaCatalogo[]>(() => inicial.map((c) => ({ ...c, itens: c.itens.map((i) => ({ ...i })) })))
  const [novaCat, setNovaCat] = useState('')
  const [novoItem, setNovoItem] = useState<Record<string, string>>({})

  const mudarCat = (k: number, parte: Partial<CategoriaCatalogo>) => setLista(lista.map((c, j) => (j === k ? { ...c, ...parte } : c)))

  function addCat() {
    const label = novaCat.trim()
    if (!label) return
    setLista([...lista, { key: chaveNova(label, lista.map((c) => c.key)), label, color: CORES_CATEGORIA[lista.length % CORES_CATEGORIA.length], tipo: 'item', itens: [] }])
    setNovaCat('')
  }
  function addItem(k: number) {
    const c = lista[k]
    const label = (novoItem[c.key] ?? '').trim()
    if (!label) return
    mudarCat(k, { itens: [...c.itens, { key: chaveNova(label, c.itens.map((i) => i.key)), label, valor: null }] })
    setNovoItem({ ...novoItem, [c.key]: '' })
  }

  const vazioAlgum = lista.some((c) => !c.label.trim() || c.itens.some((i) => !i.label.trim()))

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Categorias e itens"
      footer={<><Button variant="subtle" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(lista)} disabled={!lista.length || vazioAlgum}>Salvar</Button></>}
    >
      <div className="space-y-3">
        <p className="text-[12px] text-slate-500">A categoria é o que se pede (Controle, Tag) ou o serviço de manutenção (Troca de pilha); dentro dela, os modelos, com o valor de cada um. Pedido antigo guarda o nome e o valor do dia em que foi lançado.</p>
        {lista.map((c, k) => (
          <div key={c.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
            <div className="flex items-center gap-2">
              {/* Seletor de cor do sistema: qualquer cor, não só as da paleta. */}
              <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-700" style={{ background: c.color }} title="Cor da categoria">
                <input type="color" value={c.color} onChange={(e) => mudarCat(k, { color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Cor de ${c.label}`} />
              </label>
              <Input value={c.label} onChange={(e) => mudarCat(k, { label: e.target.value })} className="flex-1 font-medium" aria-label="Nome da categoria" />
              {/* Item é o que se vende; manutenção é serviço (troca de pilha) — aparece no pedido de manutenção. */}
              <div className="flex shrink-0 rounded-lg border border-slate-700 p-0.5 text-[11px]" role="radiogroup" aria-label="Tipo da categoria">
                {([['item', 'Item'], ['manutencao', 'Manutenção']] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={(c.tipo ?? 'item') === v} onClick={() => mudarCat(k, { tipo: v })} className={`rounded-md px-2 py-1 ${(c.tipo ?? 'item') === v ? 'bg-slate-700 text-slate-100' : 'text-slate-400'}`}>{l}</button>
                ))}
              </div>
              {(c.tipo ?? 'item') === 'item' && (
                <button
                  type="button"
                  onClick={() => mudarCat(k, { pedePortao: !pedePortao(c) })}
                  aria-pressed={pedePortao(c)}
                  title="O pedido pergunta em qual portão vai ser configurado"
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${pedePortao(c) ? 'border-sky-700 bg-sky-500/10 text-sky-300' : 'border-slate-700 text-slate-500'}`}
                >
                  <DoorOpen size={12} /> Portão
                </button>
              )}
              <button type="button" onClick={() => setLista(lista.filter((_, j) => j !== k))} className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Remover categoria"><Trash2 size={14} /></button>
            </div>
            <div className="mt-2 space-y-1.5 pl-3">
              {c.itens.map((it, j) => (
                <div key={it.key} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                  <Input value={it.label} onChange={(e) => mudarCat(k, { itens: c.itens.map((x, m) => (m === j ? { ...x, label: e.target.value } : x)) })} className="flex-1" aria-label="Nome do item" />
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-2 top-2 text-[12px] text-slate-500">R$</span>
                    <Input
                      value={mostrarValor(it.valor)}
                      onChange={(e) => mudarCat(k, { itens: c.itens.map((x, m) => (m === j ? { ...x, valor: lerValor(e.target.value) } : x)) })}
                      inputMode="decimal"
                      placeholder="valor"
                      className="pl-8"
                      aria-label="Valor"
                    />
                  </div>
                  <button type="button" onClick={() => mudarCat(k, { itens: c.itens.filter((_, m) => m !== j) })} className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Remover item"><X size={14} /></button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={novoItem[c.key] ?? ''}
                  onChange={(e) => setNovoItem({ ...novoItem, [c.key]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addItem(k) } }}
                  placeholder={`Novo item em ${c.label || 'esta categoria'} (ex.: Nice New Evo)`}
                  className="flex-1"
                />
                <Button size="sm" variant="subtle" onClick={() => addItem(k)}><Plus size={13} /> Item</Button>
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            value={novaCat}
            onChange={(e) => setNovaCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addCat() } }}
            placeholder="Nova categoria (ex.: Controle de garagem)"
            className="flex-1"
          />
          <Button size="sm" onClick={addCat}><Plus size={13} /> Categoria</Button>
        </div>
      </div>
    </Modal>
  )
}
