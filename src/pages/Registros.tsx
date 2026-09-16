import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, User as UserIcon, Pencil, Trash2, Ticket, Loader2, Phone } from 'lucide-react'
import { Button, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui'
import { useStore, useCan, useCurrentUser } from '@/lib/store'
import { api } from '@/lib/api'
import { TIPO_REGISTRO, TIPOS_REGISTRO, tipoRegistroDe } from '@/lib/registros'
import { paraInputLocal } from '@/lib/tickets'
import type { Registro, TipoRegistro } from '@/lib/types'

interface RForm { tipo: TipoRegistro; ocorridoEm: string; solicitante: string; descricao: string; localId: string }
const agoraLocal = () => paraInputLocal(new Date().toISOString())
const vazio = (localId = ''): RForm => ({ tipo: 'solicitacao', ocorridoEm: agoraLocal(), solicitante: '', descricao: '', localId })

type Periodo = '7' | '30' | '90'

function rotuloDia(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(Date.now() - 86400000)
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (mesmo(d, hoje)) return 'Hoje'
  if (mesmo(d, ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export default function Registros() {
  const locais = useStore((s) => s.locais)
  const showToast = useStore((s) => s.showToast)
  const me = useCurrentUser()
  const navigate = useNavigate()
  const canCreate = useCan('criar_registros')
  const canDeleteAny = useCan('excluir_registros')
  const canCreateTicket = useCan('criar_chamados')

  const [itens, setItens] = useState<Registro[] | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('30')
  const [localId, setLocalId] = useState('')
  const [tipo, setTipo] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Registro | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Registro | null>(null)
  const [form, setForm] = useState<RForm>(vazio())
  const [saving, setSaving] = useState(false)

  const carregar = useCallback(() => {
    const de = new Date(Date.now() - Number(periodo) * 86400000).toISOString()
    return api.registros({ de, localId, tipo }).then(setItens).catch(() => { setItens([]); showToast('Não foi possível carregar os registros') })
  }, [periodo, localId, tipo, showToast])

  useEffect(() => { setItens(null); carregar() }, [carregar])
  // Mantém a linha do tempo viva quando mais de uma atendente está registrando.
  useEffect(() => { const id = setInterval(carregar, 20000); return () => clearInterval(id) }, [carregar])

  function openNew() { setForm(vazio(localId || (locais.length === 1 ? locais[0].id : ''))); setEditing('new') }
  useEffect(() => {
    const h = () => { if (canCreate) openNew() }
    window.addEventListener('shortcut:new', h)
    return () => window.removeEventListener('shortcut:new', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, localId, locais])

  async function salvar() {
    if (!form.descricao.trim()) return showToast('Descreva o que aconteceu ou o que foi solicitado')
    if (!form.ocorridoEm) return showToast('Informe a data e a hora')
    const body = { tipo: form.tipo, ocorridoEm: new Date(form.ocorridoEm).toISOString(), solicitante: form.solicitante.trim() || null, descricao: form.descricao.trim(), localId: form.localId || null }
    setSaving(true)
    try {
      if (editing === 'new') { await api.createRegistro(body); showToast('Registro salvo') }
      else if (editing) { await api.updateRegistro(editing.id, body); showToast('Registro atualizado') }
      setEditing(null)
      await carregar()
    } catch (e: any) {
      showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o registro')
    } finally {
      setSaving(false)
    }
  }

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (itens ?? []).filter((r) => !t || `${r.descricao} ${r.solicitante ?? ''} ${r.autorName} ${r.localName ?? ''}`.toLowerCase().includes(t))
  }, [itens, q])

  const porDia = useMemo(() => {
    const grupos: { dia: string; itens: Registro[] }[] = []
    for (const r of filtrados) {
      const dia = new Date(r.ocorridoEm).toDateString()
      const g = grupos[grupos.length - 1]
      if (g && g.dia === dia) g.itens.push(r)
      else grupos.push({ dia, itens: [r] })
    }
    return grupos
  }, [filtrados])

  const podeMexer = (r: Registro) => r.autorId === me.id || canDeleteAny

  return (
    <div>
      <PageHeader
        title="Registros"
        subtitle="Acontecimentos e solicitações que não são chamados — em ordem, com data, hora e quem pediu"
        actions={canCreate && <Button onClick={openNew}><Plus size={15} /> Novo registro</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input data-busca value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar texto, solicitante, autor…" aria-label="Buscar registros" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500" />
        </div>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)} aria-label="Período">
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </Select>
        <Select value={localId} onValueChange={setLocalId} aria-label="Local">
          <option value="">Todos os locais</option>
          {locais.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
        </Select>
        <Select value={tipo} onValueChange={setTipo} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {TIPOS_REGISTRO.map((t) => (<option key={t} value={t}>{TIPO_REGISTRO[t].label}</option>))}
        </Select>
      </div>

      {itens === null ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : filtrados.length === 0 ? (
        <EmptyState>{(itens ?? []).length ? 'Nenhum registro para essa busca.' : `Nenhum registro no período.${canCreate ? ' Use “Novo registro” para anotar uma solicitação ou ocorrência.' : ''}`}</EmptyState>
      ) : (
        <div className="space-y-6">
          {porDia.map((g) => (
            <section key={g.dia}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 first-letter:uppercase">{rotuloDia(g.itens[0].ocorridoEm)}</h2>
              <ol className="relative ml-2 border-l border-slate-800">
                {g.itens.map((r) => {
                  const meta = tipoRegistroDe(r.tipo)
                  return (
                    <li key={r.id} className="group relative mb-3 ml-5 last:mb-0">
                      <span className="absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-[var(--app-bg)]" style={{ background: meta.color }} />
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12px] font-medium text-slate-200">{new Date(r.ocorridoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: meta.color, background: meta.color + '1e' }}>{meta.label}</span>
                            {r.ticketCode && (
                              <Link to={`/chamados?t=${r.ticketId}`} className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300 hover:bg-red-500/20"><Ticket size={10} /> virou {r.ticketCode}</Link>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            {canCreateTicket && !r.ticketId && (
                              <button onClick={() => navigate('/chamados', { state: { deRegistro: r } })} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200" title="Abrir um chamado a partir deste registro">
                                <Ticket size={12} /> Abrir chamado
                              </button>
                            )}
                            {podeMexer(r) && (
                              <>
                                <button onClick={() => { setForm({ tipo: r.tipo, ocorridoEm: paraInputLocal(r.ocorridoEm), solicitante: r.solicitante ?? '', descricao: r.descricao, localId: r.localId ?? '' }); setEditing(r) }} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Editar"><Pencil size={13} /></button>
                                <button onClick={() => setDeleting(r)} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Excluir"><Trash2 size={13} /></button>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{r.descricao}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          {r.solicitante && <span className="inline-flex items-center gap-1"><Phone size={11} /> solicitado por <span className="text-slate-300">{r.solicitante}</span></span>}
                          {r.localName && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {r.localName}</span>}
                          <span className="inline-flex items-center gap-1"><UserIcon size={11} /> registrado por {r.autorName}</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Novo registro' : 'Editar registro'}
        onSubmit={salvar}
        footer={<><Button variant="subtle" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>Salvar</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/40 p-0.5" role="radiogroup" aria-label="Tipo">
            {TIPOS_REGISTRO.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={form.tipo === t}
                onClick={() => setForm({ ...form, tipo: t })}
                className={`rounded-md px-2 py-1.5 text-xs font-medium ${form.tipo === t ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {TIPO_REGISTRO[t].label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Data e hora"><Input type="datetime-local" value={form.ocorridoEm} max={agoraLocal()} onChange={(e) => setForm({ ...form, ocorridoEm: e.target.value })} /></Field>
            <Field label="Local">
              <Select className="w-full" value={form.localId} onValueChange={(v) => setForm({ ...form, localId: v })}>
                <option value="">— nenhum —</option>
                {locais.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </Select>
            </Field>
          </div>
          <Field label="Quem solicitou / avisou"><Input value={form.solicitante} onChange={(e) => setForm({ ...form, solicitante: e.target.value })} placeholder="Ex.: Dona Maria, apto 42" /></Field>
          <Field label="O que foi solicitado ou aconteceu">
            <Textarea rows={4} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Pediu cadastro de 2 novas tags para o carro." autoFocus />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Excluir registro"
        footer={<><Button variant="subtle" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" onClick={async () => {
          const r = deleting
          setDeleting(null)
          if (!r) return
          try { await api.deleteRegistro(r.id); await carregar(); showToast('Registro excluído') } catch (e: any) { showToast(e?.message ?? 'Não foi possível excluir') }
        }}>Excluir</Button></>}
      >
        <p className="text-sm text-slate-300">Excluir este registro? A exclusão fica na auditoria.</p>
      </Modal>
    </div>
  )
}
