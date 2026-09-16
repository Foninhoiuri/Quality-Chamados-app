import jwt from 'jsonwebtoken'
import { prisma } from './db'

// Segredo do JWT. Em produção é obrigatório (validado no boot — ver server.ts).
const SECRET = process.env.JWT_SECRET || 'dev-secret-trocar-em-producao'

export interface TokenUser {
  sub: string
  name: string
}

// Usuário autenticado já com as permissões efetivas resolvidas (papel + exceções).
export interface AuthUser {
  sub: string
  name: string
  roleId: string
  roleName: string
  scope: string
  perms: Set<string>
}

export function sign(user: { id: string; name: string }): string {
  return jwt.sign({ sub: user.id, name: user.name }, SECRET, { expiresIn: '12h' })
}

export function verifyToken(token: string): TokenUser | null {
  try {
    const p = jwt.verify(token, SECRET) as any
    if (!p?.sub) return null
    return { sub: String(p.sub), name: String(p.name ?? '') }
  } catch {
    return null
  }
}

/**
 * Permissões efetivas = permissões do papel + concessões (grants) − negações (denies).
 * Resolvidas do banco a cada requisição: mudança de papel/exceção e desativação de
 * usuário passam a valer na hora (sem reemitir token). Usuário inativo → null.
 */
export async function loadAuthUser(sub: string): Promise<AuthUser | null> {
  const u = await prisma.user.findUnique({
    where: { id: sub },
    include: {
      role: { include: { permissions: { select: { id: true } } } },
      grants: { select: { id: true } },
      denies: { select: { id: true } },
    },
  })
  if (!u || u.status !== 'ativo' || !u.role) return null
  const perms = new Set<string>(u.role.permissions.map((p) => p.id))
  u.grants.forEach((p) => perms.add(p.id))
  u.denies.forEach((p) => perms.delete(p.id))
  return { sub: u.id, name: u.name, roleId: u.roleId, roleName: u.role.name, scope: u.scope, perms }
}
