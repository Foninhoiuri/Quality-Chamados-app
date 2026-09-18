import type { EventoNotificacao, Local, LogEntry, MonthlyReport, Notification, Novidades, Overview, Registro, Role, SugestaoEndereco, Ticket, TecnicoRef, TicketComment, User } from './types'
import type { PermissionDef } from './permissions'

// Base da API: `/api` na mesma origem (Vite/nginx fazem proxy para o backend).
// Para apontar direto a outro host, definir VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'
const TOKEN_KEY = 'quality-chamados-token'

let token: string | null = localStorage.getItem(TOKEN_KEY)

export function getToken() {
  return token
}
export function setToken(t: string | null) {
  token = t
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Resolve o `src` de uma imagem guardada no banco (`/uploads/...` é servido pela API). */
export function assetUrl(src?: string | null): string | undefined {
  if (!src) return undefined
  if (src.startsWith('/uploads/')) return BASE + src
  return src
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // Servidor fora do ar / sem rede — status 0 é tratado como erro de conexão.
    throw new ApiError(0, 'network')
  }
  if (res.status === 401 && token) {
    // Sessão expirada/invalidada: limpa token e avisa o app para voltar ao login.
    setToken(null)
    window.dispatchEvent(new Event('auth:unauthorized'))
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error || res.statusText)
  return data as T
}

export interface LoginResult {
  token: string
  user: User
}

/** Usuário recém-criado: o servidor devolve a senha temporária UMA única vez. */
export type CreatedUser = User & { tempPassword?: string | null }

export const api = {
  // setup inicial (rotas públicas — usadas antes de existir qualquer conta)
  setupStatus: () => req<{ needsSetup: boolean }>('GET', '/setup/status'),
  setup: (body: { name: string; email: string; password: string }) => req<LoginResult>('POST', '/setup', body),

  // auth
  login: (email: string, password: string) => req<LoginResult>('POST', '/auth/login', { email, password }),
  me: () => req<User>('GET', '/auth/me'),
  changePassword: (body: { currentPassword?: string; newPassword: string }) => req<User>('POST', '/auth/change-password', body),
  updateProfile: (body: { name?: string; phone?: string; email?: string; avatar?: string | null; notifPrefs?: Record<string, boolean> }) =>
    req<User>('PATCH', '/auth/profile', body),

  // notificações (sino)
  notifications: () => req<Notification[]>('GET', '/notifications'),
  notifEvents: () => req<EventoNotificacao[]>('GET', '/notifications/events'),
  markNotifRead: (id: string) => req('PATCH', `/notifications/${id}`, { read: true }),
  markAllNotifsRead: () => req('POST', '/notifications/read-all'),
  deleteNotif: (id: string) => req('DELETE', `/notifications/${id}`),
  clearNotifs: () => req('DELETE', '/notifications'),

  // web push
  vapidKey: () => req<{ publicKey: string }>('GET', '/push/vapid'),
  pushSubscribe: (sub: any) => req<{ ok: boolean }>('POST', '/push/subscribe', sub),
  pushUnsubscribe: (endpoint: string) => req<{ ok: boolean }>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => req<{ ok: boolean }>('POST', '/push/test'),

  // uploads (imagens) — sobe uma vez, depois só trafega o caminho
  upload: (dataUrl: string) => req<{ url: string }>('POST', '/uploads', { dataUrl }),

  // locais
  locais: () => req<Local[]>('GET', '/locais'),
  createLocal: (input: Partial<Local>) => req<Local>('POST', '/locais', input),
  updateLocal: (id: string, patch: Partial<Local>) => req<Local>('PATCH', `/locais/${id}`, patch),
  deleteLocal: (id: string) => req('DELETE', `/locais/${id}`),
  /** Tenta achar a coordenada do local pelo endereço (pino do mapa). */
  geocodeLocal: (id: string) => req<Local>('POST', `/locais/${id}/geocode`),

  // usuários
  users: () => req<User[]>('GET', '/users'),
  createUser: (input: Partial<User>) => req<CreatedUser>('POST', '/users', input),
  updateUser: (id: string, patch: Partial<User>) => req<User>('PATCH', `/users/${id}`, patch),
  deleteUser: (id: string) => req('DELETE', `/users/${id}`),

  // papéis e permissões
  roles: () => req<Role[]>('GET', '/roles'),
  createRole: (input: { name: string; color?: string; permissions?: string[] }) => req<Role>('POST', '/roles', input),
  updateRole: (id: string, patch: Partial<Role>) => req<Role>('PATCH', `/roles/${id}`, patch),
  deleteRole: (id: string) => req('DELETE', `/roles/${id}`),
  permissions: () => req<PermissionDef[]>('GET', '/permissions'),

  // auditoria
  audit: (limit?: number) => req<any[]>('GET', limit ? `/audit?limit=${limit}` : '/audit'),

  // chamados
  tickets: () => req<Ticket[]>('GET', '/tickets'),
  ticketsHistory: () => req<Ticket[]>('GET', '/tickets?history=1'),
  /** `jaRealizado` abre o chamado já concluído: serviço que o técnico fez e só agora registra. */
  createTicket: (body: Partial<Ticket> & { title: string; registroId?: string; jaRealizado?: boolean; realizadoEm?: string }) =>
    req<Ticket>('POST', '/tickets', body),
  updateTicket: (id: string, patch: Partial<Ticket>) => req<Ticket>('PATCH', `/tickets/${id}`, patch),
  acceptTicket: (id: string) => req<Ticket>('POST', `/tickets/${id}/accept`),
  /** Devolve o chamado para a fila (quem pegou, ou admin/gestor). */
  releaseTicket: (id: string) => req<Ticket>('POST', `/tickets/${id}/release`),
  saveAtendimento: (id: string, body: Partial<Pick<Ticket, 'analise' | 'possivelSolucao' | 'solucao' | 'acoesTomadas' | 'visitas' | 'itens' | 'donePhotos'>>) =>
    req<Ticket>('PATCH', `/tickets/${id}/atendimento`, body),
  archiveTicket: (id: string) => req<Ticket>('POST', `/tickets/${id}/archive`),
  /** Tira do histórico e devolve para a coluna de concluídos. */
  unarchiveTicket: (id: string) => req<Ticket>('POST', `/tickets/${id}/unarchive`),
  /** Cancela: some do app, o conteúdo fica na auditoria. */
  cancelTicket: (id: string, motivo?: string) => req<{ ok: boolean }>('POST', `/tickets/${id}/cancel`, { motivo }),
  /** Define quem está junto no chamado (lista completa, não incremental). */
  shareTicket: (id: string, userIds: string[]) => req<Ticket>('POST', `/tickets/${id}/share`, { userIds }),
  tecnicos: (localId?: string | null) => req<TecnicoRef[]>('GET', `/tecnicos${localId ? `?localId=${localId}` : ''}`),
  deleteTicket: (id: string) => req('DELETE', `/tickets/${id}`),
  comments: (ticketId: string) => req<TicketComment[]>('GET', `/tickets/${ticketId}/comments`),
  addComment: (ticketId: string, body: string) => req<TicketComment>('POST', `/tickets/${ticketId}/comments`, { body }),
  deleteComment: (id: string) => req('DELETE', `/comments/${id}`),

  // registros (linha do tempo)
  registros: (q: { de?: string; ate?: string; localId?: string; tipo?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => !!v) as [string, string][]).toString()
    return req<Registro[]>('GET', `/registros${qs ? `?${qs}` : ''}`)
  },
  createRegistro: (body: Partial<Registro> & { descricao: string }) => req<Registro>('POST', '/registros', body),
  updateRegistro: (id: string, body: Partial<Registro>) => req<Registro>('PATCH', `/registros/${id}`, body),
  deleteRegistro: (id: string) => req('DELETE', `/registros/${id}`),

  // dashboard e relatório
  /** O que há de mais novo em cada área (pontinhos da barra de navegação). */
  novidades: () => req<Novidades>('GET', '/novidades'),
  overview: (dias?: number) => req<Overview>('GET', `/stats/overview${dias ? `?dias=${dias}` : ''}`),
  /** CEP → endereço, para preencher o cadastro do local. */
  buscarCep: (cep: string) => req<{ cep: string; address: string; city: string }>('GET', `/cep/${cep.replace(/\D/g, '')}`),
  /** Sugestões de endereço enquanto se digita (pino do mapa). */
  sugestoesEndereco: (q: string) => req<SugestaoEndereco[]>('GET', `/geocode/sugestoes?q=${encodeURIComponent(q)}`),
  monthlyReport: (month: string, localId?: string) =>
    req<MonthlyReport>('GET', `/reports/monthly?month=${month}${localId ? `&localId=${localId}` : ''}`),

  // configurações
  settings: () => req<Record<string, string>>('GET', '/settings'),
  updateSetting: (key: string, value: string) => req<{ key: string; value: string }>('PATCH', `/settings/${key}`, { value }),
}

export type { LogEntry }
