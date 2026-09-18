import { useEffect, useState } from 'react'
import { Wrench, Plus, Trash2, Save, Loader2, Clock, Package, Pencil, CheckCircle2 } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'
import { PhotoInput } from './PhotoInput'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { fmtMinutos, hojeIso } from '@/lib/utils'
import type { ItemAtendimento, Ticket, Visita } from '@/lib/types'

/** `modo` é o que o técnico sabe na hora: o horário que chegou e saiu, ou só quanto tempo ficou. */
interface VisitaForm { id?: string; data: string; inicio: string; fim: string; duracao: string; modo: 'horario' | 'tempo'; tecnicoId?: string | null; tecnicoNome?: string }
interface ItemForm { id?: string; descricao: string; quantidade: string; tipo: 'trocado' | 'comprado'; valor: string }

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const temHorario = (v: VisitaForm) => v.modo === 'horario' && HORA_RE.test(v.inicio) && HORA_RE.test(v.fim)

/** Minutos de uma ida: pelo horário de chegada/saída, ou pelo tempo "1:30" / "1,5" digitado. */
function minutosDe(v: VisitaForm): number | null {
  if (temHorario(v)) {
    const m = (Number(v.fim.slice(0, 2)) * 60 + Number(v.fim.slice(3))) - (Number(v.inicio.slice(0, 2)) * 60 + Number(v.inicio.slice(3)))
    return m <= 0 ? m + 24 * 60 : m
  }
  if (v.modo === 'horario') return null
  const d = v.duracao.trim()
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(d)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]) || null
  const n = Number(d.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null
}

/** "Agora" no formato do campo de hora — o técnico está no local quando registra. */
const horaAgora = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Tempos que aparecem quase sempre — um toque em vez de digitar. */
const ATALHOS_TEMPO = [30, 60, 90, 120, 180, 240]
const comoTexto = (min: number) => (min % 60 === 0 ? String(min / 60) : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`)

const paraForm = (t: Ticket) => ({
  analise: t.analise ?? '',
  possivelSolucao: t.possivelSolucao ?? '',
  solucao: t.solucao ?? '',
  acoesTomadas: t.acoesTomadas ?? '',
  visitas: (t.visitas ?? []).map<VisitaForm>((v) => ({
    id: v.id, data: v.data, inicio: v.inicio ?? '', fim: v.fim ?? '',
    duracao: v.inicio && v.fim ? '' : comoTexto(v.minutos),
    modo: v.inicio && v.fim ? 'horario' : 'tempo',
    tecnicoId: v.tecnicoId,
    tecnicoNome: v.tecnicoNome,
  })),
  itens: (t.itens ?? []).map<ItemForm>((i) => ({ id: i.id, descricao: i.descricao, quantidade: String(i.quantidade), tipo: i.tipo, valor: i.valor == null ? '' : String(i.valor) })),
  donePhotos: t.donePhotos ?? [],
})

function Texto({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <p className="whitespace-pre-wrap text-[13px] text-slate-200">{valor}</p>
    </div>
  )
}

/**
 * O que já foi registrado no atendimento, dentro do chamado. É só leitura: preencher é no
 * modal próprio (`ModalAtendimento`), que no celular ocupa a tela inteira em vez de
 * empurrar tudo para baixo de um formulário comprido.
 */
export function AtendimentoTecnico({ t, podeEditar, onEditar, onSalvo }: {
  t: Ticket
  podeEditar: boolean
  onEditar: () => void
  /** Recarrega o chamado depois de marcar chegada ou saída. */
  onSalvo?: () => void
}) {
  const showToast = useStore((s) => s.showToast)
  const [marcando, setMarcando] = useState(false)
  const vazio = !t.analise && !t.possivelSolucao && !t.solucao && !t.acoesTomadas && !(t.visitas?.length) && !(t.itens?.length) && !(t.donePhotos?.length)

  // Ida em andamento: chegou e ainda não saiu. É ela que decide o botão de um toque.
  const emAndamento = (t.visitas ?? []).find((v) => v.inicio && !v.fim)

  /**
   * CHEGUEI / TERMINEI em um toque, salvando na hora. O formulário continua ali para
   * corrigir depois — o que não dá é pedir formulário a quem acabou de chegar no portão.
   */
  async function marcarPonto() {
    setMarcando(true)
    try {
      const agora = horaAgora()
      const visitas = (t.visitas ?? []).map((v) => ({ ...v }))
      if (emAndamento) {
        const alvo = visitas.find((v) => v.id === emAndamento.id)
        if (alvo) alvo.fim = agora
      } else {
        visitas.push({ data: hojeIso(), inicio: agora, fim: null, minutos: 0 })
      }
      await api.saveAtendimento(t.id, { visitas })
      onSalvo?.()
      showToast(emAndamento ? `Saída marcada às ${agora}` : `Chegada marcada às ${agora}`)
    } catch (e: any) {
      showToast(e?.message ?? 'Não foi possível marcar a hora')
    } finally {
      setMarcando(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Wrench size={15} className="text-red-400" /> Atendimento técnico
          {!!t.minutosTotais && <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-normal text-slate-300"><Clock size={11} /> {fmtMinutos(t.minutosTotais)}</span>}
        </div>
      </div>

      {podeEditar && (
        <button
          onClick={marcarPonto}
          disabled={marcando}
          className={`mb-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-semibold disabled:opacity-60 ${
            emAndamento
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
          }`}
        >
          {marcando ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
          {emAndamento ? `Terminei agora (cheguei ${emAndamento.inicio})` : 'Cheguei agora'}
        </button>
      )}

      {vazio ? (
        /* Vazio, o preencher É a seção: um alvo grande no meio do card, não um botãozinho
           perdido no canto. É a ação que o técnico veio fazer. */
        podeEditar ? (
          <button
            onClick={onEditar}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-red-900/50 bg-red-500/[0.04] px-4 py-7 text-center hover:border-red-700 hover:bg-red-500/10"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white"><Pencil size={18} /></span>
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
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Tempo no local</div>
              <div className="space-y-1">
                {t.visitas.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-900/60 px-2 py-1 text-[12px]">
                    <span className="text-slate-300">
                      {new Date(v.data + 'T12:00').toLocaleDateString('pt-BR')}
                      {v.inicio && v.fim ? ` · ${v.inicio} → ${v.fim}` : v.inicio ? ` · chegou ${v.inicio}` : ''}
                    </span>
                    <span className="text-slate-400">
                      {v.tecnicoNome} ·{' '}
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

          {/* Já preenchido, editar é uma ação secundária — mas continua um botão de
              verdade, em destaque, na largura da seção. */}
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
    </div>
  )
}

/**
 * O formulário do atendimento, em modal por cima do chamado — no celular é a tela toda,
 * com "Salvar" sempre à mão no rodapé. Salvar fecha e devolve para o chamado.
 */
export function ModalAtendimento({ t, podeConcluir, onFechar, onSalvo, onConcluir }: {
  t: Ticket
  /** Mostra o "Salvar e concluir": quem pode fechar o chamado, e o chamado ainda está aberto. */
  podeConcluir: boolean
  onFechar: () => void
  onSalvo: () => void
  /** Chamado depois de salvo com a solução preenchida. */
  onConcluir: () => void
}) {
  const showToast = useStore((s) => s.showToast)
  const [form, setForm] = useState(() => paraForm(t))
  const [saving, setSaving] = useState<'salvar' | 'concluir' | null>(null)

  // Enquanto o modal está aberto, o poll de 12s não atropela o que está sendo digitado.
  useEffect(() => { setForm(paraForm(t)) }, [t.id])

  const totalForm = form.visitas.reduce((s, v) => s + (minutosDe(v) ?? 0), 0)
  /**
   * Quem pode assinar uma ida: o responsável e quem está junto no chamado. Cada ida é de
   * UM técnico — é isso que faz o chamado compartilhado somar as horas sem duplicá-las.
   */
  const equipe = [
    ...(t.assigneeId ? [{ id: t.assigneeId, name: t.assigneeName ?? 'responsável' }] : []),
    ...(t.sharedWith ?? []),
  ]
  const setVisita = (i: number, p: Partial<VisitaForm>) => setForm({ ...form, visitas: form.visitas.map((v, j) => (j === i ? { ...v, ...p } : v)) })
  const setItem = (i: number, p: Partial<ItemForm>) => setForm({ ...form, itens: form.itens.map((v, j) => (j === i ? { ...v, ...p } : v)) })

  async function salvar(depois: 'fechar' | 'concluir') {
    const visitas: Visita[] = []
    for (const [i, v] of form.visitas.entries()) {
      const minutos = minutosDe(v)
      if (!v.data) return showToast(`Ida ${i + 1}: informe a data`)
      if (!minutos) return showToast(`Ida ${i + 1}: ${v.modo === 'horario' ? 'informe a chegada e a saída' : 'informe quanto tempo você ficou'}`)
      visitas.push({ id: v.id, data: v.data, inicio: temHorario(v) ? v.inicio : null, fim: temHorario(v) ? v.fim : null, minutos, tecnicoId: v.tecnicoId })
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
    if (depois === 'concluir' && !form.solucao.trim()) return showToast('Escreva a solução antes de concluir o chamado')

    setSaving(depois === 'concluir' ? 'concluir' : 'salvar')
    try {
      await api.saveAtendimento(t.id, {
        analise: form.analise, possivelSolucao: form.possivelSolucao, solucao: form.solucao, acoesTomadas: form.acoesTomadas,
        visitas, itens, donePhotos: form.donePhotos,
      })
      onSalvo()
      if (depois === 'concluir') onConcluir()
      else { showToast('Atendimento salvo'); onFechar() }
    } catch (e: any) {
      showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o atendimento')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      wide
      title={`Atendimento · ${t.code}`}
      footer={
        <>
          <Button variant="subtle" onClick={onFechar}>Cancelar</Button>
          {podeConcluir && (
            <Button variant="subtle" onClick={() => salvar('concluir')} disabled={!!saving}>
              {saving === 'concluir' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Salvar e concluir
            </Button>
          )}
          <Button onClick={() => salvar('fechar')} disabled={!!saving}>
            {saving === 'salvar' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Solução" hint="obrigatória para concluir — é o que o relatório e a próxima visita vão ler">
          <Textarea rows={3} value={form.solucao} onChange={(e) => setForm({ ...form, solucao: e.target.value })} placeholder="O que resolveu" autoFocus />
        </Field>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Idas ao local {totalForm > 0 && <span className="text-slate-300">· {fmtMinutos(totalForm)} no total</span>}</span>
          </div>
          <div className="space-y-2">
            {form.visitas.map((v, i) => {
              const m = minutosDe(v)
              return (
                <div key={v.id ?? `n${i}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    {/* O que o técnico sabe muda a cada ida: às vezes o horário certo,
                        quase sempre só "fiquei umas duas horas". Um clique troca. */}
                    <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5" role="radiogroup" aria-label="Como informar o tempo">
                      {([['tempo', 'Só o tempo'], ['horario', 'Cheguei e saí']] as const).map(([k, label]) => (
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
                      {m ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300"><Clock size={11} /> {fmtMinutos(m)}</span> : null}
                      <button type="button" onClick={() => setForm({ ...form, visitas: form.visitas.filter((_, j) => j !== i) })} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Remover ida"><Trash2 size={14} /></button>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 items-end gap-2 ${v.modo === 'horario' ? 'sm:grid-cols-3' : ''}`}>
                    <Field label="Data"><Input type="date" value={v.data} max={hojeIso()} onChange={(e) => setVisita(i, { data: e.target.value })} /></Field>
                    {v.modo === 'horario' ? (
                      <>
                        <Field label="Cheguei"><Input type="time" value={v.inicio} onChange={(e) => setVisita(i, { inicio: e.target.value })} /></Field>
                        <Field label="Saí"><Input type="time" value={v.fim} onChange={(e) => setVisita(i, { fim: e.target.value })} /></Field>
                      </>
                    ) : (
                      <Field label="Quanto tempo" hint="1:30 ou 1,5 — vale a média se você não anotou">
                        <Input inputMode="decimal" value={v.duracao} placeholder="1:30" onChange={(e) => setVisita(i, { duracao: e.target.value })} />
                      </Field>
                    )}
                  </div>

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
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, visitas: [...form.visitas, { data: hojeIso(), inicio: '', fim: '', duracao: '', modo: 'tempo' }] })}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 py-2.5 text-[13px] font-medium text-slate-300 hover:border-red-700 hover:bg-red-500/5 hover:text-slate-100"
            >
              <Plus size={15} /> Registrar ida ao local
            </button>
            {/* Cheguei agora: abre a ida já com o dia e a hora certos. */}
            <button
              type="button"
              onClick={() => setForm({ ...form, visitas: [...form.visitas, { data: hojeIso(), inicio: horaAgora(), fim: '', duracao: '', modo: 'horario' }] })}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 py-2.5 text-[13px] font-medium text-slate-100 hover:bg-slate-700"
            >
              <Clock size={15} /> Cheguei agora
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">Itens trocados ou comprados</div>
          <div className="space-y-1.5">
            {form.itens.map((it, i) => (
              <div key={it.id ?? `n${i}`} className="grid grid-cols-[1fr_auto] items-end gap-1.5 rounded-md border border-slate-800 p-2 sm:grid-cols-[2fr_0.6fr_1fr_0.9fr_auto]">
                <div className="col-span-2 sm:col-span-1"><Field label="Descrição"><Input value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} placeholder="Ex.: Fonte 12V 5A" /></Field></div>
                <Field label="Qtd."><Input inputMode="decimal" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: e.target.value })} /></Field>
                <Field label="Tipo">
                  <Select className="w-full" value={it.tipo} onValueChange={(v) => setItem(i, { tipo: v as 'trocado' | 'comprado' })}>
                    <option value="trocado">Trocado</option>
                    <option value="comprado">Comprado</option>
                  </Select>
                </Field>
                <Field label="Valor un. (R$)"><Input inputMode="decimal" value={it.valor} onChange={(e) => setItem(i, { valor: e.target.value })} placeholder="opcional" /></Field>
                <button type="button" onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== i) })} className="mb-1 justify-self-end rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Remover item"><Trash2 size={14} /></button>
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

        <Field label="Fotos finais"><PhotoInput photos={form.donePhotos} onChange={(donePhotos) => setForm({ ...form, donePhotos })} /></Field>

        {/* O que raramente muda fica no fim: no celular, o dedo alcança primeiro o que importa. */}
        <details className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-slate-300">Análise, possível solução e ações tomadas</summary>
          <div className="mt-3 space-y-3">
            <Field label="Análise do problema"><Textarea rows={2} value={form.analise} onChange={(e) => setForm({ ...form, analise: e.target.value })} placeholder="O que foi encontrado no local" /></Field>
            <Field label="Possível solução"><Textarea rows={2} value={form.possivelSolucao} onChange={(e) => setForm({ ...form, possivelSolucao: e.target.value })} /></Field>
            <Field label="Ações tomadas"><Textarea rows={2} value={form.acoesTomadas} onChange={(e) => setForm({ ...form, acoesTomadas: e.target.value })} /></Field>
          </div>
        </details>
      </div>
    </Modal>
  )
}
