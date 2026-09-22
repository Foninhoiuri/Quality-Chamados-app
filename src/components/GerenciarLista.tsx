import { useState } from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import { Button, Input, Modal } from './ui'
import { CORES_CATEGORIA } from '@/lib/registros'
import type { TipoRegistroDef } from '@/lib/types'

/**
 * A MESMA MECÂNICA para toda lista que a casa edita: categorias de registro, tipos de
 * local — as colunas do quadro são primas com uma regra a mais (as pontas não se mexem).
 * Arrastar para reordenar, renomear no lugar, cor ao lado e o aviso do que acontece com
 * quem estava na etiqueta apagada. Uma tela só para aprender.
 */
export function GerenciarLista({ titulo, ajuda, placeholder, itens, contagem, aviso, permitirVazia, onClose, onSave }: {
  titulo: string
  ajuda: string
  placeholder: string
  itens: TipoRegistroDef[]
  /** Quantos usam cada etiqueta hoje — é o que dá peso ao aviso de remoção. */
  contagem: Record<string, number>
  /** O que acontece com quem fica órfão, escrito por quem chama (cada tela tem a sua regra). */
  aviso: (quantos: number, nomes: string, primeiro: string) => string
  /** Lista vazia é aceitável? (tipos de local, sim; categorias de registro, não.) */
  permitirVazia?: boolean
  onClose: () => void
  onSave: (list: TipoRegistroDef[]) => void
}) {
  const [list, setList] = useState<TipoRegistroDef[]>(itens.map((t) => ({ ...t })))
  const [label, setLabel] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const slug = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  function add() {
    const l = label.trim()
    if (!l) return
    let key = slug(l) || `item-${list.length + 1}`
    if (list.some((t) => t.key === key)) key = `${key}-${list.length + 1}`
    setList([...list, { key, label: l, color: CORES_CATEGORIA[list.length % CORES_CATEGORIA.length] }])
    setLabel('')
  }
  const troca = (i: number, p: Partial<TipoRegistroDef>) => setList(list.map((t, j) => (j === i ? { ...t, ...p } : t)))
  function reorder(from: number, to: number) {
    setList((l) => {
      const c = [...l]
      const [m] = c.splice(from, 1)
      c.splice(to, 0, m)
      return c
    })
  }

  const somem = itens.filter((t) => !list.some((x) => x.key === t.key) && (contagem[t.key] ?? 0) > 0)
  const quantos = somem.reduce((n, t) => n + (contagem[t.key] ?? 0), 0)
  const valido = (permitirVazia || list.length > 0) && list.every((t) => t.label.trim())
  const podeRemover = permitirVazia || list.length > 1

  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      footer={<><Button variant="subtle" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(list)} disabled={!valido}>Salvar</Button></>}
    >
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500">{ajuda}</p>
        <div className="space-y-1.5">
          {list.map((t, i) => (
            <div
              key={t.key}
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
              <input
                type="color"
                value={t.color}
                onChange={(e) => troca(i, { color: e.target.value })}
                aria-label={`Cor de ${t.label}`}
                title="Cor"
                className="h-7 w-7 shrink-0 cursor-pointer rounded border border-slate-700 bg-transparent p-0.5"
              />
              <Input value={t.label} onChange={(e) => troca(i, { label: e.target.value })} className="flex-1" aria-label="Nome" />
              {(contagem[t.key] ?? 0) > 0 && <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{contagem[t.key]}</span>}
              {podeRemover && (
                <button onClick={() => setList(list.filter((_, j) => j !== i))} className="shrink-0 rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Remover"><X size={14} /></button>
              )}
            </div>
          ))}
          {list.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-800 px-3 py-5 text-center text-[12px] text-slate-600">Nenhum item na lista.</div>
          )}
        </div>
        {quantos > 0 && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
            {aviso(quantos, somem.map((t) => `"${t.label}"`).join(', '), list[0]?.label ?? '')}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder={placeholder} className="flex-1" />
          <Button variant="subtle" onClick={add}><Plus size={15} /> Adicionar</Button>
        </div>
      </div>
    </Modal>
  )
}
