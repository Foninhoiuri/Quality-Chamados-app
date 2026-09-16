import { PrismaClient } from '@prisma/client'

// Carrega o .env (Node 20.12+) antes de instanciar o Prisma.
try {
  process.loadEnvFile()
} catch {
  /* .env ausente — usa defaults */
}

export const prisma = new PrismaClient()

const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:')

/**
 * Auditoria append-only de verdade. No SQLite, triggers bloqueiam UPDATE/DELETE
 * em AuditLog. Em Postgres, fazer o mesmo via GRANT (revogar UPDATE/DELETE da
 * tabela para o usuário da aplicação).
 */
export async function enforceAuditImmutability() {
  if (!isSqlite) return
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'AuditLog e somente-anexacao'); END;`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'AuditLog e somente-anexacao'); END;`)
  } catch (e) {
    console.warn('[auditoria] não foi possível instalar triggers de imutabilidade:', e)
  }
}
