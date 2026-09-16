import { useEffect, useState } from 'react'
import { Wrench, Plus, Trash2, Save, Loader2, Clock, Package, Pencil, X } from 'lucide-react'
import { Button, Field, Input, Select, Textarea } from './ui'
import { PhotoInput } from './PhotoInput'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { cn, fmtMinutos, hojeIso } from '@/lib/utils'
import type { ItemAtendimento, Ticket, Visita } from '@/lib/types'

interface VisitaForm { id?: string; data: string; inicio: string; fim: string; duracao: string; tecnicoNome?: string }
interface ItemForm { id?: string; descricao: string; quantidade: string; tipo: 'trocado' | 'comprado'; valor: string }

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Minutos de uma ida: pela hora de início/saída, ou pela duração "h:mm" / "90" digitada. */
function minutosDe(v: VisitaForm): number | null {
  if (HORA_RE.test(v.inicio) && HORA_RE.test(v.fim)) {
    const m = (Number(v.fim.slice(0, 2)) * 60 + Number(v.fim.slice(3))) - (Number(v.inicio.slice(0, 2)) * 60 + Number(v.inicio.slice(3)))
    return m <= 0 ? m + 24 * 60 : m
  }
  const d = v.duracao.trim()
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(d)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]) || null
  const n = Number(d.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null
}

const paraForm = (t: Ticket) => ({
  analise: t.analise ?? '',
  possivelSolucao: t.possivelSolucao ?? '',
  solucao: t.solucao ?? '',
  acoesTomadas: t.acoesTomadas ?? '',
  visitas: (t.visitas ?? []).map<VisitaForm>((v) => ({
    id: v.id, data: v.data, inicio: v.inicio ?? '', fim: v.fim ?? '',
    duracao: v.inicio && v.fim ? '' : String(Math.round((v.minutos / 60) * 100) / 100), tecnicoNome: v.tecnicoNome,
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
 * Área do técnico dentro do chamado. Quem pode editar (o responsável, ou o gestor)
 * vê o formulário; os demais veem o que já foi registrado.
 */
export function AtendimentoTecnico({ t, podeEditar, onSaved }: { t: Ticket; podeEditar: boolean; onSaved: () => void }) {
  const showToast = useStore((s) => s.showToast)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState(() => paraForm(t))
  const [saving, setSaving] = useState(false)

  // Chamado atualizado por fora (poll de 12s) não atropela o que está sendo digitado.
  useEffect(() => { if (!editando) setForm(paraForm(t)) }, [t, editando])

  const vazio = !t.analise && !t.possivelSolucao && !t.solucao && !t.acoesTomadas && !(t.visitas?.length) && !(t.itens?.length) && !(t.donePhotos?.length)
  const totalForm = form.visitas.reduce((s, v) => s + (minutosDe(v) ?? 0), 0)

  async function salvar() {
    const visitas: Visita[] = []
    for (const [i, v] of form.visitas.entries()) {
      const minutos = minutosDe(v)
      if (!v.data) return showToast(`Ida ${i + 1}: informe a data`)
      if (!minutos) return showToast(`Ida ${i + 1}: informe início e saída, ou o tempo no local`)
      visitas.push({ id: v.id, data: v.data, inicio: HORA_RE.test(v.inicio) && HORA_RE.test(v.fim) ? v.inicio : null, fim: HORA_RE.test(v.inicio) && HORA_RE.test(v.fim) ? v.fim : null, minutos })
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
    setSaving(true)
    try {
      await api.saveAtendimento(t.id, {
        analise: form.analise, possivelSolucao: form.possivelSolucao, solucao: form.solucao, acoesTomadas: form.acoesTomadas,
        visitas, itens, donePhotos: form.donePhotos,
      })
      onSaved()
      setEditando(false)
      showToast('Atendimento salvo')
    } catch (e: any) {
      showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o atendimento')
    } finally {
      setSaving(false)
    }
  }

  const setVisita = (i: number, p: Partial<VisitaForm>) => setForm({ ...form, visitas: form.visitas.map((v, j) => (j === i ? { ...v, ...p } : v)) })
  const setItem = (i: number, p: Partial<ItemForm>) => setForm({ ...form, itens: form.itens.map((v, j) => (j === i ? { ...v, ...p } : v)) })

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Wrench size={15} className="text-red-400" /> Atendimento técnico
          {!!t.minutosTotais && <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-normal text-slate-300"><Clock size={11} /> {fmtMinutos(t.minutosTotais)}</span>}
        </div>
        {podeEditar && !editando && (
          <Button size="sm" variant="subtle" onClick={() => setEditando(true)}><Pencil size={12} /> {vazio ? 'Preencher' : 'Editar'}</Button>
        )}
      </div>

      {!editando ? (
        vazio ? (
          <p className="text-[12px] text-slate-500">{podeEditar ? 'Nada registrado ainda. Preencha a análise, a solução e o tempo no local.' : t.assigneeName ? `Aguardando o atendimento de ${t.assigneeName}.` : 'Ainda ninguém pegou este chamado.'}</p>
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
                      <span className="text-slate-300">{new Date(v.data + 'T12:00').toLocaleDateString('pt-BR')}{v.inicio && v.fim ? ` · ${v.inicio} → ${v.fim}` : ''}</span>
                      <span className="text-slate-400">{v.tecnicoNome} · <span className="font-medium text-slate-200">{fmtMinutos(v.minutos)}</span></span>
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
          </div>
        )
      ) : (
        <div className="space-y-3">
          <Field label="Análise do problema"><Textarea rows={2} value={form.analise} onChange={(e) => setForm({ ...form, analise: e.target.value })} placeholder="O que foi encontrado no local" /></Field>
          <Field label="Possível solução"><Textarea rows={2} value={form.possivelSolucao} onChange={(e) => setForm({ ...form, possivelSolucao: e.target.value })} /></Field>
          <Field label="Solução" hint="obrigatória para concluir o chamado"><Textarea rows={2} value={form.solucao} onChange={(e) => setForm({ ...form, solucao: e.target.value })} placeholder="O que resolveu" /></Field>
          <Field label="Ações tomadas"><Textarea rows={2} value={form.acoesTomadas} onChange={(e) => setForm({ ...form, acoesTomadas: e.target.value })} /></Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Tempo no local {totalForm > 0 && <span className="text-slate-300">· {fmtMinutos(totalForm)}</span>}</span>
              <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, visitas: [...form.visitas, { data: hojeIso(), inicio: '', fim: '', duracao: '' }] })}><Plus size={12} /> Ida ao local</Button>
            </div>
            <p className="mb-1.5 text-[11px] text-slate-500">Informe hora de início e de saída — ou, sem elas, só o tempo (ex.: 1:30 ou 1,5).</p>
            <div className="space-y-1.5">
              {form.visitas.map((v, i) => {
                const temHoras = !!(v.inicio || v.fim)
                const m = minutosDe(v)
                return (
                  <div key={v.id ?? `n${i}`} className="grid grid-cols-2 items-end gap-1.5 rounded-md border border-slate-800 p-2 sm:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
                    <Field label="Data"><Input type="date" value={v.data} max={hojeIso()} onChange={(e) => setVisita(i, { data: e.target.value })} /></Field>
                    <Field label="Início"><Input type="time" value={v.inicio} onChange={(e) => setVisita(i, { inicio: e.target.value })} /></Field>
                    <Field label="Saída"><Input type="time" value={v.fim} onChange={(e) => setVisita(i, { fim: e.target.value })} /></Field>
                    <Field label={m ? `Tempo · ${fmtMinutos(m)}` : 'Tempo (h)'}>
                      <Input value={temHoras ? '' : v.duracao} disabled={temHoras} placeholder={temHoras ? 'pelas horas' : '1:30'} onChange={(e) => setVisita(i, { duracao: e.target.value })} />
                    </Field>
                    <button type="button" onClick={() => setForm({ ...form, visitas: form.visitas.filter((_, j) => j !== i) })} className="mb-1 justify-self-end rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Remover ida"><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Itens trocados ou comprados</span>
              <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, itens: [...form.itens, { descricao: '', quantidade: '1', tipo: 'trocado', valor: '' }] })}><Plus size={12} /> Item</Button>
            </div>
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
          </div>

          <Field label="Fotos finais"><PhotoInput photos={form.donePhotos} onChange={(donePhotos) => setForm({ ...form, donePhotos })} /></Field>

          <div className={cn('flex justify-end gap-2 border-t border-slate-800 pt-2')}>
            <Button variant="subtle" onClick={() => { setForm(paraForm(t)); setEditando(false) }}><X size={14} /> Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar atendimento</Button>
          </div>
        </div>
      )}
    </div>
  )
}
