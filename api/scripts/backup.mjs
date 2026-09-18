#!/usr/bin/env node
/**
 * BACKUP do que não se recupera: o banco (usuários, chamados, horas, chaves do push) e as
 * fotos dos chamados. Perder o volume é perder a operação inteira, e até aqui não havia
 * cópia nenhuma.
 *
 * Roda dentro do container, sem credencial em arquivo: o destino é um volume montado
 * (`BACKUP_DIR`) — de preferência apontando para fora do host, num NAS ou disco externo.
 *
 *   node scripts/backup.mjs           # uma cópia agora
 *   node scripts/backup.mjs --loop    # uma por dia, para rodar como serviço
 *
 * Variáveis:
 *   BACKUP_DIR        onde gravar (padrão /backup)
 *   BACKUP_MANTER     quantas cópias guardar (padrão 14)
 *   BACKUP_INTERVALO  horas entre cópias no modo --loop (padrão 24)
 *   BACKUP_WEBHOOK    URL que recebe um POST quando o backup falha (opcional)
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { PrismaClient } from '@prisma/client'

const exec = promisify(execFile)

const DESTINO = process.env.BACKUP_DIR || '/backup'
const MANTER = Math.max(1, Number(process.env.BACKUP_MANTER || 14))
const INTERVALO_H = Math.max(1, Number(process.env.BACKUP_INTERVALO || 24))
const WEBHOOK = process.env.BACKUP_WEBHOOK || ''
const UPLOADS = process.env.UPLOAD_DIR || new URL('../uploads', import.meta.url).pathname

const agora = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const log = (...a) => console.log(`[backup ${new Date().toISOString()}]`, ...a)

/** Avisa quem monitora. Nunca derruba o backup por causa do aviso. */
async function avisarFalha(mensagem) {
  if (!WEBHOOK) return
  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'quality-chamados', evento: 'backup_falhou', mensagem, quando: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    log('não foi possível avisar o webhook:', e.message)
  }
}

/**
 * Cópia do SQLite com `VACUUM INTO`: sai um arquivo íntegro mesmo com a API escrevendo no
 * meio. Copiar o .db à mão pode gravar um banco pela metade.
 */
async function copiarBanco(prisma, carimbo) {
  const alvo = path.join(DESTINO, `chamados-${carimbo}.db`)
  await prisma.$executeRawUnsafe(`VACUUM INTO '${alvo.replace(/'/g, "''")}'`)
  const { size } = await fs.stat(alvo)
  log(`banco: ${path.basename(alvo)} (${(size / 1024 / 1024).toFixed(1)} MB)`)
  return alvo
}

/** As fotos são dado de cliente: vão junto, compactadas. */
async function copiarUploads(carimbo) {
  try {
    const arquivos = await fs.readdir(UPLOADS)
    if (arquivos.length === 0) return log('uploads: nada para copiar')
    const alvo = path.join(DESTINO, `uploads-${carimbo}.tar.gz`)
    await exec('tar', ['-czf', alvo, '-C', UPLOADS, '.'])
    const { size } = await fs.stat(alvo)
    log(`uploads: ${path.basename(alvo)} (${(size / 1024 / 1024).toFixed(1)} MB, ${arquivos.length} arquivo(s))`)
  } catch (e) {
    if (e.code === 'ENOENT') return log('uploads: pasta ainda não existe')
    throw e
  }
}

/** Guarda as N cópias mais novas de cada tipo; o resto sai. */
async function limparAntigos() {
  const arquivos = await fs.readdir(DESTINO)
  for (const prefixo of ['chamados-', 'uploads-']) {
    const doTipo = arquivos.filter((f) => f.startsWith(prefixo)).sort().reverse()
    for (const velho of doTipo.slice(MANTER)) {
      await fs.rm(path.join(DESTINO, velho), { force: true })
      log(`removido (fora da janela de ${MANTER}): ${velho}`)
    }
  }
}

async function umaVez() {
  const prisma = new PrismaClient()
  try {
    await fs.mkdir(DESTINO, { recursive: true })
    const carimbo = agora()
    await copiarBanco(prisma, carimbo)
    await copiarUploads(carimbo)
    await limparAntigos()
    log('backup concluído')
    return true
  } catch (e) {
    log('FALHOU:', e.message)
    await avisarFalha(e.message)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

const emLoop = process.argv.includes('--loop')
if (emLoop) {
  log(`serviço de backup: a cada ${INTERVALO_H}h, guardando ${MANTER} cópias em ${DESTINO}`)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await umaVez()
    await new Promise((r) => setTimeout(r, INTERVALO_H * 3600_000))
  }
} else {
  const ok = await umaVez()
  process.exit(ok ? 0 : 1)
}
