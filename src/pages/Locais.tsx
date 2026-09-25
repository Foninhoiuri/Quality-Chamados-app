import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, MapPin, Ticket, Copy, Check, HandHelping, Hash, Map as MapIcon, List, Crosshair, Loader2, Tags } from 'lucide-react'
import { Button, Card, EmptyState, Modal, PageHeader } from '@/components/ui'
import { SeletorPino } from '@/components/EnderecoPicker'
import { FormularioLocal, LOCAL_VAZIO, type LocalForm } from '@/components/FormularioLocal'
import { useStore, useCan } from '@/lib/store'
import { mapsUrl } from '@/components/LocalSelect'
import { MapaLocais } from '@/components/MapaLocais'
import { api } from '@/lib/api'
import { GerenciarLista } from '@/components/GerenciarLista'
import { enderecoDoLocal, parseTiposLocal, tipoLocalDe } from '@/lib/locais'
import type { Local } from '@/lib/types'

/** Botão de copiar do lado do dado — endereço e telefone existem para ir parar em outro app. */
function Copiar({ texto, label }: { texto: string; label: string }) {
  const [feito, setFeito] = useState(false)
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(texto)
          setFeito(true)
          setTimeout(() => setFeito(false), 1500)
        } catch { /* navegador sem permissão de área de transferência */ }
      }}
      title={`Copiar ${label}`}
      aria-label={`Copiar ${label}`}
      className="shrink-0 rounded p-1 text-slate-600 hover:bg-slate-800 hover:text-slate-200"
    >
      {feito ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  )
}

/** As três contagens que dizem como o local está agora. */
function Pilulas({ l }: { l: Local }) {
  const ativos = l.ticketsAtivos ?? l.ticketCount ?? 0
  const andamento = l.ticketsAndamento ?? 0
  const total = l.ticketsTotal ?? 0
  const pilula = [
    { label: 'ativos', valor: ativos, icon: Ticket, rota: '/abertos', cor: ativos ? 'text-amber-300 bg-amber-500/10' : 'text-slate-400 bg-slate-800' },
    { label: 'em andamento', valor: andamento, icon: HandHelping, rota: '/andamento', cor: andamento ? 'text-sky-300 bg-sky-500/10' : 'text-slate-400 bg-slate-800' },
    { label: 'no total', valor: total, icon: Hash, rota: '/concluidos', cor: 'text-slate-300 bg-slate-800' },
  ]
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {pilula.map(({ label, valor, icon: Icon, rota, cor }) => (
        <Link key={label} to={rota} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] hover:brightness-125 ${cor}`} title={`${valor} chamado(s) ${label}`}>
          <Icon size={11} /> <span className="font-medium tabular-nums">{valor}</span> {label}
        </Link>
      ))}
    </div>
  )
}

type LForm = LocalForm
const vazio = LOCAL_VAZIO

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
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [marcando, setMarcando] = useState(false)
  // Pino ajustado direto no cartão, sem abrir o formulário inteiro.
  const [marcandoLocal, setMarcandoLocal] = useState<Local | null>(null)
  const [localizando, setLocalizando] = useState<string | null>(null)
  // No celular não cabem lista e mapa lado a lado: alterna entre os dois.
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')
  const refreshLocais = useStore((s) => s.refreshLocais)
  const settings = useStore((s) => s.settings)
  const setSetting = useStore((s) => s.setSetting)
  const tipos = useMemo(() => parseTiposLocal(settings), [settings])
  const [gerenciando, setGerenciando] = useState(false)
  /** Filtro por etiqueta: '' = todos, 'sem' = os que ficaram sem tipo. */
  const [tipoFiltro, setTipoFiltro] = useState('')

  /** Tenta pelo endereço; não achando, o pino é marcado à mão no mapa. */
  async function localizar(l: Local) {
    setLocalizando(l.id)
    try {
      await api.geocodeLocal(l.id)
      await refreshLocais()
      setSelecionado(l.id)
      showToast(`${l.name} apareceu no mapa`)
    } catch {
      setMarcandoLocal(l)
    } finally {
      setLocalizando(null)
    }
  }

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return locais.filter((l) => {
      if (tipoFiltro && (tipoFiltro === 'sem' ? !!l.tipo : l.tipo !== tipoFiltro)) return false
      if (!t) return true
      return `${l.code} ${l.name} ${l.city} ${l.address} ${l.number ?? ''} ${l.cep ?? ''}`.toLowerCase().includes(t)
    })
  }, [locais, q, tipoFiltro])

  /** Quantos locais usam cada etiqueta — o gerenciador avisa antes de apagar uma em uso. */
  const contagemPorTipo = useMemo(
    () => locais.reduce<Record<string, number>>((acc, l) => { if (l.tipo) acc[l.tipo] = (acc[l.tipo] ?? 0) + 1; return acc }, {}),
    [locais],
  )

  function openNew() { setForm(vazio); setEditing('new') }
  function openEdit(l: Local) {
    setForm({
      code: l.code, name: l.name, tipo: l.tipo ?? '', cep: l.cep ?? '',
      city: l.city, address: l.address, number: l.number ?? '', complement: l.complement ?? '',
      note: l.note, lat: l.lat ?? null, lng: l.lng ?? null,
      usaLote: !!l.usaLote, itensPedido: [...(l.itensPedido ?? [])],
    })
    setEditing(l)
  }
  useEffect(() => {
    const h = () => { if (canManage) openNew() }
    window.addEventListener('shortcut:new', h)
    return () => window.removeEventListener('shortcut:new', h)
  }, [canManage])

  async function save() {
    if (!form.name.trim()) return showToast('Informe o nome do local')
    setSaving(true)
    try {
      // `lat`/`lng` só vão quando existem: sem elas o servidor procura pelo endereço.
      const payload = { ...form, ...(form.lat == null ? { lat: undefined, lng: undefined } : {}) } as Partial<Local>
      if (editing === 'new') { await addLocal(payload); showToast('Local criado') }
      else if (editing) { await updateLocal(editing.id, payload); showToast('Local salvo') }
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
        menu={[canManage && { label: 'Tipos de local', icon: <Tags size={15} />, onClick: () => setGerenciando(true) }]}
        actions={
          <>
            <div className="flex gap-0.5 rounded-lg border border-slate-800 bg-slate-900/50 p-0.5 lg:hidden">
              {([['lista', 'Lista', List], ['mapa', 'Mapa', MapIcon]] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setVista(k)}
                  aria-pressed={vista === k}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${vista === k ? 'bg-red-500/15 text-red-300' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            {canManage && <Button onClick={openNew}><Plus size={15} /> Novo local</Button>}
          </>
        }
      />

      <div className="mb-4 space-y-2">
        <div className="relative max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input data-busca value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar local…" aria-label="Buscar local" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500" />
        </div>
        {/* Filtro por etiqueta: só aparece quando há etiqueta em uso — linha de botões
            vazia em cima da lista não ajuda ninguém. */}
        {(tipos.length > 0 && locais.some((l) => l.tipo)) && (
          <div className="flex flex-wrap gap-1.5">
            {[{ key: '', label: 'Todos', color: '#94a3b8' }, ...tipos, { key: 'sem', label: 'Sem tipo', color: '#64748b' }].map((t) => {
              const quantos = t.key === '' ? locais.length : t.key === 'sem' ? locais.filter((l) => !l.tipo).length : (contagemPorTipo[t.key] ?? 0)
              if (t.key === 'sem' && quantos === 0) return null
              const on = tipoFiltro === t.key
              return (
                <button
                  key={t.key || 'todos'}
                  onClick={() => setTipoFiltro(t.key)}
                  aria-pressed={on}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
                  style={on
                    ? { color: t.color, background: `${t.color}1e`, borderColor: `${t.color}66` }
                    : { color: '#94a3b8', borderColor: '#334155' }}
                >
                  {t.label} <span className="tabular-nums opacity-70">{quantos}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista e mapa lado a lado a partir de lg; no celular, um de cada vez. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={vista === 'mapa' ? 'hidden lg:block' : ''}>
          {rows.length === 0 ? (
            <EmptyState>{locais.length === 0 ? <>Nenhum local cadastrado.{canManage && ' Cadastre o primeiro para associar aos chamados.'}</> : 'Nenhum local para essa busca.'}</EmptyState>
          ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((l) => (
            <Card
              key={l.id}
              onClick={() => setSelecionado(l.id)}
              className={`flex cursor-pointer flex-col p-4 transition-colors ${selecionado === l.id ? 'border-red-700 bg-red-500/[0.04]' : 'hover:border-slate-700'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-500">{l.code}</span>
                    {(() => {
                      const t = tipoLocalDe(tipos, l.tipo)
                      return t ? (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: t.color, background: `${t.color}1e` }}>{t.label}</span>
                      ) : null
                    })()}
                    {l.usaLote && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300" title="Recebe controles e tags em lote consignado">Lote</span>}
                  </div>
                  <div className="truncate font-medium text-slate-100">{l.name}</div>
                </div>
                {(canManage || canDelete) && (
                  // O cartão inteiro é clicável (seleciona no mapa): estes botões precisam
                  // de alvo grande e de parar o clique, senão o dedo acerta o cartão.
                  <div className="flex shrink-0 items-center gap-1">
                    {canManage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(l) }}
                        className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100"
                        title="Editar local"
                        aria-label={`Editar ${l.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleting(l) }}
                        className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-red-800 hover:bg-red-500/10 hover:text-red-300"
                        title="Excluir local"
                        aria-label={`Excluir ${l.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2 flex-1 space-y-1 text-[12px] text-slate-400">
                {(l.address || l.city) && (
                  <div className="flex items-start gap-1.5">
                    <MapPin size={12} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1">{enderecoDoLocal(l)}</span>
                    <Copiar texto={enderecoDoLocal(l)} label="endereço" />
                  </div>
                )}
                {l.note && <div className="whitespace-pre-wrap text-slate-500">{l.note}</div>}
                {/* Dois destinos diferentes, dois botões: aqui dentro (o mapa da tela) e
                    lá fora (o Google Maps, que é o que abre a navegação no carro). */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {l.lat != null && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelecionado(l.id); setVista('mapa') }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:bg-slate-800"
                      title="Mostrar este local no mapa ao lado"
                    >
                      <MapPin size={11} /> Ver no mapa
                    </button>
                  )}
                  {mapsUrl(l) && (
                    <a
                      href={mapsUrl(l)!}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:bg-slate-800"
                      title="Abrir no Google Maps"
                    >
                      <MapPin size={11} className="text-[#ea4335]" /> Google Maps
                    </a>
                  )}
                </div>
                {!l.address && !l.city && !l.note && <div className="text-slate-600">Sem endereço cadastrado.</div>}
              </div>
              <Pilulas l={l} />
              {canManage && l.lat == null && (l.address || l.city || l.cep) && (
                <button
                  onClick={(e) => { e.stopPropagation(); localizar(l) }}
                  disabled={localizando === l.id}
                  className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-800 px-2 py-1 text-[11px] text-slate-400 hover:border-red-700 hover:text-slate-200 disabled:opacity-50"
                  title="Procura este endereço no mapa e crava o pino"
                >
                  {localizando === l.id ? <Loader2 size={11} className="animate-spin" /> : <Crosshair size={11} />} Localizar no mapa
                </button>
              )}
              {canManage && l.lat != null && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMarcandoLocal(l) }}
                  className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-800 px-2 py-1 text-[11px] text-slate-500 hover:border-red-700 hover:text-slate-200"
                  title="Arraste o mapa para ajustar o pino"
                >
                  <Crosshair size={11} /> Ajustar pino
                </button>
              )}
            </Card>
          ))}
        </div>
          )}
        </div>

        <div className={`lg:sticky lg:top-4 lg:h-[calc(100vh-11rem)] ${vista === 'lista' ? 'hidden lg:block' : 'h-[60vh]'}`}>
          <MapaLocais locais={rows} selecionado={selecionado} onSelecionar={(id) => { setSelecionado(id); setVista('lista') }} />
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Novo local' : 'Editar local'}
        onSubmit={save}
        footer={<><Button variant="subtle" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} disabled={saving}>Salvar</Button></>}
      >
        <FormularioLocal form={form} onChange={setForm} onAbrirMapa={() => setMarcando(true)} />
        {canDelete && editing !== 'new' && typeof editing === 'object' && editing && (
          <button
            onClick={() => { const alvo = editing; setEditing(null); setDeleting(alvo) }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-2 text-[12px] text-slate-400 hover:border-red-800 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 size={14} /> Excluir este local
          </button>
        )}
      </Modal>

      {gerenciando && (
        <GerenciarLista
          titulo="Tipos de local"
          ajuda="A etiqueta que diz que lugar é este — condomínio, comercial, obra. Aparece no cartão, filtra a lista, e a sigla é o que entra dentro do chamado. Arraste pela alça para reordenar."
          placeholder="Novo tipo (ex.: Galpão)"
          itens={tipos}
          contagem={contagemPorTipo}
          permitirVazia
          comAbreviacao
          aviso={(quantos, nomes) => `${quantos} local(is) em ${nomes} ficam SEM tipo ao salvar. Nenhum local é apagado — e marcar com a etiqueta errada seria pior.`}
          onClose={() => setGerenciando(false)}
          onSave={async (list) => {
            try {
              await setSetting('local_tipos', JSON.stringify(list))
              await refreshLocais()
              setTipoFiltro('')
              showToast('Tipos de local salvos')
              setGerenciando(false)
            } catch (e: any) {
              showToast(e?.message ?? 'Não foi possível salvar os tipos')
            }
          }}
        />
      )}

      {marcandoLocal && (
        <SeletorPino
          inicial={marcandoLocal.lat != null && marcandoLocal.lng != null ? { lat: marcandoLocal.lat, lng: marcandoLocal.lng } : null}
          nome={marcandoLocal.name}
          onCancelar={() => setMarcandoLocal(null)}
          onConfirmar={async (c) => {
            const alvo = marcandoLocal
            setMarcandoLocal(null)
            try { await updateLocal(alvo.id, c as Partial<Local>); setSelecionado(alvo.id); showToast('Pino salvo') }
            catch (e: any) { showToast(e?.message ?? 'Não foi possível salvar o pino') }
          }}
        />
      )}

      {marcando && (
        <SeletorPino
          inicial={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null}
          nome={form.name || undefined}
          onCancelar={() => setMarcando(false)}
          onConfirmar={(c) => { setForm({ ...form, lat: c.lat, lng: c.lng }); setMarcando(false) }}
        />
      )}

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
