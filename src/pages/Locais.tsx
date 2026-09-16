import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, MapPin, Phone, Ticket } from 'lucide-react'
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Textarea } from '@/components/ui'
import { useStore, useCan } from '@/lib/store'
import type { Local } from '@/lib/types'

type LForm = Pick<Local, 'code' | 'name' | 'city' | 'address' | 'phone' | 'note'>
const vazio: LForm = { code: '', name: '', city: '', address: '', phone: '', note: '' }

export default function Locais() {
  const locais = useStore((s) => s.locais)
  const { addLocal, updateLocal, removeLocal, showToast } = useStore()
  const canManage = useCan('gerenciar_locais')
  const canDelete = useCan('excluir_locais')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Local | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Local | null>(null)
  const [form, setForm] = useState<LForm>(vazio)
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? locais.filter((l) => `${l.code} ${l.name} ${l.city} ${l.address}`.toLowerCase().includes(t)) : locais
  }, [locais, q])

  function openNew() { setForm(vazio); setEditing('new') }
  function openEdit(l: Local) { setForm({ code: l.code, name: l.name, city: l.city, address: l.address, phone: l.phone, note: l.note }); setEditing(l) }
  useEffect(() => {
    const h = () => { if (canManage) openNew() }
    window.addEventListener('shortcut:new', h)
    return () => window.removeEventListener('shortcut:new', h)
  }, [canManage])

  async function save() {
    if (!form.name.trim()) return showToast('Informe o nome do local')
    setSaving(true)
    try {
      if (editing === 'new') { await addLocal(form); showToast('Local criado') }
      else if (editing) { await updateLocal(editing.id, form); showToast('Local salvo') }
      setEditing(null)
    } catch (e: any) {
      showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o local')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Locais"
        subtitle={`${locais.length} local(is) — clientes, condomínios ou filiais atendidos`}
        actions={canManage && <Button onClick={openNew}><Plus size={15} /> Novo local</Button>}
      />

      <div className="relative mb-4 max-w-xs">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
        <input data-busca value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar local…" aria-label="Buscar local" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500" />
      </div>

      {rows.length === 0 ? (
        <EmptyState>{locais.length === 0 ? <>Nenhum local cadastrado.{canManage && ' Cadastre o primeiro para associar aos chamados.'}</> : 'Nenhum local para essa busca.'}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((l) => (
            <Card key={l.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] text-slate-500">{l.code}</div>
                  <div className="truncate font-medium text-slate-100">{l.name}</div>
                </div>
                {(canManage || canDelete) && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {canManage && <button onClick={() => openEdit(l)} className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Editar"><Pencil size={14} /></button>}
                    {canDelete && <button onClick={() => setDeleting(l)} className="rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Excluir"><Trash2 size={14} /></button>}
                  </div>
                )}
              </div>
              <div className="mt-2 flex-1 space-y-1 text-[12px] text-slate-400">
                {(l.address || l.city) && <div className="flex items-start gap-1.5"><MapPin size={12} className="mt-0.5 shrink-0" /> {[l.address, l.city].filter(Boolean).join(' · ')}</div>}
                {l.phone && <div className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {l.phone}</div>}
                {l.note && <div className="line-clamp-2 text-slate-500">{l.note}</div>}
              </div>
              <Link to="/chamados" className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700">
                <Ticket size={11} /> {l.ticketCount ?? 0} chamado(s) ativos
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Novo local' : 'Editar local'}
        onSubmit={save}
        footer={<><Button variant="subtle" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} disabled={saving}>Salvar</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Código" hint="vazio = automático"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="LC-001" /></Field>
            <div className="col-span-2"><Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Condomínio Jardim" autoFocus /></Field></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 90000-0000" /></Field>
          </div>
          <Field label="Endereço"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Observação"><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Contato, horário, referência…" /></Field>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Excluir local"
        footer={
          <>
            <Button variant="subtle" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={async () => {
              const alvo = deleting
              setDeleting(null)
              if (!alvo) return
              try { await removeLocal(alvo.id); showToast('Local excluído') } catch (e: any) { showToast(e?.message ?? 'Não foi possível excluir') }
            }}>Excluir</Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          Excluir <span className="font-medium text-slate-100">{deleting?.name}</span>? Os chamados dele continuam existindo, só ficam sem local.
        </p>
      </Modal>
    </div>
  )
}
