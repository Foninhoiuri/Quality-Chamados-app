import { useMemo } from 'react'
import { create } from 'zustand'
import { api, setToken, getToken, ApiError } from './api'
import { effectivePerms, type PermissionDef } from './permissions'
import { applyTheme, getStoredTheme, type Theme } from './theme'
import type { Local, LogEntry, Notification, Role, TecnicoRef, Ticket, User } from './types'

/**
 * Store ligado à API (fonte de verdade = backend). As ações chamam a API e
 * re-hidratam a fatia afetada.
 */

function loginErrorMessage(e: unknown): string {
  const status = e instanceof ApiError ? e.status : -1
  if (status === 0) return 'Erro de conexão com o servidor. Verifique se a API está no ar.'
  if (status === 401) return 'Login ou senha incorretos.'
  if (status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  if (status >= 500) return 'Erro no servidor. Tente novamente em instantes.'
  return 'Não foi possível entrar. Tente novamente.'
}

function normLog(l: any): LogEntry {
  return {
    id: l.id,
    ts: l.ts,
    actor: l.actorName ?? 'Sistema',
    actorRole: l.actorRole ?? '',
    action: l.action,
    entity: l.entity,
    target: l.target,
    local: l.local ?? undefined,
    detail: l.detail ?? undefined,
  }
}

interface AppState {
  me: User | null
  booted: boolean
  needsSetup: boolean
  authError: string | null
  apiOnline: boolean
  setApiOnline: (v: boolean) => void

  theme: Theme
  setTheme: (t: Theme) => void

  locais: Local[]
  users: User[]
  roles: Role[]
  permissions: PermissionDef[]
  logs: LogEntry[]
  tickets: Ticket[]
  notifications: Notification[]
  settings: Record<string, string>
  /** Quem é quem, com foto: o app mostra o rosto de quem escreveu, não só a inicial. */
  pessoas: TecnicoRef[]
  refreshPessoas: () => Promise<void>

  boot: () => Promise<void>
  setup: (data: { name: string; email: string; password: string }) => Promise<boolean>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>
  updateProfile: (patch: { name?: string; phone?: string; email?: string; avatar?: string | null; notifPrefs?: Record<string, boolean> }) => Promise<void>

  refreshLocais: () => Promise<void>
  refreshUsers: () => Promise<void>
  refreshRoles: () => Promise<void>
  refreshLogs: (limit?: number) => Promise<void>
  refreshTickets: () => Promise<void>
  refreshSettings: () => Promise<void>
  refreshNotifications: () => Promise<void>

  markNotifRead: (id: string) => Promise<void>
  markAllNotifsRead: () => Promise<void>
  deleteNotif: (id: string) => Promise<void>
  clearNotifs: () => Promise<void>

  addLocal: (input: Partial<Local>) => Promise<void>
  updateLocal: (id: string, patch: Partial<Local>) => Promise<void>
  removeLocal: (id: string) => Promise<void>

  addUser: (input: Partial<User>) => Promise<string | null>
  updateUser: (id: string, patch: Partial<User>) => Promise<void>
  removeUser: (id: string) => Promise<void>

  addRole: (input: { name: string; color?: string; permissions?: string[] }) => Promise<void>
  removeRole: (id: string) => Promise<void>
  toggleRolePermission: (roleId: string, perm: string) => Promise<void>

  addTicket: (input: Partial<Ticket> & { title: string; registroId?: string }) => Promise<void>
  updateTicket: (id: string, patch: Partial<Ticket>) => Promise<void>
  acceptTicket: (id: string) => Promise<void>
  releaseTicket: (id: string) => Promise<void>
  cancelTicket: (id: string, motivo?: string) => Promise<void>
  transferirTicket: (id: string, paraId: string | null, motivo?: string) => Promise<void>
  shareTicket: (id: string, userIds: string[]) => Promise<void>
  removeTicket: (id: string) => Promise<void>

  setSetting: (key: string, value: string) => Promise<void>

  toast: string | null
  showToast: (msg: string) => void
}

export const useStore = create<AppState>()((set, get) => ({
  me: null,
  booted: false,
  needsSetup: false,
  authError: null,
  apiOnline: true,
  setApiOnline: (v) => set((s) => (s.apiOnline === v ? {} : { apiOnline: v })),
  theme: getStoredTheme(),
  setTheme: (t) => {
    applyTheme(t)
    set({ theme: t })
  },
  locais: [],
  users: [],
  roles: [],
  permissions: [],
  logs: [],
  tickets: [],
  notifications: [],
  settings: {},
  pessoas: [],
  refreshPessoas: async () => set({ pessoas: await api.pessoas().catch(() => []) }),

  boot: async () => {
    if (!getToken()) {
      // Sem token: descobre se a base sequer tem usuários (senão, vai para o setup).
      let needs = false
      try {
        needs = (await api.setupStatus()).needsSetup
      } catch {
        // API fora do ar: cai no login, que sabe mostrar erro de conexão.
      }
      set({ booted: true, me: null, needsSetup: needs })
      return
    }
    try {
      const me = await api.me()
      await hydrateAll(set)
      set({ me, needsSetup: false })
    } catch {
      setToken(null)
      set({ me: null })
    } finally {
      set({ booted: true })
    }
  },

  setup: async ({ name, email, password }) => {
    set({ authError: null })
    try {
      const { token, user } = await api.setup({ name, email, password })
      setToken(token)
      // Hidrata ANTES de definir `me`: sem os papéis carregados as permissões saem
      // vazias no primeiro render e a rota inicial manda para o lugar errado.
      await hydrateAll(set)
      set({ me: user, needsSetup: false })
      return true
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        set({ needsSetup: false, authError: 'O sistema já foi configurado. Faça login.' })
        return false
      }
      set({ authError: e?.message || 'Não foi possível concluir a configuração.' })
      return false
    }
  },

  login: async (email, password) => {
    set({ authError: null })
    try {
      const { token, user } = await api.login(email, password)
      setToken(token)
      await hydrateAll(set)
      set({ me: user })
      return true
    } catch (e) {
      set({ authError: loginErrorMessage(e) })
      return false
    }
  },

  logout: () => {
    setToken(null)
    set({ me: null, locais: [], users: [], roles: [], permissions: [], logs: [], tickets: [], notifications: [], settings: {} })
  },

  changePassword: async (newPassword, currentPassword) => {
    set({ me: await api.changePassword({ newPassword, currentPassword }) })
  },
  updateProfile: async (patch) => {
    const me = await api.updateProfile(patch)
    // `pessoas` é a lista de rostos que o app inteiro usa (comentário, técnico do chamado,
    // autor do registro). Sem recarregar aqui, a foto recém-enviada só apareceria na
    // próxima vez que o app abrisse — em todo lugar continuaria a inicial.
    set({ me, pessoas: await api.pessoas().catch(() => get().pessoas) })
  },

  refreshLocais: async () => set({ locais: await api.locais() }),
  refreshUsers: async () => set({ users: await api.users() }),
  refreshRoles: async () => set({ roles: await api.roles() }),
  refreshLogs: async (limit) => set({ logs: (await api.audit(limit)).map(normLog) }),
  refreshTickets: async () => set({ tickets: await api.tickets() }),
  refreshSettings: async () => set({ settings: await api.settings() }),
  refreshNotifications: async () => set({ notifications: await api.notifications() }),

  markNotifRead: async (id) => {
    set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
    try { await api.markNotifRead(id) } catch { get().refreshNotifications().catch(() => {}) }
  },
  markAllNotifsRead: async () => {
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
    try { await api.markAllNotifsRead() } catch { get().refreshNotifications().catch(() => {}) }
  },
  deleteNotif: async (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
    try { await api.deleteNotif(id) } catch { get().refreshNotifications().catch(() => {}) }
  },
  clearNotifs: async () => {
    set({ notifications: [] })
    try { await api.clearNotifs() } catch { get().refreshNotifications().catch(() => {}) }
  },

  addLocal: async (input) => {
    await api.createLocal(input)
    await get().refreshLocais()
  },
  updateLocal: async (id, patch) => {
    await api.updateLocal(id, patch)
    await Promise.all([get().refreshLocais(), get().refreshTickets()])
  },
  removeLocal: async (id) => {
    await api.deleteLocal(id)
    await Promise.all([get().refreshLocais(), get().refreshTickets()])
  },

  addUser: async (input) => {
    const created = await api.createUser(input)
    await get().refreshUsers()
    return created.tempPassword ?? null
  },
  updateUser: async (id, patch) => {
    await api.updateUser(id, patch)
    await get().refreshUsers()
    // Nome, foto e quem está ativo saem daqui para os avatares do resto do app.
    await get().refreshPessoas()
    if (id === get().me?.id) set({ me: await api.me() })
  },
  removeUser: async (id) => {
    await api.deleteUser(id)
    await get().refreshUsers()
    await get().refreshPessoas()
  },

  addRole: async (input) => {
    await api.createRole(input)
    await get().refreshRoles()
  },
  removeRole: async (id) => {
    await api.deleteRole(id)
    await Promise.all([get().refreshRoles(), get().refreshUsers()])
  },
  toggleRolePermission: async (roleId, perm) => {
    const role = get().roles.find((r) => r.id === roleId)
    if (!role) return
    const permissions = role.permissions.includes(perm) ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm]
    // Otimista: a caixinha responde na hora; se falhar, volta ao que o servidor diz.
    set((s) => ({ roles: s.roles.map((r) => (r.id === roleId ? { ...r, permissions } : r)) }))
    try { await api.updateRole(roleId, { permissions }) } catch { get().showToast('Não foi possível alterar a permissão') }
    await get().refreshRoles()
  },

  addTicket: async (input) => {
    await api.createTicket(input)
    await Promise.all([get().refreshTickets(), get().refreshLocais().catch(() => {})])
  },
  updateTicket: async (id, patch) => {
    await api.updateTicket(id, patch)
    await get().refreshTickets()
  },
  acceptTicket: async (id) => {
    await api.acceptTicket(id)
    await get().refreshTickets()
  },
  releaseTicket: async (id) => {
    await api.releaseTicket(id)
    await get().refreshTickets()
  },
  cancelTicket: async (id, motivo) => {
    await api.cancelTicket(id, motivo)
    await get().refreshTickets()
  },
  transferirTicket: async (id, paraId, motivo) => {
    await api.transferirTicket(id, paraId, motivo)
    await get().refreshTickets()
  },
  shareTicket: async (id, userIds) => {
    await api.shareTicket(id, userIds)
    await get().refreshTickets()
  },
  removeTicket: async (id) => {
    await api.deleteTicket(id)
    await get().refreshTickets()
  },

  setSetting: async (key, value) => {
    await api.updateSetting(key, value)
    await get().refreshSettings()
  },

  toast: null,
  showToast: (msg) => {
    set({ toast: msg })
    setTimeout(() => set((s) => (s.toast === msg ? { toast: null } : {})), 2800)
  },
}))

async function hydrateAll(set: (partial: Partial<AppState>) => void) {
  const [locais, users, roles, permissions, tickets, settings, notifications, pessoas] = await Promise.all([
    api.locais().catch(() => []),
    api.users().catch(() => []),
    api.roles().catch(() => []),
    api.permissions().catch(() => []),
    api.tickets().catch(() => []),
    api.settings().catch(() => ({})),
    api.notifications().catch(() => []),
    api.pessoas().catch(() => []),
  ])
  set({ locais, users, roles, permissions, tickets, settings, notifications, pessoas })
}

// ---------------- hooks de conveniência ----------------

export function useCurrentUser(): User {
  return useStore((s) => s.me as User)
}

export function useCurrentRole(): Role | undefined {
  return useStore((s) => s.roles.find((r) => r.id === s.me?.roleId))
}

/** Permissão efetiva do usuário logado (papel + exceções). */
export function useCan(perm: string): boolean {
  return useStore((s) => (s.me ? effectivePerms(s.me, s.roles).has(perm) : false))
}

/** Conjunto memoizado de permissões efetivas (Set novo a cada leitura re-renderizaria tudo). */
export function usePerms(): Set<string> {
  const me = useStore((s) => s.me)
  const roles = useStore((s) => s.roles)
  return useMemo(() => (me ? effectivePerms(me, roles) : new Set<string>()), [me, roles])
}
