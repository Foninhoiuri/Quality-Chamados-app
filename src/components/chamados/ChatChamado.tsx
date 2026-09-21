import { MessagesSquare } from 'lucide-react'
import { Modal } from '@/components/ui'
import { TicketComments } from '@/components/TicketComments'
import type { Ticket } from '@/lib/types'

/**
 * O CHAT do chamado, em janela própria. Antes vivia no fim do modal do chamado: quem
 * estava em campo tinha de rolar o atendimento inteiro para ler um recado, e quem não
 * tinha pegado o chamado nem chegava lá. Agora é um botão ao lado de "pegar"/"finalizar",
 * aberto para qualquer um que enxergue o chamado.
 */
export function ChatChamado({ t, podeComentar, onFechar, onMudou }: {
  t: Ticket
  podeComentar: boolean
  onFechar: () => void
  onMudou: () => void
}) {
  return (
    <Modal
      open
      onClose={onFechar}
      telaCheia
      title={
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-wide text-red-400/80">{t.code}</div>
          <h2 className="inline-flex items-center gap-1.5 truncate text-[15px] font-semibold leading-tight text-slate-100">
            <MessagesSquare size={15} className="shrink-0 text-red-400" /> Conversa do chamado
          </h2>
        </div>
      }
      tituloTexto={`Conversa do ${t.code}`}
    >
      <TicketComments ticketId={t.id} podeComentar={podeComentar} onCountChange={onMudou} />
    </Modal>
  )
}
