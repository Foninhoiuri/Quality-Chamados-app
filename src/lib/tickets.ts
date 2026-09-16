import type { TicketStatusDef } from './types'

export const DEFAULT_STATUSES: TicketStatusDef[] = [
  { key: 'aberto', label: 'Aberto' },
  { key: 'andamento', label: 'Em atendimento' },
  { key: 'resolvido', label: 'Concluído', done: true },
]

/** Status vêm do setting `ticket_statuses` (customizáveis); o padrão é a rede de segurança. */
export function parseStatuses(settings: Record<string, string>): TicketStatusDef[] {
  try {
    const a = JSON.parse(settings['ticket_statuses'] || '')
    if (Array.isArray(a) && a.length) return a
  } catch { /* usa o padrão */ }
  return DEFAULT_STATUSES
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
