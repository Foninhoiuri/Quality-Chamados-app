import type { Role, User } from './types'

export interface PermissionDef {
  id: string
  label: string // sempre no infinitivo
  module: string
  system?: boolean
}

/** Permissões efetivas = papel + concessões (grants) − negações (denies). A lista vem da API. */
export function effectivePerms(user: User | undefined | null, roles: Role[]): Set<string> {
  if (!user) return new Set()
  const role = roles.find((r) => r.id === user.roleId)
  const set = new Set<string>(role?.permissions ?? [])
  ;(user.grants ?? []).forEach((p) => set.add(p))
  ;(user.denies ?? []).forEach((p) => set.delete(p))
  return set
}
