import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Banco limpo a cada execução: um arquivo SQLite temporário criado pelo próprio Prisma.
 * Nunca toca o banco de desenvolvimento — errar isso apagaria dados reais de chamado.
 */
const raiz = path.dirname(fileURLToPath(import.meta.url))
const arquivo = path.join(raiz, 'temp-testes.db')

export async function setup() {
  for (const sufixo of ['', '-journal', '-wal', '-shm']) fs.rmSync(arquivo + sufixo, { force: true })
  process.env.DATABASE_URL = `file:${arquivo}`
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao'
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: path.join(raiz, '..'),
    env: { ...process.env, DATABASE_URL: `file:${arquivo}` },
    stdio: 'ignore',
  })
}

export async function teardown() {
  for (const sufixo of ['', '-journal', '-wal', '-shm']) fs.rmSync(arquivo + sufixo, { force: true })
}
