import type { FaseChamado, Ticket, TicketStatusDef } from './types'

export const DEFAULT_STATUSES: TicketStatusDef[] = [
  { key: 'aberto', label: 'Aberto', fase: 'aberto' },
  { key: 'andamento', label: 'Em atendimento', fase: 'andamento' },
  { key: 'resolvido', label: 'Concluído', done: true, fase: 'concluido' },
]

export const FASES: { id: FaseChamado; label: string; rota: string }[] = [
  { id: 'aberto', label: 'Abertos', rota: '/abertos' },
  { id: 'andamento', label: 'Em andamento', rota: '/andamento' },
  { id: 'concluido', label: 'Concluídos', rota: '/concluidos' },
]

/**
 * Dá fase a uma lista de status. Config antiga (sem `fase`) é lida pela posição: a
 * primeira coluna é a entrada, a de conclusão é o fim, e tudo entre as duas é andamento.
 */
export function comFase(lista: TicketStatusDef[]): TicketStatusDef[] {
  const iDone = lista.findIndex((s) => s.done)
  return lista.map((s, i) => ({
    ...s,
    fase: s.fase ?? (i === 0 ? 'aberto' : s.done || (iDone < 0 && i === lista.length - 1) ? 'concluido' : 'andamento'),
  }))
}

/** Status vêm do setting `ticket_statuses` (customizáveis); o padrão é a rede de segurança. */
export function parseStatuses(settings: Record<string, string>): TicketStatusDef[] {
  try {
    const a = JSON.parse(settings['ticket_statuses'] || '')
    if (Array.isArray(a) && a.length) return comFase(a)
  } catch { /* usa o padrão */ }
  return DEFAULT_STATUSES
}

export const statusesDaFase = (lista: TicketStatusDef[], fase: FaseChamado) => lista.filter((s) => s.fase === fase)

/** Em que fase está este chamado. Status sumido (coluna apagada) cai na entrada. */
export function faseDoTicket(lista: TicketStatusDef[], t: Ticket): FaseChamado {
  return lista.find((s) => s.key === t.status)?.fase ?? 'aberto'
}

/** ISO do servidor → valor aceito pelo `datetime-local` (no fuso de quem olha). */
export function paraInputLocal(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Há quanto tempo o chamado espera na fila, em texto curto: "3 min", "2 h", "4 d". */
export function esperaDesde(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} d`
}
