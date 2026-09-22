import { useEffect, useMemo, useState } from 'react'
import { Wrench, Plus, Trash2, Save, Loader2, Clock, Package, Pencil, LogIn, LogOut, History, ArrowRightLeft } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'
import { PhotoInput } from './PhotoInput'
import { AvatarPessoa } from './Pessoa'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { fmtMinutos } from '@/lib/utils'
import { ehFalhaDeRede, enfileirar } from '@/lib/fila'
import type { ItemAtendimento, RegistroAtendimento, Ticket, Visita } from '@/lib/types'

/**
 * Uma ida ao local tem DOIS instantes: a chegada e a saída, cada um com a sua data. O
 * atendimento que começa 23h e termina 1h é comum, e tratar a saída como "hora do mesmo
 * dia" fazia a conta dar 22 horas de trabalho.
 */
interface VisitaForm {
  id?: string
  chegada: string // datetime-local
  saida: string // datetime-local (vazio = ainda no local)
  duracao: string // usado quando a pessoa só sabe quanto tempo ficou
  modo: 'horario' | 'tempo'
  tecnicoId?: string | null
  tecnicoNome?: string
}
interface ItemForm { id?: string; descricao: string; quantidade: string; tipo: 'trocado' | 'comprado'; valor: string }

/** ISO → valor do `datetime-local`, no fuso de quem olha. */
function paraLocal(data: string, hora?: string | null): string {
  if (!data) return ''
  return hora ? `${data}T${hora}` : ''
}
const dia = (v: string) => (v ? v.slice(0, 10) : '')
const hora = (v: string) => (v ? v.slice(11, 16) : '')

const agoraLocal = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * "1:30" ou "1,5" → 90 minutos. As duas formas aparecem porque as duas são digitadas: uns
 * pensam em relógio, outros em hora decimal.
 */
export function minutosDoTexto(texto: string): number | null {
  const d = texto.trim()
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(d)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]) || null
  const n = Number(d.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null
}

/** Minutos de uma ida: entre os dois instantes, ou pelo tempo digitado. */
function minutosDe(v: VisitaForm): number | null {
  if (v.modo === 'horario') {
    if (!v.chegada || !v.saida) return null
    const m = Math.round((new Date(v.saida).getTime() - new Date(v.chegada).getTime()) / 60000)
    return m > 0 ? m : null
  }
  return minutosDoTexto(v.duracao)
}

/** Tempos que aparecem quase sempre — um toque em vez de digitar. */
const ATALHOS_TEMPO = [30, 60, 90, 120, 180, 240]
const comoTexto = (min: number) => (min % 60 === 0 ? String(min / 60) : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`)

const dataHoraCurta = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/** Como a ida aparece escrita: "18/09 08:10 → 18/09 09:40" ou "2h no local". */
export function textoDaIda(v: Visita): string {
  if (v.inicio && v.fim) {
    return `${dataHoraCurta(`${v.data}T${v.inicio}`)} → ${dataHoraCurta(`${v.fimData ?? v.data}T${v.fim}`)}`
  }
  if (v.inicio) return `chegou ${dataHoraCurta(`${v.data}T${v.inicio}`)}`
  return `${new Date(v.data + 'T12:00').toLocaleDateString('pt-BR')} · ${fmtMinutos(v.minutos)}`
}

const paraForm = (t: Ticket) => ({
  analise: t.analise ?? '',
  possivelSolucao: t.possivelSolucao ?? '',
  solucao: t.solucao ?? '',
  acoesTomadas: t.acoesTomadas ?? '',
  visitas: (t.visitas ?? []).map<VisitaForm>((v) => ({
    id: v.id,
    chegada: paraLocal(v.data, v.inicio),
    saida: paraLocal(v.fimData ?? v.data, v.fim),
    duracao: v.inicio ? '' : comoTexto(v.minutos),
    modo: v.inicio ? 'horario' : 'tempo',
    tecnicoId: v.tecnicoId,
    tecnicoNome: v.tecnicoNome,
  })),
  itens: (t.itens ?? []).map<ItemForm>((i) => ({ id: i.id, descricao: i.descricao, quantidade: String(i.quantidade), tipo: i.tipo, valor: i.valor == null ? '' : String(i.valor) })),
  donePhotos: t.donePhotos ?? [],
})

/** Converte o formulário no formato que o servidor entende. */
function paraVisita(v: VisitaForm, minutos: number): Visita {
  const comHorario = v.modo === 'horario' && v.chegada
  return {
    id: v.id,
    data: comHorario ? dia(v.chegada) : dia(v.chegada) || new Date().toISOString().slice(0, 10),
    inicio: comHorario ? hora(v.chegada) : null,
    fimData: comHorario && v.saida ? dia(v.saida) : null,
    fim: comHorario && v.saida ? hora(v.saida) : null,
    minutos,
    tecnicoId: v.tecnicoId,
  }
}

function Texto({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <p className="whitespace-pre-wrap text-[13px] text-slate-200">{valor}</p>
    </div>
  )
}

const ROTULO_TIPO: Record<RegistroAtendimento['tipo'], string> = {
  analise: 'Análise',
  solucao: 'Solução',
  acoes: 'Ações tomadas',
  passagem: 'Responsável',
}

/**
 * HISTÓRICO do atendimento: cada técnico que escreveu, o que escreveu e quando — mais as
 * passagens de responsável. O chamado troca de mão e, sem isto, o texto do segundo técnico
 * apagava o do primeiro sem deixar rastro.
 */
export function HistoricoAtendimento({ historico }: { historico: RegistroAtendimento[] }) {
  if (!historico?.length) return null
  return (
    <div>
      <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <History size={12} /> Histórico do atendimento
      </div>
      <ol className="relative ml-1.5 space-y-2 border-l border-slate-800 pl-3">
        {historico.map((r) => (
          <li key={r.id} className="relative">
            <span className={`absolute -left-[17px] top-1.5 h-2 w-2 rounded-full ${r.tipo === 'passagem' ? 'bg-sky-400' : r.tipo === 'solucao' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <AvatarPessoa nome={r.autorNome} id={r.autorId} size={16} />
              <span className="text-slate-300">{r.autorNome}</span>
              <span>·</span>
              <span className={r.tipo === 'passagem' ? 'text-sky-300' : ''}>{ROTULO_TIPO[r.tipo] ?? r.tipo}</span>
              <span>·</span>
              <span>{dataHoraCurta(r.createdAt)}</span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-slate-200">{r.texto}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * O atendimento dentro do chamado: o ponto (um toque), o que já foi registrado e a
 * história de quem fez o quê. Preencher é no modal próprio — no celular, ocupando a tela.
 */
/**
 * CHEGUEI / SAÍ em um toque, salvando na hora — quem está no portão não preenche
 * formulário. O horário é sempre o do momento do toque: chegada marca a chegada, saída
 * marca a saída, e a conta entre elas é do servidor.
 *
 * Fica aqui fora porque o mesmo ponto é marcado de dois lugares: dentro do atendimento e
 * no rodapé do chamado, onde o técnico não precisa abrir mais nada.
 */
export function usarPonto(t: Ticket, onSalvo?: () => void) {
  const showToast = useStore((s) => s.showToast)
  const me = useStore((s) => s.me)
  const [marcando, setMarcando] = useState(false)
  /**
   * A ida aberta que importa é a MINHA: com dois técnicos no local, o botão de cada um
   * fecha a própria ida — senão um marcaria a saída do outro.
   */
  const emAndamento = (t.visitas ?? []).find((v) => v.inicio && !v.fim && (!me || !v.tecnicoId || v.tecnicoId === me.id))

  async function marcarPonto() {
    const agora = agoraLocal()
    const visitas: Visita[] = (t.visitas ?? []).map((v) => ({ ...v }))
    if (emAndamento) {
      const alvo = visitas.find((v) => v.id === emAndamento.id)
      if (!alvo) return showToast('Não achei a ida em aberto — atualize a tela')
      alvo.fimData = dia(agora)
      alvo.fim = hora(agora)
    } else {
      visitas.push({ data: dia(agora), inicio: hora(agora), fimData: null, fim: null, minutos: 0 })
    }

    setMarcando(true)
    try {
      await api.saveAtendimento(t.id, { visitas })
      onSalvo?.()
      showToast(emAndamento ? `Saída marcada às ${hora(agora)}` : `Chegada marcada às ${hora(agora)}`)
    } catch (e: any) {
      if (ehFalhaDeRede(e) && enfileirar({ metodo: 'PATCH', caminho: `/tickets/${t.id}/atendimento`, corpo: { visitas }, descricao: `ponto do ${t.code}` })) {
        showToast(`Sem rede — a marcação das ${hora(agora)} sobe assim que a conexão voltar`)
      } else {
        showToast(e?.message ?? 'Não foi possível marcar a hora')
      }
    } finally {
      setMarcando(false)
    }
  }

  return { emAndamento, marcando, marcarPonto }
}

/**
 * O ponto no rodapé do chamado: quem chegou no local marca a hora sem abrir o atendimento
 * — é o que mais se faz com o celular na mão, e era o que estava mais longe.
 */
export function BotaoPonto({ t, onSalvo }: { t: Ticket; onSalvo?: () => void }) {
  const { emAndamento, marcando, marcarPonto } = usarPonto(t, onSalvo)
  return (
    <Button
      variant="subtle"
      onClick={marcarPonto}
      disabled={marcando}
      title={emAndamento ? 'Marcar a hora em que saí do local' : 'Marcar a hora em que cheguei no local'}
      className={emAndamento ? 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-500' : undefined}
    >
      {marcando ? <Loader2 size={14} className="animate-spin" /> : emAndamento ? <LogOut size={14} /> : <LogIn size={14} />}
      {emAndamento ? 'Saí agora' : 'Cheguei agora'}
    </Button>
  )
}

export function AtendimentoTecnico({ t, podeEditar, podeMarcarPonto, onEditar, onSalvo }: {
  t: Ticket
  podeEditar: boolean
  /** Marcar chegada/saída — o apoio também faz, mesmo sem escrever o atendimento. */
  podeMarcarPonto?: boolean
  onEditar: () => void
  onSalvo?: () => void
}) {
  const vazio = !t.analise && !t.possivelSolucao && !t.solucao && !t.acoesTomadas && !(t.visitas?.length) && !(t.itens?.length) && !(t.donePhotos?.length)
  const podePonto = podeMarcarPonto ?? podeEditar
  const { emAndamento, marcando, marcarPonto } = usarPonto(t, onSalvo)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Wrench size={15} className="text-red-400" /> Atendimento técnico
          {!!t.minutosTotais && <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-normal text-slate-300"><Clock size={11} /> {fmtMinutos(t.minutosTotais)}</span>}
        </div>
      </div>

      {/* O ponto é UM botão que alterna — nunca dois botões de chegada na mesma tela. */}
      {podePonto && (
        <button
          onClick={marcarPonto}
          disabled={marcando}
          className={`mb-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-semibold disabled:opacity-60 ${
            emAndamento ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
          }`}
        >
          {marcando ? <Loader2 size={16} className="animate-spin" /> : emAndamento ? <LogOut size={16} /> : <LogIn size={16} />}
          {emAndamento ? 'Marcar minha saída agora' : 'Marcar minha chegada agora'}
        </button>
      )}
      {emAndamento && (
        <p className="mb-3 -mt-1.5 text-center text-[11px] text-emerald-300/80">
          no local desde {dataHoraCurta(`${emAndamento.data}T${emAndamento.inicio}`)}
        </p>
      )}

      {vazio ? (
        podeEditar ? (
          <button
            onClick={onEditar}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-red-900/50 bg-red-500/[0.04] px-4 py-6 text-center hover:border-red-700 hover:bg-red-500/10"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white"><Pencil size={17} /></span>
            <span className="text-[14px] font-semibold text-slate-100">Preencher atendimento</span>
            <span className="max-w-[16rem] text-[11px] text-slate-500">A solução, o tempo no local e os itens usados.</span>
          </button>
        ) : (
          <p className="text-[12px] text-slate-500">
            {t.assigneeName ? `Aguardando o atendimento de ${t.assigneeName}.` : 'Ainda ninguém pegou este chamado.'}
          </p>
        )
      ) : (
        <div className="space-y-2.5">
          <Texto label="Análise do problema" valor={t.analise} />
          <Texto label="Possível solução" valor={t.possivelSolucao} />
          <Texto label="Solução" valor={t.solucao} />
          <Texto label="Ações tomadas" valor={t.acoesTomadas} />

          {!!t.visitas?.length && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Idas ao local</div>
              <div className="space-y-1">
                {t.visitas.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-900/60 px-2 py-1 text-[12px]">
                    <span className="text-slate-300">{textoDaIda(v)}</span>
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <AvatarPessoa nome={v.tecnicoNome ?? '—'} id={v.tecnicoId} size={16} />
                      {v.inicio && !v.fim
                        ? <span className="font-medium text-emerald-300">no local agora</span>
                        : <span className="font-medium text-slate-200">{fmtMinutos(v.minutos)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!t.itens?.length && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Itens trocados / comprados</div>
              <div className="space-y-1">
                {t.itens.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-900/60 px-2 py-1 text-[12px]">
                    <span className="min-w-0 truncate text-slate-200"><Package size={11} className="mr-1 inline text-slate-500" />{i.quantidade}× {i.descricao}</span>
                    <span className="shrink-0 text-slate-400">{i.tipo === 'comprado' ? 'comprado' : 'trocado'}{i.valor != null ? ` · R$ ${(i.valor * i.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!t.donePhotos?.length && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Fotos finais</div>
              <PhotoInput photos={t.donePhotos} />
            </div>
          )}

          {podeEditar && (
            <button
              onClick={onEditar}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-red-800/60 bg-red-500/10 py-2.5 text-[13px] font-semibold text-red-300 hover:bg-red-500/20"
            >
              <Pencil size={14} /> Editar atendimento
            </button>
          )}
        </div>
      )}

      {!!t.historico?.length && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <HistoricoAtendimento historico={t.historico} />
        </div>
      )}
    </div>
  )
}

/**
 * O formulário do atendimento, em modal por cima do chamado. Uma responsabilidade só:
 * registrar o que foi feito. Concluir o chamado é botão do chamado, não daqui — dois
 * botões parecidos no mesmo rodapé faziam pensar que eram a mesma coisa.
 */
export function ModalAtendimento({ t, onFechar, onSalvo }: {
  t: Ticket
  onFechar: () => void
  onSalvo: () => void
}) {
  const showToast = useStore((s) => s.showToast)
  const [form, setForm] = useState(() => paraForm(t))
  const [saving, setSaving] = useState(false)

  // O ponto pode ter sido marcado com o modal fechado (ou por outro técnico): quando a
  // lista de idas muda no servidor, o formulário acompanha — antes a ida não aparecia aqui.
  const assinatura = useMemo(
    () => JSON.stringify((t.visitas ?? []).map((v) => [v.id, v.inicio, v.fim, v.fimData, v.minutos])),
    [t.visitas],
  )
  useEffect(() => {
    setForm((atual) => ({ ...atual, visitas: paraForm(t).visitas }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura])

  const totalForm = form.visitas.reduce((s, v) => s + (minutosDe(v) ?? 0), 0)
  /** Quem pode assinar uma ida: o responsável e quem está junto. Cada ida é de um só. */
  const equipe = [
    ...(t.assigneeId ? [{ id: t.assigneeId, name: t.assigneeName ?? 'responsável' }] : []),
    ...(t.sharedWith ?? []),
  ]
  const setVisita = (i: number, p: Partial<VisitaForm>) => setForm({ ...form, visitas: form.visitas.map((v, j) => (j === i ? { ...v, ...p } : v)) })
  const setItem = (i: number, p: Partial<ItemForm>) => setForm({ ...form, itens: form.itens.map((v, j) => (j === i ? { ...v, ...p } : v)) })

  async function salvar() {
    const visitas: Visita[] = []
    for (const [i, v] of form.visitas.entries()) {
      if (v.modo === 'horario' && v.chegada && !v.saida) {
        // Ida em aberto: vale zero até a saída ser marcada.
        visitas.push(paraVisita(v, 0))
        continue
      }
      const minutos = minutosDe(v)
      if (!minutos) return showToast(`Ida ${i + 1}: ${v.modo === 'horario' ? 'confira a chegada e a saída' : 'informe quanto tempo você ficou'}`)
      if (v.modo === 'tempo' && !v.chegada) return showToast(`Ida ${i + 1}: informe o dia`)
      visitas.push(paraVisita(v, minutos))
    }
    const itens: ItemAtendimento[] = []
    for (const [i, it] of form.itens.entries()) {
      if (!it.descricao.trim()) return showToast(`Item ${i + 1}: informe a descrição`)
      const q = Number(it.quantidade.replace(',', '.'))
      if (!Number.isFinite(q) || q <= 0) return showToast(`Item ${i + 1}: quantidade inválida`)
      const valor = it.valor.trim() ? Number(it.valor.replace(',', '.')) : null
      if (valor != null && (!Number.isFinite(valor) || valor < 0)) return showToast(`Item ${i + 1}: valor inválido`)
      itens.push({ id: it.id, descricao: it.descricao.trim(), quantidade: q, tipo: it.tipo, valor })
    }

    const corpo = {
      analise: form.analise, possivelSolucao: form.possivelSolucao, solucao: form.solucao, acoesTomadas: form.acoesTomadas,
      visitas, itens, donePhotos: form.donePhotos,
    }
    setSaving(true)
    try {
      await api.saveAtendimento(t.id, corpo)
      onSalvo()
      showToast('Atendimento salvo')
      onFechar()
    } catch (e: any) {
      if (ehFalhaDeRede(e) && enfileirar({ metodo: 'PATCH', caminho: `/tickets/${t.id}/atendimento`, corpo, descricao: `atendimento do ${t.code}` })) {
        showToast('Sem rede — o atendimento sobe assim que a conexão voltar')
        onFechar()
      } else {
        showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o atendimento')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      wide
      telaCheia
      title={
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-wide text-red-400/80">{t.code}</div>
          <h2 className="truncate text-[15px] font-semibold leading-tight text-slate-100">Atendimento técnico</h2>
        </div>
      }
      tituloTexto={`Atendimento do ${t.code}`}
      fechar="Cancelar"
      footer={
        <Button onClick={salvar} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar atendimento
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Solução" hint="é ela que libera a conclusão do chamado, e o que o relatório vai mostrar">
          <Textarea rows={3} value={form.solucao} onChange={(e) => setForm({ ...form, solucao: e.target.value })} placeholder="O que resolveu" autoFocus />
        </Field>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Idas ao local {totalForm > 0 && <span className="text-slate-300">· {fmtMinutos(totalForm)} no total</span>}</span>
          </div>
          <div className="space-y-2">
            {form.visitas.map((v, i) => {
              const m = minutosDe(v)
              const emAberto = v.modo === 'horario' && !!v.chegada && !v.saida
              return (
                <div key={v.id ?? `n${i}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5" role="radiogroup" aria-label="Como informar o tempo">
                      {([['horario', 'Chegada e saída'], ['tempo', 'Só o tempo']] as const).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={v.modo === k}
                          onClick={() => setVisita(i, { modo: k })}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium ${v.modo === k ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {emAberto
                        ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">no local agora</span>
                        : m ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200"><Clock size={11} /> {fmtMinutos(m)}</span> : null}
                      <button type="button" onClick={() => setForm({ ...form, visitas: form.visitas.filter((_, j) => j !== i) })} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Remover ida"><Trash2 size={14} /></button>
                    </div>
                  </div>

                  {/* Alinhado pelo TOPO: a dica de formato ("1:30 ou 1,5") fica embaixo de
                      um dos campos e, com `items-end`, empurrava o vizinho para cima. */}
                  {v.modo === 'horario' ? (
                    // Cada ponto com a sua data: a saída pode ser no dia seguinte.
                    <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
                      <Field label="Cheguei">
                        <div className="flex gap-1">
                          <Input type="datetime-local" value={v.chegada} max={agoraLocal()} onChange={(e) => setVisita(i, { chegada: e.target.value })} />
                          <button type="button" onClick={() => setVisita(i, { chegada: agoraLocal() })} className="shrink-0 rounded-lg border border-slate-700 px-2 text-[11px] text-slate-300 hover:border-red-700 hover:text-slate-100">agora</button>
                        </div>
                      </Field>
                      <Field label="Saí" hint={emAberto ? 'em branco = ainda no local' : undefined}>
                        <div className="flex gap-1">
                          <Input type="datetime-local" value={v.saida} min={v.chegada || undefined} onChange={(e) => setVisita(i, { saida: e.target.value })} />
                          <button type="button" onClick={() => setVisita(i, { saida: agoraLocal() })} className="shrink-0 rounded-lg border border-slate-700 px-2 text-[11px] text-slate-300 hover:border-red-700 hover:text-slate-100">agora</button>
                        </div>
                      </Field>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 items-start gap-2">
                      <Field label="Dia"><Input type="date" value={dia(v.chegada) || ''} max={agoraLocal().slice(0, 10)} onChange={(e) => setVisita(i, { chegada: e.target.value ? `${e.target.value}T12:00` : '' })} /></Field>
                      <Field label="Quanto tempo" hint="1:30 ou 1,5">
                        <Input inputMode="decimal" value={v.duracao} placeholder="1:30" onChange={(e) => setVisita(i, { duracao: e.target.value })} />
                      </Field>
                    </div>
                  )}

                  {v.modo === 'tempo' && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ATALHOS_TEMPO.map((min) => (
                        <button
                          key={min}
                          type="button"
                          onClick={() => setVisita(i, { duracao: comoTexto(min) })}
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${m === min ? 'border-red-700 bg-red-500/10 text-red-200' : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
                        >
                          {fmtMinutos(min)}
                        </button>
                      ))}
                    </div>
                  )}

                  {equipe.length > 1 ? (
                    <div className="mt-2">
                      <Field label="Quem foi nesta ida">
                        <Select className="w-full" value={v.tecnicoId ?? equipe[0].id} onValueChange={(id) => setVisita(i, { tecnicoId: id })}>
                          {equipe.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </Select>
                      </Field>
                    </div>
                  ) : (
                    v.tecnicoNome && <div className="mt-2 text-[11px] text-slate-500">registrada por {v.tecnicoNome}</div>
                  )}
                </div>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, visitas: [...form.visitas, { chegada: agoraLocal(), saida: '', duracao: '', modo: 'horario' }] })}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 py-2.5 text-[13px] font-medium text-slate-300 hover:border-red-700 hover:bg-red-500/5 hover:text-slate-100"
          >
            <Plus size={15} /> Adicionar ida ao local
          </button>
        </div>

        {/* Fotos antes dos itens: no celular, o seletor de imagem cobre a tela e voltar
            para o fim de um formulário longo é o que mais irrita. */}
        <Field label="Fotos do serviço"><PhotoInput photos={form.donePhotos} onChange={(donePhotos) => setForm({ ...form, donePhotos })} /></Field>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">Itens trocados ou comprados</div>
          <div className="space-y-1.5">
            {form.itens.map((it, i) => (
              <div key={it.id ?? `n${i}`} className="grid grid-cols-[1fr_auto] items-start gap-1.5 rounded-md border border-slate-800 p-2 sm:grid-cols-[2fr_0.6fr_1fr_0.9fr_auto]">
                <div className="col-span-2 sm:col-span-1"><Field label="Descrição"><Input value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} placeholder="Ex.: Fonte 12V 5A" /></Field></div>
                <Field label="Qtd."><Input inputMode="decimal" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: e.target.value })} /></Field>
                <Field label="Tipo">
                  <Select className="w-full" value={it.tipo} onValueChange={(v) => setItem(i, { tipo: v as 'trocado' | 'comprado' })}>
                    <option value="trocado">Trocado</option>
                    <option value="comprado">Comprado</option>
                  </Select>
                </Field>
                <Field label="Valor un. (R$)"><Input inputMode="decimal" value={it.valor} onChange={(e) => setItem(i, { valor: e.target.value })} placeholder="opcional" /></Field>
                <button type="button" onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== i) })} className="mt-5 justify-self-end rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Remover item"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, itens: [...form.itens, { descricao: '', quantidade: '1', tipo: 'trocado', valor: '' }] })}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 py-2 text-[12px] font-medium text-slate-300 hover:border-red-700 hover:bg-red-500/5 hover:text-slate-100"
          >
            <Plus size={14} /> Adicionar item
          </button>
        </div>

        <details className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-slate-300">Análise, possível solução e ações tomadas</summary>
          <div className="mt-3 space-y-3">
            <Field label="Análise do problema"><Textarea rows={2} value={form.analise} onChange={(e) => setForm({ ...form, analise: e.target.value })} placeholder="O que foi encontrado no local" /></Field>
            <Field label="Possível solução"><Textarea rows={2} value={form.possivelSolucao} onChange={(e) => setForm({ ...form, possivelSolucao: e.target.value })} /></Field>
            <Field label="Ações tomadas"><Textarea rows={2} value={form.acoesTomadas} onChange={(e) => setForm({ ...form, acoesTomadas: e.target.value })} /></Field>
          </div>
        </details>

        {!!t.historico?.length && (
          <div className="border-t border-slate-800 pt-3">
            <HistoricoAtendimento historico={t.historico} />
          </div>
        )}
      </div>
    </Modal>
  )
}

export { ArrowRightLeft }
