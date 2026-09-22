import { useState } from 'react'
import { Plus, Loader2, X, MapPin } from 'lucide-react'
import { Button, Select } from './ui'
import { FormularioLocal, LOCAL_VAZIO, type LocalForm } from './FormularioLocal'
import { useStore, useCan, useCurrentUser } from '@/lib/store'

/**
 * Escolha de local com a saída de emergência que o atendimento precisa: às vezes o
 * chamado é de um lugar que ainda não está cadastrado. Em vez de mandar a pessoa para a
 * tela de Locais e perder o que já digitou, o cadastro abre aqui mesmo, embutido.
 *
 * Quem não pode criar local (ou está restrito a alguns) vê só a lista.
 */
export function LocalSelect({ value, onChange, allowEmpty = true, className }: {
  value: string
  onChange: (id: string) => void
  allowEmpty?: boolean
  className?: string
}) {
  const locais = useStore((s) => s.locais)
  const addLocal = useStore((s) => s.addLocal)
  const showToast = useStore((s) => s.showToast)
  const me = useCurrentUser()
  const podeCriar = useCan('gerenciar_locais') && me?.scope === 'global'

  const [criando, setCriando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<LocalForm>(LOCAL_VAZIO)

  async function salvar() {
    const name = novo.name.trim()
    setErro(null)
    if (!name) return setErro('Informe o nome do local')
    setSalvando(true)
    try {
      await addLocal({ ...novo, name } as any)
      // O store recarrega a lista; o recém-criado é o único com este nome.
      const criado = useStore.getState().locais.find((l) => l.name === name)
      if (criado) onChange(criado.id)
      setNovo(LOCAL_VAZIO)
      setCriando(false)
      showToast('Local criado e selecionado')
    } catch (e: any) {
      setErro(e?.message ? `Não foi possível criar: ${e.message}` : 'Não foi possível criar o local')
    } finally {
      setSalvando(false)
    }
  }

  if (criando) {
    return (
      <div
        // Enter aqui cria o LOCAL. Sem isso ele sobe para o modal do chamado e salva o
        // chamado no meio do cadastro — era o que fazia o "novo local" parecer quebrado.
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          e.stopPropagation()
          if (!salvando) salvar()
        }}
        className="space-y-2 rounded-lg border border-red-900/40 bg-red-500/[0.03] p-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-200"><MapPin size={12} className="text-red-400" /> Novo local</span>
          <button type="button" onClick={() => setCriando(false)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200" aria-label="Cancelar novo local"><X size={14} /></button>
        </div>
        <FormularioLocal form={novo} onChange={setNovo} />
        {erro && <div className="rounded-lg border border-red-900 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">{erro}</div>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="subtle" onClick={() => { setErro(null); setCriando(false) }}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>{salvando && <Loader2 size={12} className="animate-spin" />} Criar e usar</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <Select className="w-full min-w-0" value={value} onValueChange={onChange} aria-label="Local">
        {allowEmpty && <option value="">— nenhum —</option>}
        {/* "(CEN) Ed. Central": a abreviação é como o local é chamado no rádio e no
            relatório, e é por ela que se acha na lista comprida. */}
        {locais.map((l) => (<option key={l.id} value={l.id}>{l.code ? `(${l.code}) ${l.name}` : l.name}</option>))}
      </Select>
      {podeCriar && (
        <button
          type="button"
          onClick={() => setCriando(true)}
          title="Cadastrar um local novo sem sair daqui"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 px-2 py-[7px] text-[12px] text-slate-300 hover:border-red-700 hover:bg-red-500/5 hover:text-slate-100"
        >
          <Plus size={13} /> Novo
        </button>
      )}
    </div>
  )
}

/** Link para o mapa a partir do que estiver preenchido no local. Vazio = sem endereço. */
export function mapsUrl(l?: { name?: string; address?: string; city?: string } | null): string | null {
  if (!l) return null
  const alvo = [l.address, l.city].filter(Boolean).join(', ')
  if (!alvo) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`
}
