import { useEffect, useState } from 'react'
import { Send, Trash2, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, iniciais } from '@/lib/utils'
import { useCan, useCurrentUser, useStore } from '@/lib/store'
import type { TicketComment } from '@/lib/types'

function quando(ts: string) {
  const d = new Date(ts)
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * ANDAMENTO: a conversa do chamado. Quem está nele — abriu, pegou ou foi posto junto —
 * escreve aqui, e cada mensagem avisa os outros ("Fulano comentou no seu chamado").
 */
export function TicketComments({ ticketId, podeComentar, onCountChange }: {
  ticketId: string
  /** Quem está no chamado comenta mesmo sem a permissão geral de comentar. */
  podeComentar?: boolean
  onCountChange?: () => void
}) {
  const [items, setItems] = useState<TicketComment[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const me = useCurrentUser()
  const canComment = useCan('comentar_chamados') || !!podeComentar
  const canManage = useCan('gerenciar_chamados')
  const showToast = useStore((s) => s.showToast)

  useEffect(() => {
    let vivo = true
    api.comments(ticketId).then((r) => vivo && setItems(r)).catch(() => vivo && setItems([]))
    return () => { vivo = false }
  }, [ticketId])

  async function enviar() {
    const body = texto.trim()
    if (!body || enviando) return
    setEnviando(true)
    try {
      const novo = await api.addComment(ticketId, body)
      setItems((s) => [...(s ?? []), novo])
      setTexto('')
      onCountChange?.()
    } catch {
      showToast('Não foi possível comentar')
    } finally {
      setEnviando(false)
    }
  }

  async function apagar(c: TicketComment) {
    setItems((s) => (s ?? []).filter((x) => x.id !== c.id))
    try { await api.deleteComment(c.id); onCountChange?.() } catch { showToast('Não foi possível apagar') }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[12px] font-medium text-slate-300">Andamento</span>
        <span className="text-[11px] text-slate-600">a conversa deste chamado — todo mundo que está nele é avisado</span>
      </div>
      {items === null ? (
        <div className="py-3 text-center text-[12px] text-slate-500">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-[12px] text-slate-600">Nenhum comentário ainda.</div>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-auto pr-1">
          {items.map((c) => (
            <div key={c.id} className={cn('group rounded-lg border px-2.5 py-2', c.authorId === me?.id ? 'border-red-900/40 bg-red-500/[0.04]' : 'border-slate-800 bg-slate-950/40')}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[8px] font-semibold text-slate-100">{iniciais(c.authorName)}</span>
                  <span className="truncate text-[11px] font-medium text-slate-300">{c.authorName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-600">
                  {quando(c.createdAt)}
                  {(c.authorId === me?.id || canManage) && (
                    <button onClick={() => apagar(c)} className="rounded p-0.5 text-slate-600 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100" title="Apagar">
                      <Trash2 size={11} />
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-[13px] text-slate-200">{c.body}</div>
            </div>
          ))}
        </div>
      )}
      {canComment && (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar() } }}
            rows={2}
            aria-label="Novo comentário"
            placeholder="Escreva o que foi feito ou pergunte algo… (Ctrl+Enter envia)"
            className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-red-500"
          />
          <button onClick={enviar} disabled={!texto.trim() || enviando} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40" title="Enviar">
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      )}
    </div>
  )
}
