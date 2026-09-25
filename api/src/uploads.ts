import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Imagens (fotos de chamado, avatar) ficam em disco, não no banco. O banco guarda
 * só o caminho `/uploads/<nome>` e o navegador cacheia o arquivo.
 *
 * O nome é aleatório (16 bytes) e serve de capability: quem não tem o link não
 * adivinha o arquivo. O GET é público de propósito — <img> não manda Authorization.
 */

export const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads')

const TIPOS: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' }
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' }

// Nome válido = 32 hex + extensão conhecida. Barra a travessia de diretório (`../`).
const NAME_RE = /^[a-f0-9]{32}\.(png|jpe?g|webp|pdf)$/
export const UPLOAD_PATH_RE = /^\/uploads\/[a-f0-9]{32}\.(png|jpe?g|webp)$/
/** Comprovante: imagem ou PDF (o boleto pago chega em PDF). Foto de chamado continua só imagem. */
export const COMPROVANTE_PATH_RE = /^\/uploads\/[a-f0-9]{32}\.(png|jpe?g|webp|pdf)$/

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i
const MAX_IMAGE = 15 * 1024 * 1024

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
}

/** Grava uma data URL de imagem (ou PDF, com `aceitaPdf`) e devolve o caminho público. */
export async function saveDataUrl(dataUrl: unknown, aceitaPdf = false): Promise<string | null> {
  if (typeof dataUrl !== 'string') return null
  const m = DATA_URL_RE.exec(dataUrl)
  if (!m) return null
  const ext = aceitaPdf && m[1].toLowerCase() === 'application/pdf' ? 'pdf' : MIME_EXT[m[1].toLowerCase()]
  if (!ext) return null
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length === 0 || buf.length > MAX_IMAGE) return null
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`
  await ensureUploadDir()
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf)
  return `/uploads/${name}`
}

export async function readUpload(name: string): Promise<{ body: Buffer; mime: string } | null> {
  if (!NAME_RE.test(name)) return null
  try {
    const body = await fs.readFile(path.join(UPLOAD_DIR, name))
    return { body, mime: TIPOS[name.split('.').pop()!] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** Apaga arquivos que não são mais referenciados. Nunca lança. */
export async function deleteUploads(paths: (string | null | undefined)[]) {
  for (const p of paths) {
    if (!p || !COMPROVANTE_PATH_RE.test(p)) continue
    await fs.unlink(path.join(UPLOAD_DIR, p.slice('/uploads/'.length))).catch(() => {})
  }
}
