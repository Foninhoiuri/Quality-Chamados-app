import crypto from 'node:crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma, enforceAuditImmutability } from './db'
import { verifyToken, loadAuthUser, sign, type AuthUser, type TokenUser } from './auth'
import { ensureBaseData, needsSetup } from './bootstrap'
import { deleteUploads, ensureUploadDir, readUpload, saveDataUrl, UPLOAD_PATH_RE } from './uploads'
import { announce, initVapid, usersWithPerm, vapidPublicKey } from './notify'

// Segurança: em produção, segredos default são fatais (evita subir com chave conhecida).
if (process.env.NODE_ENV === 'production') {
  const weak: string[] = []
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-trocar-em-producao') weak.push('JWT_SECRET')
  if (!process.env.WEB_ORIGIN) weak.push('WEB_ORIGIN (CORS liberado para todos)')
  if (weak.length) throw new Error(`[boot] configure em produção: ${weak.join(', ')}`)
}

// bodyLimit: a foto sobe em base64 (≈ +33%) dentro do JSON.
const app = Fastify({ logger: false, bodyLimit: 22 * 1024 * 1024 })

const origins = (process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
await app.register(cors, { origin: origins.length ? origins : true })
await app.register(rateLimit, {
  global: true,
  max: 600,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'muitas requisições — aguarde um instante' }),
})

app.addHook('onSend', async (_req, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
  reply.header('Referrer-Policy', 'no-referrer')
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  return payload
})

// Erros conhecidos do Prisma viram 400/404/409 em vez de 500 vazando stack.
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return reply.code(409).send({ error: 'registro duplicado' })
    if (err.code === 'P2025') return reply.code(404).send({ error: 'não encontrado' })
    return reply.code(400).send({ error: 'requisição inválida' })
  }
  if ((err as any)?.statusCode === 429) return reply.code(429).send({ error: 'muitas requisições' })
  console.error('[erro]', err)
  reply.code(500).send({ error: 'erro interno' })
})

// ----------------------------- helpers de sessão -----------------------------

function token(req: any): TokenUser | null {
  const h = req.headers['authorization']
  if (!h || !h.startsWith('Bearer ')) return null
  return verifyToken(h.slice(7))
}

async function requireAuth(req: any, reply: any): Promise<AuthUser | null> {
  const t = token(req)
  if (!t) {
    reply.code(401).send({ error: 'não autenticado' })
    return null
  }
  const u = await loadAuthUser(t.sub)
  if (!u) {
    reply.code(401).send({ error: 'sessão inválida' })
    return null
  }
  return u
}

async function guard(req: any, reply: any, perm: string): Promise<AuthUser | null> {
  const u = await requireAuth(req, reply)
  if (!u) return null
  if (!u.perms.has(perm)) {
    reply.code(403).send({ error: 'sem permissão' })
    return null
  }
  return u
}

async function audit(u: AuthUser, action: string, entity: string, target: string, local?: string, detail?: string) {
  await prisma.auditLog.create({ data: { actorName: u.name, actorRole: u.roleName, action, entity, target, local, detail } })
}

const show = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v))
function diffDetail(before: any, patch: any, fields: { key: string; label: string; fmt?: (v: any) => string }[]): string {
  const parts: string[] = []
  for (const f of fields) {
    if (!(f.key in patch)) continue
    const fmt = f.fmt ?? show
    const a = fmt(before?.[f.key])
    const b = fmt(patch[f.key])
    if (a !== b) parts.push(`${f.label}: ${a} → ${b}`)
  }
  return parts.join('; ')
}

async function roleName(id?: string | null): Promise<string> {
  if (!id) return '—'
  return (await prisma.role.findUnique({ where: { id }, select: { name: true } }))?.name ?? id
}
async function scopeName(scope?: string | null): Promise<string> {
  if (!scope || scope === 'global') return 'Global (todos)'
  const ids = scope.split(',').filter(Boolean)
  const nomes = (await prisma.local.findMany({ where: { id: { in: ids } }, select: { name: true } })).map((l) => l.name)
  return nomes.join(', ') || scope
}
async function lastActiveAdmin(excludeId: string): Promise<boolean> {
  const others = await prisma.user.count({ where: { roleId: 'role-admin', status: 'ativo', id: { not: excludeId } } })
  return others === 0
}

// ----------------------------- rate-limit do login -----------------------------
// Três janelas: IP+email, só IP (password spraying) e só email (stuffing distribuído).
const WINDOW_MS = 60_000
const MAX_FAILS = 5
const MAX_FAILS_IP = 20
const MAX_FAILS_EMAIL = 10

function criarJanela() {
  const mapa = new Map<string, number[]>()
  function recentes(key: string): number[] {
    const now = Date.now()
    const arr = (mapa.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
    if (arr.length) mapa.set(key, arr)
    else mapa.delete(key)
    return arr
  }
  return {
    recentes,
    registrar: (key: string) => mapa.set(key, [...recentes(key), Date.now()]),
    limpar: (key: string) => mapa.delete(key),
    limpezaPeriodica: () => {
      const now = Date.now()
      for (const [k, times] of mapa) if (!times.some((t) => now - t < WINDOW_MS)) mapa.delete(k)
    },
  }
}
const loginFailsIpEmail = criarJanela()
const loginFailsIp = criarJanela()
const loginFailsEmail = criarJanela()
setInterval(() => {
  loginFailsIpEmail.limpezaPeriodica()
  loginFailsIp.limpezaPeriodica()
  loginFailsEmail.limpezaPeriodica()
}, 5 * 60_000).unref()

// ----------------------------- escopo por local -----------------------------
// scope = 'global' → vê tudo. Senão, lista de ids de locais separada por vírgula.
function scopeIds(u: AuthUser): string[] | null {
  if (!u.scope || u.scope === 'global') return null
  const ids = u.scope.split(',').map((s) => s.trim()).filter(Boolean)
  return ids.length ? ids : null
}
function outOfScope(u: AuthUser, localId: string | null | undefined, reply: any): boolean {
  const ids = scopeIds(u)
  if (ids && (!localId || !ids.includes(localId))) {
    reply.code(403).send({ error: 'fora do escopo' })
    return true
  }
  return false
}

// ----------------------------- settings / chamados helpers -----------------------------

async function getSetting(key: string, def = ''): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } })
  return s?.value ?? def
}

async function nextCode(prefix: string, pad: number, rows: { code: string }[]): Promise<string> {
  // Maior sufixo existente + 1. `count()+1` colidiria depois de uma exclusão.
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const r of rows) {
    const m = re.exec(r.code ?? '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(pad, '0')}`
}
const nextTicketCode = async () => nextCode('CH', 4, await prisma.ticket.findMany({ select: { code: true } }))
const nextLocalCode = async () => nextCode('LC', 3, await prisma.local.findMany({ select: { code: true } }))

interface TicketStatusDef { key: string; label: string; done?: boolean }
const DEFAULT_STATUSES: TicketStatusDef[] = [
  { key: 'aberto', label: 'Aberto' },
  { key: 'andamento', label: 'Em andamento' },
  { key: 'resolvido', label: 'Concluído', done: true },
]
async function ticketStatuses(): Promise<TicketStatusDef[]> {
  const raw = await getSetting('ticket_statuses', '')
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a } catch { /* usa default */ } }
  return DEFAULT_STATUSES
}
async function doneKeys(): Promise<Set<string>> {
  return new Set((await ticketStatuses()).filter((s) => s.done).map((s) => s.key))
}
const WEEK_MS = 7 * 24 * 3600 * 1000

function parsePhotos(s: any): string[] {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function cleanPhotos(arr: any): string[] {
  if (!Array.isArray(arr)) return []
  return arr.filter((x) => typeof x === 'string' && UPLOAD_PATH_RE.test(x)).slice(0, 8)
}
const droppedPhotos = (before: string[], after: string[]) => before.filter((p) => !after.includes(p))

// ----------------------------- atendimento técnico -----------------------------

interface Visita { id: string; data: string; inicio: string | null; fim: string | null; minutos: number; tecnicoId: string | null; tecnicoNome: string }
interface Item { id: string; descricao: string; quantidade: number; tipo: 'trocado' | 'comprado'; valor: number | null }

function parseJsonArray(s: any): any[] {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const minutosDoDia = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
const novoId = () => crypto.randomBytes(6).toString('hex')

/**
 * Limpa as idas ao local. Com início e saída, os minutos são CALCULADOS (saída antes
 * do início = passou da meia-noite). Sem os dois, vale o tempo informado à mão.
 * Quem registrou a ida não é trocado numa edição — uma ida nova é de quem está salvando.
 */
function cleanVisitas(arr: any, antes: Visita[], u: AuthUser): Visita[] | string {
  if (!Array.isArray(arr)) return 'visitas inválidas'
  const porId = new Map(antes.map((v) => [v.id, v]))
  const out: Visita[] = []
  for (const v of arr.slice(0, 30)) {
    const data = String(v?.data ?? '')
    if (!DATA_RE.test(data)) return 'informe a data de cada ida ao local'
    const inicio = v?.inicio && HORA_RE.test(String(v.inicio)) ? String(v.inicio) : null
    const fim = v?.fim && HORA_RE.test(String(v.fim)) ? String(v.fim) : null
    let minutos: number
    if (inicio && fim) {
      minutos = minutosDoDia(fim) - minutosDoDia(inicio)
      if (minutos <= 0) minutos += 24 * 60
    } else {
      minutos = Math.round(Number(v?.minutos))
      if (!Number.isFinite(minutos) || minutos <= 0) return 'informe hora de início e saída, ou o tempo no local'
    }
    if (minutos > 24 * 60) return 'uma ida ao local não pode passar de 24 horas'
    const existente = v?.id ? porId.get(String(v.id)) : undefined
    out.push({
      id: existente?.id ?? novoId(),
      data, inicio, fim, minutos,
      tecnicoId: existente ? existente.tecnicoId : u.sub,
      tecnicoNome: existente ? existente.tecnicoNome : u.name,
    })
  }
  return out
}

function cleanItens(arr: any): Item[] | string {
  if (!Array.isArray(arr)) return 'itens inválidos'
  const out: Item[] = []
  for (const i of arr.slice(0, 60)) {
    const descricao = String(i?.descricao ?? '').trim().slice(0, 200)
    if (!descricao) return 'informe a descrição de cada item'
    const quantidade = Number(i?.quantidade)
    if (!Number.isFinite(quantidade) || quantidade <= 0) return `quantidade inválida em "${descricao}"`
    const valor = i?.valor === '' || i?.valor == null ? null : Number(i.valor)
    if (valor != null && (!Number.isFinite(valor) || valor < 0)) return `valor inválido em "${descricao}"`
    out.push({ id: i?.id ? String(i.id).slice(0, 20) : novoId(), descricao, quantidade, tipo: i?.tipo === 'comprado' ? 'comprado' : 'trocado', valor })
  }
  return out
}

const minutosTotais = (t: any) => (parseJsonArray(t.visitas) as Visita[]).reduce((s, v) => s + (v.minutos || 0), 0)

async function shapeTickets(tickets: any[]) {
  const locais = Object.fromEntries((await prisma.local.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]))
  const counts = tickets.length
    ? await prisma.ticketComment.groupBy({ by: ['ticketId'], where: { ticketId: { in: tickets.map((t) => t.id) } }, _count: true })
    : []
  const byTicket = Object.fromEntries(counts.map((c: any) => [c.ticketId, c._count]))
  return tickets.map((t) => ({
    ...t,
    localName: t.localId ? locais[t.localId] : undefined,
    photos: parsePhotos(t.photos),
    donePhotos: parsePhotos(t.donePhotos),
    visitas: parseJsonArray(t.visitas),
    itens: parseJsonArray(t.itens),
    minutosTotais: minutosTotais(t),
    commentCount: byTicket[t.id] ?? 0,
  }))
}

// Quem é avisado sobre um chamado: quem abriu + o técnico que pegou.
function ticketAudience(t: any): string[] {
  return [t.createdById, t.assigneeId].filter(Boolean)
}

/**
 * Chamado é de quem abriu e do técnico que pegou. Ver o chamado dos OUTROS exige
 * `ver_todos_chamados` e o local no escopo.
 *
 * Não existe atribuição: o responsável é sempre quem pegou o chamado da fila.
 */
function canSeeTicket(u: AuthUser, t: any, ids: string[] | null): boolean {
  if (t.createdById === u.sub) return true
  if (t.assigneeId === u.sub) return true
  if (!u.perms.has('ver_todos_chamados')) return false
  if (!ids) return true
  if (t.localId && ids.includes(t.localId)) return true
  // Sem local e sem dono: fica visível para quem pode aceitar, senão a fila some.
  return !t.localId && !t.assigneeId && u.perms.has('aceitar_chamados')
}
const ticketUrl = (id: string) => `/chamados?t=${id}`

// ----------------------------- shapers -----------------------------

async function shapeUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, include: { grants: { select: { id: true } }, denies: { select: { id: true } } } })
  if (!u) return null
  const { passwordHash, grants, denies, ...safe } = u
  return { ...safe, grants: grants.map((g) => g.id), denies: denies.map((d) => d.id) }
}
const shapeRole = (r: any) => ({ id: r.id, name: r.name, color: r.color, system: r.system, permissions: (r.permissions ?? []).map((p: any) => p.id) })
const shapePermission = (p: any) => ({ id: p.id, label: p.label, module: p.module, system: p.system })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USER_STATUS = new Set(['ativo', 'inativo'])

// ----------------------------- setup inicial -----------------------------

app.get('/setup/status', async () => ({ needsSetup: await needsSetup() }))

app.post('/setup', async (req: any, reply) => {
  if (!(await needsSetup())) return reply.code(409).send({ error: 'o sistema já foi configurado' })
  const b = req.body ?? {}
  const name = String(b.name ?? '').trim()
  const email = String(b.email ?? '').trim().toLowerCase()
  const password = String(b.password ?? '')
  if (!name) return reply.code(400).send({ error: 'informe o nome' })
  if (!EMAIL_RE.test(email)) return reply.code(400).send({ error: 'e-mail inválido' })
  if (password.length < 8) return reply.code(400).send({ error: 'a senha precisa de ao menos 8 caracteres' })

  await ensureBaseData()
  if (!(await needsSetup())) return reply.code(409).send({ error: 'o sistema já foi configurado' })

  const user = await prisma.user.create({
    data: { name, email, roleId: 'role-admin', scope: 'global', status: 'ativo', passwordHash: bcrypt.hashSync(password, 10), lastAccess: new Date().toISOString() },
    include: { role: true },
  })
  await prisma.auditLog.create({
    data: { actorName: user.name, actorRole: user.role?.name ?? '—', action: 'criar', entity: 'usuario', target: user.name, detail: 'Administrador inicial criado na configuração do sistema' },
  })
  return { token: sign(user), user: await shapeUser(user.id) }
})

// ----------------------------- auth -----------------------------

app.post('/auth/login', async (req: any, reply) => {
  const { email, password } = req.body ?? {}
  const emailKey = String(email ?? '').trim().toLowerCase()
  const key = `${req.ip}:${emailKey}`
  if (
    loginFailsIpEmail.recentes(key).length >= MAX_FAILS ||
    loginFailsIp.recentes(req.ip).length >= MAX_FAILS_IP ||
    loginFailsEmail.recentes(emailKey).length >= MAX_FAILS_EMAIL
  ) {
    return reply.code(429).send({ error: 'muitas tentativas — aguarde um minuto e tente de novo' })
  }
  const registrarFalha = () => {
    loginFailsIpEmail.registrar(key)
    loginFailsIp.registrar(req.ip)
    loginFailsEmail.registrar(emailKey)
  }
  const user = await prisma.user.findUnique({ where: { email: emailKey }, include: { role: true } })
  if (!user || !user.passwordHash || user.status !== 'ativo' || !bcrypt.compareSync(String(password ?? ''), user.passwordHash)) {
    registrarFalha()
    return reply.code(401).send({ error: 'credenciais inválidas' })
  }
  loginFailsIpEmail.limpar(key)
  await prisma.user.update({ where: { id: user.id }, data: { lastAccess: new Date().toISOString() } })
  await prisma.auditLog.create({
    data: { actorName: user.name, actorRole: user.role?.name ?? '—', action: 'login', entity: 'sessao', target: user.name, detail: 'Login' },
  })
  return { token: sign(user), user: await shapeUser(user.id) }
})

app.get('/auth/me', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  return shapeUser(u.sub)
})

app.post('/auth/change-password', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const full = await prisma.user.findUnique({ where: { id: u.sub } })
  if (!full) return reply.code(404).send()
  const b = req.body ?? {}
  const newPass = String(b.newPassword ?? '')
  if (newPass.length < 6) return reply.code(400).send({ error: 'senha muito curta (mínimo 6 caracteres)' })
  if (!full.mustChangePassword && !bcrypt.compareSync(String(b.currentPassword ?? ''), full.passwordHash)) {
    return reply.code(400).send({ error: 'senha atual incorreta' })
  }
  await prisma.user.update({ where: { id: full.id }, data: { passwordHash: bcrypt.hashSync(newPass, 10), mustChangePassword: false } })
  await audit(u, 'editar', 'usuario', full.name, undefined, 'Senha alterada pelo próprio usuário')
  return shapeUser(full.id)
})

app.patch('/auth/profile', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const b = req.body ?? {}
  const data: any = {}
  if ('name' in b) {
    const n = String(b.name ?? '').trim()
    if (!n) return reply.code(400).send({ error: 'informe o nome' })
    data.name = n
  }
  if ('phone' in b) data.phone = b.phone ? String(b.phone) : null
  if ('avatar' in b) {
    const av = b.avatar == null || b.avatar === '' ? null : String(b.avatar)
    if (av && !UPLOAD_PATH_RE.test(av)) return reply.code(400).send({ error: 'imagem inválida' })
    const before = await prisma.user.findUnique({ where: { id: u.sub }, select: { avatar: true } })
    data.avatar = av
    if (before?.avatar && before.avatar !== av) deleteUploads([before.avatar]).catch(() => {})
  }
  if (b.email != null) {
    const e = String(b.email).trim().toLowerCase()
    if (!EMAIL_RE.test(e)) return reply.code(400).send({ error: 'e-mail inválido' })
    data.email = e
  }
  const user = await prisma.user.update({ where: { id: u.sub }, data })
  await audit(u, 'editar', 'usuario', user.name, undefined, 'Perfil atualizado')
  return shapeUser(user.id)
})

// ----------------------------- uploads (imagens) -----------------------------

app.post('/uploads', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const url = await saveDataUrl(req.body?.dataUrl)
  if (!url) return reply.code(400).send({ error: 'imagem inválida ou muito grande (máx. 15 MB)' })
  return { url }
})

// Público de propósito: <img> não envia Authorization. O nome aleatório é o segredo.
app.get('/uploads/:name', async (req: any, reply) => {
  const file = await readUpload(String(req.params.name))
  if (!file) return reply.code(404).send({ error: 'não encontrado' })
  reply.header('Content-Type', file.mime)
  reply.header('Cache-Control', 'public, max-age=31536000, immutable')
  return reply.send(file.body)
})

// ----------------------------- locais -----------------------------

const LOCAL_FIELDS = ['code', 'name', 'city', 'address', 'phone', 'note'] as const

app.get('/locais', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  // Quem abre chamado precisa escolher o local, mesmo sem a tela de Locais.
  if (!u.perms.has('ver_locais') && !u.perms.has('criar_chamados')) return reply.code(403).send({ error: 'sem permissão' })
  const ids = scopeIds(u)
  const locais = await prisma.local.findMany({ where: ids ? { id: { in: ids } } : {}, orderBy: { name: 'asc' } })
  const counts = await prisma.ticket.groupBy({ by: ['localId'], where: { archivedAt: null }, _count: true })
  const porLocal = Object.fromEntries(counts.map((c: any) => [c.localId, c._count]))
  return locais.map((l) => ({ ...l, ticketCount: porLocal[l.id] ?? 0 }))
})

app.post('/locais', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_locais')
  if (!u) return
  if (scopeIds(u)) return reply.code(403).send({ error: 'usuário restrito a locais não cria locais' })
  const b = req.body ?? {}
  const name = String(b.name ?? '').trim()
  if (!name) return reply.code(400).send({ error: 'informe o nome do local' })
  const data: any = { code: String(b.code ?? '').trim() || (await nextLocalCode()), name }
  for (const k of ['city', 'address', 'phone', 'note'] as const) if (k in b) data[k] = String(b[k] ?? '')
  const l = await prisma.local.create({ data })
  await audit(u, 'criar', 'local', l.name, l.name, l.city || undefined)
  return l
})

app.patch('/locais/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_locais')
  if (!u) return
  if (outOfScope(u, req.params.id, reply)) return
  const before = await prisma.local.findUnique({ where: { id: req.params.id } })
  if (!before) return reply.code(404).send()
  const b = req.body ?? {}
  const data: any = {}
  for (const k of LOCAL_FIELDS) if (k in b) data[k] = String(b[k] ?? '')
  if ('name' in data && !data.name.trim()) return reply.code(400).send({ error: 'informe o nome do local' })
  const l = await prisma.local.update({ where: { id: req.params.id }, data })
  const detail = diffDetail(before, b, [
    { key: 'name', label: 'Nome' }, { key: 'code', label: 'Código' }, { key: 'city', label: 'Cidade' },
    { key: 'address', label: 'Endereço' }, { key: 'phone', label: 'Telefone' },
  ])
  await audit(u, 'editar', 'local', l.name, l.name, detail || undefined)
  return l
})

app.delete('/locais/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'excluir_locais')
  if (!u) return
  if (outOfScope(u, req.params.id, reply)) return
  // Os chamados do local continuam existindo (localId vira nulo pela relação).
  const l = await prisma.local.delete({ where: { id: req.params.id } })
  await audit(u, 'excluir', 'local', l.name, l.name)
  return { ok: true }
})

// ----------------------------- usuários -----------------------------

app.get('/users', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  if (!u.perms.has('ver_usuarios')) return reply.code(403).send({ error: 'sem permissão' })
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' }, include: { grants: { select: { id: true } }, denies: { select: { id: true } } } })
  return users.map(({ passwordHash, grants, denies, ...x }) => ({ ...x, grants: grants.map((g) => g.id), denies: denies.map((d) => d.id) }))
})

app.post('/users', async (req: any, reply) => {
  const u = await guard(req, reply, 'criar_usuarios')
  if (!u) return
  const b = req.body ?? {}
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!b.name || !email) return reply.code(400).send({ error: 'nome e e-mail são obrigatórios' })
  if (!EMAIL_RE.test(email)) return reply.code(400).send({ error: 'e-mail inválido' })
  if (b.status && !USER_STATUS.has(b.status)) return reply.code(400).send({ error: 'status inválido' })
  // Sem senha informada, gera uma temporária e devolve UMA vez para quem cadastrou.
  const tempPassword = b.password ? null : crypto.randomBytes(6).toString('base64url')
  const created = await prisma.user.create({
    data: {
      name: String(b.name).trim(), email, roleId: b.roleId ?? 'role-operador', scope: b.scope || 'global',
      status: b.status ?? 'ativo', passwordHash: bcrypt.hashSync(String(b.password ?? tempPassword), 10),
      mustChangePassword: true, phone: b.phone ?? null,
      grants: { connect: (b.grants ?? []).map((id: string) => ({ id })) },
      denies: { connect: (b.denies ?? []).map((id: string) => ({ id })) },
    },
  })
  await audit(u, 'criar', 'usuario', created.name, undefined, tempPassword ? 'Senha temporária gerada' : undefined)
  return { ...(await shapeUser(created.id)), tempPassword }
})

app.patch('/users/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'editar_usuarios')
  if (!u) return
  const before = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!before) return reply.code(404).send()
  const b = req.body ?? {}
  if (b.email != null && !EMAIL_RE.test(String(b.email))) return reply.code(400).send({ error: 'e-mail inválido' })
  if (b.status != null && !USER_STATUS.has(b.status)) return reply.code(400).send({ error: 'status inválido' })
  if (b.status === 'inativo' && before.status === 'ativo' && !u.perms.has('desativar_usuarios')) {
    return reply.code(403).send({ error: 'sem permissão para desativar usuários' })
  }
  const losesAdmin =
    (b.roleId && b.roleId !== before.roleId && before.roleId === 'role-admin') ||
    (b.status && b.status !== 'ativo' && before.status === 'ativo' && before.roleId === 'role-admin')
  if (losesAdmin && (await lastActiveAdmin(before.id))) {
    return reply.code(400).send({ error: 'não é possível rebaixar/desativar o último administrador ativo' })
  }
  const data: any = {}
  for (const k of ['name', 'roleId', 'scope', 'status', 'phone']) if (k in b) data[k] = b[k]
  if (b.email != null) data.email = String(b.email).trim().toLowerCase()
  if (b.password) { data.passwordHash = bcrypt.hashSync(String(b.password), 10); data.mustChangePassword = true }
  if (Array.isArray(b.grants)) data.grants = { set: b.grants.map((id: string) => ({ id })) }
  if (Array.isArray(b.denies)) data.denies = { set: b.denies.map((id: string) => ({ id })) }
  const updated = await prisma.user.update({ where: { id: req.params.id }, data })

  const changes: string[] = []
  if (b.roleId && b.roleId !== before.roleId) changes.push(`Papel: ${await roleName(before.roleId)} → ${await roleName(b.roleId)}`)
  if (b.status && b.status !== before.status) changes.push(`Status: ${before.status} → ${b.status}`)
  if ('scope' in b && b.scope !== before.scope) changes.push(`Escopo: ${await scopeName(before.scope)} → ${await scopeName(b.scope)}`)
  if (b.name && b.name !== before.name) changes.push(`Nome: ${before.name} → ${b.name}`)
  if (data.email && data.email !== before.email) changes.push(`E-mail: ${before.email} → ${data.email}`)
  if (b.password) changes.push('Senha redefinida')
  if (Array.isArray(b.grants) || Array.isArray(b.denies)) changes.push('Exceções de permissão alteradas')
  await audit(u, 'editar', 'usuario', updated.name, undefined, changes.join('; ') || undefined)
  return shapeUser(updated.id)
})

app.delete('/users/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'editar_usuarios')
  if (!u) return
  if (req.params.id === u.sub) return reply.code(400).send({ error: 'não é possível excluir a si mesmo' })
  const target = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!target) return reply.code(404).send()
  if (target.roleId === 'role-admin' && target.status === 'ativo' && (await lastActiveAdmin(target.id))) {
    return reply.code(400).send({ error: 'não é possível excluir o último administrador ativo' })
  }
  const deleted = await prisma.user.delete({ where: { id: req.params.id } })
  if (deleted.avatar) deleteUploads([deleted.avatar]).catch(() => {})
  await audit(u, 'excluir', 'usuario', deleted.name)
  return { ok: true }
})

// ----------------------------- papéis e permissões -----------------------------

app.get('/roles', async (req: any, reply) => {
  const auth = await requireAuth(req, reply)
  if (!auth) return
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' }, include: { permissions: { select: { id: true } } } })
  return roles.map(shapeRole)
})

app.post('/roles', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_papeis')
  if (!u) return
  const b = req.body ?? {}
  if (!b.name) return reply.code(400).send({ error: 'nome é obrigatório' })
  const role = await prisma.role.create({
    data: { name: b.name, color: b.color ?? '#a1a1aa', permissions: { connect: (b.permissions ?? []).map((id: string) => ({ id })) } },
    include: { permissions: { select: { id: true } } },
  })
  await audit(u, 'criar', 'usuario', role.name, undefined, 'Novo papel')
  return shapeRole(role)
})

app.patch('/roles/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_papeis')
  if (!u) return
  const target = await prisma.role.findUnique({ where: { id: req.params.id } })
  if (!target) return reply.code(404).send()
  if (target.system) return reply.code(400).send({ error: 'papel de sistema não é editável' })
  const b = req.body ?? {}
  const data: any = {}
  if (b.name != null) data.name = b.name
  if (b.color != null) data.color = b.color
  if (Array.isArray(b.permissions)) data.permissions = { set: b.permissions.map((id: string) => ({ id })) }
  const role = await prisma.role.update({ where: { id: req.params.id }, data, include: { permissions: { select: { id: true } } } })
  await audit(u, 'editar', 'usuario', role.name, undefined, 'Papel')
  return shapeRole(role)
})

app.delete('/roles/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_papeis')
  if (!u) return
  const role = await prisma.role.findUnique({ where: { id: req.params.id } })
  if (!role) return reply.code(404).send()
  if (role.system) return reply.code(400).send({ error: 'papel de sistema não pode ser removido' })
  await prisma.user.updateMany({ where: { roleId: role.id }, data: { roleId: 'role-operador' } })
  await prisma.role.delete({ where: { id: role.id } })
  await audit(u, 'excluir', 'usuario', role.name, undefined, 'Papel removido')
  return { ok: true }
})

app.get('/permissions', async (req: any, reply) => {
  const auth = await requireAuth(req, reply)
  if (!auth) return
  const perms = await prisma.permission.findMany({ orderBy: { module: 'asc' } })
  return perms.map(shapePermission)
})

// ----------------------------- auditoria -----------------------------

app.get('/audit', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_auditoria')
  if (!u) return
  const asked = Number(req.query?.limit)
  const take = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 500) : 100
  return prisma.auditLog.findMany({ orderBy: { ts: 'desc' }, take })
})

// ----------------------------- chamados -----------------------------

const archivedPred = (done: Set<string>, cutoff: number) => (t: any) =>
  !!t.archivedAt || (t.resolvedAt && done.has(t.status) && new Date(t.resolvedAt).getTime() < cutoff)

app.get('/tickets', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_chamados')
  if (!u) return
  const ids = scopeIds(u)
  const history = req.query?.history === '1' || req.query?.history === 'true'
  const archived = archivedPred(await doneKeys(), Date.now() - WEEK_MS)
  const all = await prisma.ticket.findMany({ orderBy: { createdAt: 'desc' } })
  const tickets = all.filter((t) => canSeeTicket(u, t, ids) && (history ? archived(t) : !archived(t)))
  return shapeTickets(tickets)
})

app.post('/tickets', async (req: any, reply) => {
  const u = await guard(req, reply, 'criar_chamados')
  if (!u) return
  const b = req.body ?? {}
  const title = String(b.title ?? '').trim()
  if (!title) return reply.code(400).send({ error: 'título é obrigatório' })
  if (b.localId && outOfScope(u, b.localId, reply)) return
  if (b.photos?.length && !u.perms.has('anexar_fotos_chamado')) return reply.code(403).send({ error: 'sem permissão para anexar fotos' })

  const statuses = await ticketStatuses()
  // Chamado nasce na coluna de entrada. Só quem move chamados escolhe outra — e nunca a
  // de conclusão, que exige a solução preenchida no atendimento.
  const done0 = await doneKeys()
  const status = u.perms.has('gerenciar_chamados') && statuses.some((s) => s.key === b.status && !done0.has(s.key)) ? b.status : statuses[0].key
  const t = await prisma.ticket.create({
    data: {
      code: await nextTicketCode(), title, description: b.description ? String(b.description) : null,
      solicitante: b.solicitante ? String(b.solicitante).trim().slice(0, 200) || null : null,
      status, origin: b.registroId ? 'registro' : 'manual',
      localId: b.localId || null,
      createdById: u.sub, createdByName: u.name,
      photos: JSON.stringify(cleanPhotos(b.photos)),
    },
  })
  // Chamado aberto a partir de um registro: o registro passa a apontar para ele.
  if (b.registroId) {
    await prisma.registro.updateMany({ where: { id: String(b.registroId), ticketId: null }, data: { ticketId: t.id } })
  }
  const localName = t.localId ? (await prisma.local.findUnique({ where: { id: t.localId }, select: { name: true } }))?.name : undefined
  await audit(u, 'criar', 'chamado', t.title, localName, t.code)
  // Chamado novo sempre entra na fila: avisa os técnicos que podem pegá-lo.
  const aud = await usersWithPerm('aceitar_chamados', t.localId)
  await announce(aud.filter((id) => id !== u.sub), { kind: 'ticket', title: `Novo chamado ${t.code}`, body: t.title, url: ticketUrl(t.id) }, { push: true })
  return (await shapeTickets([t]))[0]
})

app.patch('/tickets/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_chamados')
  if (!u) return
  const before = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!before) return reply.code(404).send()
  if (!canSeeTicket(u, before, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  const b = req.body ?? {}
  const done = await doneKeys()
  if (b.status && b.status !== before.status) {
    if (!(await ticketStatuses()).some((s) => s.key === b.status)) return reply.code(400).send({ error: 'status inválido' })
    if (done.has(b.status) && !done.has(before.status) && !u.perms.has('concluir_chamados')) {
      return reply.code(403).send({ error: 'sem permissão para concluir chamados' })
    }
    // Chamado não fecha sem dizer o que resolveu — é o que o relatório e a próxima
    // visita ao mesmo local vão precisar ler.
    if (done.has(b.status) && !done.has(before.status) && !String(before.solucao ?? '').trim()) {
      return reply.code(400).send({ error: 'preencha a solução no atendimento técnico antes de concluir' })
    }
    if (!done.has(b.status) && done.has(before.status) && !u.perms.has('reabrir_chamados')) {
      return reply.code(403).send({ error: 'sem permissão para reabrir chamados' })
    }
  }
  if (('photos' in b || 'donePhotos' in b) && !u.perms.has('anexar_fotos_chamado')) {
    return reply.code(403).send({ error: 'sem permissão para anexar fotos' })
  }
  // Responsável não se define aqui: só o técnico pegando o chamado (/accept).
  if ('assigneeId' in b) return reply.code(400).send({ error: 'o responsável é quem pega o chamado — não dá para atribuir' })
  if ('localId' in b && b.localId && b.localId !== before.localId && outOfScope(u, b.localId, reply)) return

  const data: any = {}
  if ('title' in b) {
    const title = String(b.title ?? '').trim()
    if (!title) return reply.code(400).send({ error: 'título é obrigatório' })
    data.title = title
  }
  if ('description' in b) data.description = b.description ? String(b.description) : null
  if ('solicitante' in b) data.solicitante = b.solicitante ? String(b.solicitante).trim().slice(0, 200) || null : null
  if ('status' in b) data.status = b.status
  if ('localId' in b) data.localId = b.localId || null
  const orphans: string[] = []
  if ('photos' in b) {
    const next = cleanPhotos(b.photos)
    orphans.push(...droppedPhotos(parsePhotos(before.photos), next))
    data.photos = JSON.stringify(next)
  }
  if ('donePhotos' in b) {
    const next = cleanPhotos(b.donePhotos)
    orphans.push(...droppedPhotos(parsePhotos(before.donePhotos), next))
    data.donePhotos = JSON.stringify(next)
  }
  const statusChanged = 'status' in data && data.status !== before.status
  if (statusChanged) {
    const wasDone = done.has(before.status)
    const isDone = done.has(data.status)
    if (isDone && !wasDone) data.resolvedAt = new Date()
    else if (!isDone && wasDone) { data.resolvedAt = null; data.archivedAt = null }
  }
  const t = await prisma.ticket.update({ where: { id: req.params.id }, data })
  if (orphans.length) deleteUploads(orphans).catch(() => {})

  const stLabel = Object.fromEntries((await ticketStatuses()).map((s) => [s.key, s.label]))
  const diff = diffDetail(before, data, [
    { key: 'status', label: 'Status', fmt: (v: any) => stLabel[v] ?? v },
    { key: 'title', label: 'Título' },
  ])
  await audit(u, 'editar', 'chamado', t.title, undefined, [t.code, diff].filter(Boolean).join(' · '))

  if (statusChanged) {
    const titulo = `Chamado ${t.code} · ${stLabel[t.status] ?? t.status}`
    await announce(ticketAudience(t).filter((id) => id !== u.sub), { kind: 'ticket', title: titulo, body: t.title, url: ticketUrl(t.id) }, { push: true })
  }
  return (await shapeTickets([t]))[0]
})

// Finalizar: manda o chamado concluído para o histórico agora, sem esperar a semana.
app.post('/tickets/:id/archive', async (req: any, reply) => {
  const u = await guard(req, reply, 'concluir_chamados')
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  if (!(await doneKeys()).has(t.status)) {
    return reply.code(400).send({ error: 'só chamado concluído pode ser finalizado — mova para a coluna de conclusão primeiro' })
  }
  const atualizado = await prisma.ticket.update({ where: { id: t.id }, data: { archivedAt: new Date(), resolvedAt: t.resolvedAt ?? new Date() } })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · finalizado e enviado ao histórico`)
  return (await shapeTickets([atualizado]))[0]
})

app.post('/tickets/:id/accept', async (req: any, reply) => {
  const u = await guard(req, reply, 'aceitar_chamados')
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  if (t.assigneeId) return reply.code(400).send({ error: `${t.assigneeName ?? 'outro técnico'} já pegou este chamado` })
  // Pegar o chamado que está na coluna de entrada já o põe "em atendimento" (a próxima
  // coluna que não é de conclusão) — é o que o técnico faria logo em seguida.
  const statuses = await ticketStatuses()
  const data: any = { assigneeId: u.sub, assigneeName: u.name }
  if (t.status === statuses[0]?.key) {
    const proxima = statuses.slice(1).find((s) => !s.done)
    if (proxima) data.status = proxima.key
  }
  const updated = await prisma.ticket.update({ where: { id: t.id }, data })
  await audit(u, 'editar', 'chamado', updated.title, undefined, `${updated.code} · pego por ${u.name}`)
  if (t.createdById && t.createdById !== u.sub) {
    await announce([t.createdById], { kind: 'ticket', title: `Chamado ${updated.code} em atendimento`, body: `${u.name} pegou: ${updated.title}`, url: ticketUrl(t.id) }, { push: true })
  }
  return (await shapeTickets([updated]))[0]
})

/**
 * DEVOLVER À FILA: o técnico que pegou (ou quem corrige atendimentos — administrador e
 * gestor) solta o chamado para outro técnico pegar. Como não existe atribuição, é o
 * único jeito de tirar um chamado de quem não vai conseguir atendê-lo. O atendimento
 * já registrado (horas, itens) continua no chamado.
 */
app.post('/tickets/:id/release', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  if (!t.assigneeId) return reply.code(400).send({ error: 'o chamado já está na fila' })
  if (t.assigneeId !== u.sub && !u.perms.has('corrigir_atendimento')) return reply.code(403).send({ error: 'só quem pegou pode devolver o chamado' })
  const statuses = await ticketStatuses()
  if (statuses.some((s) => s.done && s.key === t.status)) return reply.code(400).send({ error: 'chamado concluído não volta para a fila' })
  const updated = await prisma.ticket.update({ where: { id: t.id }, data: { assigneeId: null, assigneeName: null, status: statuses[0].key } })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · devolvido à fila (estava com ${t.assigneeName ?? '—'})`)
  const aud = [...(await usersWithPerm('aceitar_chamados', t.localId)), t.createdById, t.assigneeId].filter((id): id is string => !!id && id !== u.sub)
  await announce(aud, { kind: 'ticket', title: `Chamado ${t.code} voltou para a fila`, body: t.title, url: ticketUrl(t.id) }, { push: true })
  return (await shapeTickets([updated]))[0]
})

/**
 * ATENDIMENTO TÉCNICO: análise, solução, ações, idas ao local (horas), itens e fotos
 * finais. Quem preenche é o responsável pelo chamado; quem pode editar e mover
 * com `corrigir_atendimento` (administrador e gestor) também corrige.
 */
app.patch('/tickets/:id/atendimento', async (req: any, reply) => {
  const u = await guard(req, reply, 'registrar_atendimento')
  if (!u) return
  const before = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!before) return reply.code(404).send()
  if (!canSeeTicket(u, before, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  if (before.assigneeId !== u.sub && !u.perms.has('corrigir_atendimento')) {
    return reply.code(403).send({ error: before.assigneeId ? 'só o responsável preenche o atendimento' : 'pegue o chamado antes de registrar o atendimento' })
  }
  const b = req.body ?? {}
  const data: any = {}
  const texto = (v: any) => (v ? String(v).trim().slice(0, 8000) || null : null)
  for (const k of ['analise', 'possivelSolucao', 'solucao', 'acoesTomadas'] as const) if (k in b) data[k] = texto(b[k])
  if ((await doneKeys()).has(before.status) && 'solucao' in data && !data.solucao) {
    return reply.code(400).send({ error: 'chamado concluído precisa manter a solução preenchida' })
  }
  if ('visitas' in b) {
    const v = cleanVisitas(b.visitas, parseJsonArray(before.visitas), u)
    if (typeof v === 'string') return reply.code(400).send({ error: v })
    data.visitas = JSON.stringify(v)
  }
  if ('itens' in b) {
    const i = cleanItens(b.itens)
    if (typeof i === 'string') return reply.code(400).send({ error: i })
    data.itens = JSON.stringify(i)
  }
  const orphans: string[] = []
  if ('donePhotos' in b) {
    if (!u.perms.has('anexar_fotos_chamado')) return reply.code(403).send({ error: 'sem permissão para anexar fotos' })
    const next = cleanPhotos(b.donePhotos)
    orphans.push(...droppedPhotos(parsePhotos(before.donePhotos), next))
    data.donePhotos = JSON.stringify(next)
  }
  const t = await prisma.ticket.update({ where: { id: before.id }, data })
  if (orphans.length) deleteUploads(orphans).catch(() => {})
  const mins = minutosTotais(t)
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · atendimento técnico atualizado${mins ? ` (${Math.round((mins / 60) * 10) / 10} h no total)` : ''}`)
  return (await shapeTickets([t]))[0]
})

app.delete('/tickets/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'excluir_chamados')
  if (!u) return
  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!existing) return reply.code(404).send()
  if (!canSeeTicket(u, existing, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  const t = await prisma.ticket.delete({ where: { id: req.params.id } })
  deleteUploads([...parsePhotos(t.photos), ...parsePhotos(t.donePhotos)]).catch(() => {})
  await audit(u, 'excluir', 'chamado', t.title, undefined, t.code)
  return { ok: true }
})

app.get('/tickets/:id/comments', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_chamados')
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  return prisma.ticketComment.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: 'asc' } })
})

app.post('/tickets/:id/comments', async (req: any, reply) => {
  const u = await guard(req, reply, 'comentar_chamados')
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  const body = String(req.body?.body ?? '').trim()
  if (!body) return reply.code(400).send({ error: 'comentário vazio' })
  const c = await prisma.ticketComment.create({ data: { ticketId: t.id, authorId: u.sub, authorName: u.name, body: body.slice(0, 4000) } })
  // Comentário mexe no "atualizado em" do chamado — é o que ordena os recentes.
  await prisma.ticket.update({ where: { id: t.id }, data: { updatedAt: new Date() } })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · comentário`)
  const aud = (await ticketAudience(t)).filter((id) => id !== u.sub)
  await announce(aud, { kind: 'ticket', title: `Comentário em ${t.code}`, body: body.slice(0, 120), url: ticketUrl(t.id) }, { push: true })
  return c
})

app.delete('/comments/:id', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const c = await prisma.ticketComment.findUnique({ where: { id: req.params.id } })
  if (!c) return reply.code(404).send()
  if (c.authorId !== u.sub && !u.perms.has('gerenciar_chamados')) return reply.code(403).send({ error: 'sem permissão' })
  await prisma.ticketComment.delete({ where: { id: req.params.id } })
  const t = await prisma.ticket.findUnique({ where: { id: c.ticketId }, select: { code: true, title: true } })
  await audit(u, 'excluir', 'chamado', t?.title ?? c.ticketId, undefined, `${t?.code ?? ''} · comentário de ${c.authorName} apagado`.trim())
  return { ok: true }
})

// ----------------------------- registros (linha do tempo) -----------------------------

const TIPOS_REGISTRO = new Set(['ocorrencia', 'solicitacao', 'informacao'])

function canSeeRegistro(u: AuthUser, r: any, ids: string[] | null) {
  if (!ids) return true
  return r.autorId === u.sub || (!!r.localId && ids.includes(r.localId))
}
const podeMexerRegistro = (u: AuthUser, r: any) => r.autorId === u.sub || u.perms.has('excluir_registros')

async function shapeRegistros(rs: any[]) {
  const locais = Object.fromEntries((await prisma.local.findMany({ select: { id: true, name: true } })).map((l) => [l.id, l.name]))
  const tickets = rs.some((r) => r.ticketId)
    ? Object.fromEntries((await prisma.ticket.findMany({ where: { id: { in: rs.map((r) => r.ticketId).filter(Boolean) } }, select: { id: true, code: true } })).map((t) => [t.id, t.code]))
    : {}
  return rs.map((r) => ({ ...r, localName: r.localId ? locais[r.localId] : undefined, ticketCode: r.ticketId ? tickets[r.ticketId] : undefined }))
}

function lerRegistro(b: any): { data: any } | { erro: string } {
  const data: any = {}
  if ('descricao' in b) {
    const d = String(b.descricao ?? '').trim()
    if (!d) return { erro: 'descreva o que aconteceu ou o que foi solicitado' }
    data.descricao = d.slice(0, 4000)
  }
  if ('tipo' in b) {
    if (!TIPOS_REGISTRO.has(b.tipo)) return { erro: 'tipo inválido' }
    data.tipo = b.tipo
  }
  if ('solicitante' in b) data.solicitante = b.solicitante ? String(b.solicitante).trim().slice(0, 200) || null : null
  if ('localId' in b) data.localId = b.localId || null
  if ('ocorridoEm' in b && b.ocorridoEm) {
    const d = new Date(b.ocorridoEm)
    if (Number.isNaN(d.getTime())) return { erro: 'data/hora inválida' }
    if (d.getTime() > Date.now() + 5 * 60_000) return { erro: 'a data/hora não pode estar no futuro' }
    data.ocorridoEm = d
  }
  return { data }
}

app.get('/registros', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_registros')
  if (!u) return
  const ids = scopeIds(u)
  const q = req.query ?? {}
  // Período padrão: últimos 30 dias.
  const ate = q.ate ? new Date(String(q.ate)) : new Date()
  const de = q.de ? new Date(String(q.de)) : new Date(ate.getTime() - 30 * DIA_MS)
  if (Number.isNaN(ate.getTime()) || Number.isNaN(de.getTime())) return reply.code(400).send({ error: 'período inválido' })
  const where: any = { ocorridoEm: { gte: de, lte: ate } }
  if (q.localId) where.localId = String(q.localId)
  if (q.tipo && TIPOS_REGISTRO.has(q.tipo)) where.tipo = q.tipo
  const rs = await prisma.registro.findMany({ where, orderBy: { ocorridoEm: 'desc' }, take: 1000 })
  return shapeRegistros(rs.filter((r) => canSeeRegistro(u, r, ids)))
})

app.post('/registros', async (req: any, reply) => {
  const u = await guard(req, reply, 'criar_registros')
  if (!u) return
  const b = req.body ?? {}
  if (!('descricao' in b)) return reply.code(400).send({ error: 'descreva o que aconteceu ou o que foi solicitado' })
  const lido = lerRegistro(b)
  if ('erro' in lido) return reply.code(400).send({ error: lido.erro })
  if (lido.data.localId && outOfScope(u, lido.data.localId, reply)) return
  const r = await prisma.registro.create({ data: { tipo: 'ocorrencia', ...lido.data, autorId: u.sub, autorName: u.name } })
  await audit(u, 'criar', 'registro', r.descricao.slice(0, 80), undefined, r.tipo)
  return (await shapeRegistros([r]))[0]
})

app.patch('/registros/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'criar_registros')
  if (!u) return
  const before = await prisma.registro.findUnique({ where: { id: req.params.id } })
  if (!before) return reply.code(404).send()
  if (!canSeeRegistro(u, before, scopeIds(u)) || !podeMexerRegistro(u, before)) return reply.code(403).send({ error: 'só quem registrou pode editar' })
  const lido = lerRegistro(req.body ?? {})
  if ('erro' in lido) return reply.code(400).send({ error: lido.erro })
  if (lido.data.localId && lido.data.localId !== before.localId && outOfScope(u, lido.data.localId, reply)) return
  const r = await prisma.registro.update({ where: { id: before.id }, data: lido.data })
  await audit(u, 'editar', 'registro', r.descricao.slice(0, 80))
  return (await shapeRegistros([r]))[0]
})

app.delete('/registros/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_registros')
  if (!u) return
  const r = await prisma.registro.findUnique({ where: { id: req.params.id } })
  if (!r) return reply.code(404).send()
  if (!canSeeRegistro(u, r, scopeIds(u)) || !podeMexerRegistro(u, r)) return reply.code(403).send({ error: 'sem permissão para excluir este registro' })
  await prisma.registro.delete({ where: { id: r.id } })
  await audit(u, 'excluir', 'registro', r.descricao.slice(0, 80), undefined, `registrado por ${r.autorName}`)
  return { ok: true }
})

// ----------------------------- dashboard -----------------------------

const DIA_MS = 24 * 3600 * 1000
const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const rotuloDia = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

app.get('/stats/overview', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_dashboard')
  if (!u) return
  const ids = scopeIds(u)
  const statuses = await ticketStatuses()
  const done = new Set(statuses.filter((s) => s.done).map((s) => s.key))
  const archived = archivedPred(done, Date.now() - WEEK_MS)
  // Sem `ver_chamados` o dashboard fica só com zeros — não vaza chamado de ninguém.
  const todos = u.perms.has('ver_chamados') ? (await prisma.ticket.findMany()).filter((t) => canSeeTicket(u, t, ids)) : []
  const agora = Date.now()
  const ativos = todos.filter((t) => !archived(t))
  const abertos = ativos.filter((t) => !done.has(t.status))
  const meus = (t: any) => t.assigneeId === u.sub

  // Série dos últimos 14 dias: quantos abriram e quantos concluíram em cada dia.
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dias = Array.from({ length: 14 }, (_, i) => new Date(hoje.getTime() - (13 - i) * DIA_MS))
  const serie = dias.map((d) => ({ chave: chaveDia(d), dia: rotuloDia(d), abertos: 0, concluidos: 0 }))
  const idx = Object.fromEntries(serie.map((s, i) => [s.chave, i]))
  for (const t of todos) {
    const a = idx[chaveDia(new Date(t.createdAt))]
    if (a !== undefined) serie[a].abertos++
    if (t.resolvedAt) {
      const c = idx[chaveDia(new Date(t.resolvedAt))]
      if (c !== undefined) serie[c].concluidos++
    }
  }

  // Fila: em aberto e sem técnico, do que espera há mais tempo para o mais novo.
  const naFila = abertos.filter((t) => !t.assigneeId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return {
    ativos: ativos.length,
    emAberto: abertos.length,
    naFila: naFila.length,
    emAtendimento: abertos.filter((t) => !!t.assigneeId).length,
    meus: abertos.filter(meus).length,
    concluidos7d: todos.filter((t) => t.resolvedAt && done.has(t.status) && agora - new Date(t.resolvedAt).getTime() < WEEK_MS).length,
    serie14d: serie.map(({ chave, ...r }) => r),
    porStatus: statuses.map((s) => ({ key: s.key, label: s.label, total: ativos.filter((t) => t.status === s.key).length })),
    fila: await shapeTickets(naFila.slice(0, 6)),
    ultimosRegistros: u.perms.has('ver_registros')
      ? await shapeRegistros((await prisma.registro.findMany({ orderBy: { ocorridoEm: 'desc' }, take: 50 })).filter((r) => canSeeRegistro(u, r, ids)).slice(0, 6))
      : [],
  }
})

// ----------------------------- relatório mensal -----------------------------

app.get('/reports/monthly', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_relatorios')
  if (!u) return
  const ids = scopeIds(u)
  const localId = String(req.query?.localId ?? '')
  if (localId && outOfScope(u, localId, reply)) return

  const agora = new Date()
  const m = /^(\d{4})-(\d{2})$/.exec(String(req.query?.month ?? ''))
  const ano = m ? Number(m[1]) : agora.getFullYear()
  const mes = m ? Number(m[2]) - 1 : agora.getMonth()
  const inicio = new Date(ano, mes, 1)
  const fim = new Date(ano, mes + 1, 1)

  const local = localId ? await prisma.local.findUnique({ where: { id: localId }, select: { id: true, name: true, code: true, city: true } }) : null
  if (localId && !local) return reply.code(404).send()

  const base: any = localId ? { localId } : ids ? { localId: { in: ids } } : {}
  const periodo = await prisma.ticket.findMany({
    where: { ...base, OR: [{ createdAt: { gte: inicio, lt: fim } }, { resolvedAt: { gte: inicio, lt: fim } }] },
    orderBy: { createdAt: 'asc' },
  })
  // Relatório respeita a mesma visibilidade da tela de chamados.
  const visiveis = periodo.filter((t) => canSeeTicket(u, t, ids))
  const dentro = (d: Date | null) => !!d && d >= inicio && d < fim
  const abertos = visiveis.filter((t) => dentro(t.createdAt))
  const statuses = await ticketStatuses()
  const done = new Set(statuses.filter((s) => s.done).map((s) => s.key))
  const concluidos = visiveis.filter((t) => dentro(t.resolvedAt) && done.has(t.status))
  const horas = (t: any) => (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000
  const media = (arr: any[]) => (arr.length ? Math.round((arr.reduce((a, t) => a + horas(t), 0) / arr.length) * 10) / 10 : null)
  const stLabel = Object.fromEntries(statuses.map((s) => [s.key, s.label]))
  const nomesLocais = Object.fromEntries((await prisma.local.findMany({ select: { id: true, name: true } })).map((l) => [l.id, l.name]))

  const agrupar = <T,>(arr: T[], chave: (t: T) => string) => {
    const mapa = new Map<string, T[]>()
    for (const t of arr) mapa.set(chave(t), [...(mapa.get(chave(t)) ?? []), t])
    return mapa
  }

  const porResponsavel = [...agrupar(concluidos, (t) => t.assigneeName ?? 'Sem responsável').entries()]
    .map(([nome, arr]) => ({ nome, concluidos: arr.length, mediaHoras: media(arr) }))
    .sort((a, b) => b.concluidos - a.concluidos)

  const porLocal = localId ? [] : [...agrupar(abertos, (t) => (t.localId ? nomesLocais[t.localId] ?? '—' : 'Sem local')).entries()]
    .map(([nome, arr]) => ({ nome, abertos: arr.length, emAberto: arr.filter((t) => !done.has(t.status)).length }))
    .sort((a, b) => b.abertos - a.abertos)

  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const porDia = Array.from({ length: diasNoMes }, (_, i) => {
    const d = new Date(ano, mes, i + 1)
    const k = chaveDia(d)
    return {
      dia: String(i + 1).padStart(2, '0'),
      abertos: abertos.filter((t) => chaveDia(new Date(t.createdAt)) === k).length,
      concluidos: concluidos.filter((t) => chaveDia(new Date(t.resolvedAt!)) === k).length,
    }
  })

  // ---- horas trabalhadas: idas ao local com DATA dentro do mês, de qualquer chamado ----
  // (um chamado aberto em agosto e atendido em setembro conta as horas em setembro)
  const mesKey = `${ano}-${String(mes + 1).padStart(2, '0')}`
  const comVisitas = (await prisma.ticket.findMany({ where: { ...base, visitas: { not: '[]' } } })).filter((t) => canSeeTicket(u, t, ids))
  const idas = comVisitas.flatMap((t) =>
    (parseJsonArray(t.visitas) as Visita[]).filter((v) => v.data?.startsWith(mesKey)).map((v) => ({ ...v, ticket: t })),
  )
  const minutosNoMes = new Map<string, number>() // por chamado
  for (const v of idas) minutosNoMes.set(v.ticket.id, (minutosNoMes.get(v.ticket.id) ?? 0) + v.minutos)
  const somaMin = (arr: { minutos: number }[]) => arr.reduce((s, v) => s + v.minutos, 0)

  const horasPorTecnico = [...agrupar(idas, (v) => v.tecnicoNome || '—').entries()]
    .map(([nome, arr]) => ({ nome, minutos: somaMin(arr), visitas: arr.length, chamados: new Set(arr.map((v) => v.ticket.id)).size }))
    .sort((a, b) => b.minutos - a.minutos)
  const horasPorLocal = [...agrupar(idas, (v) => (v.ticket.localId ? nomesLocais[v.ticket.localId] ?? '—' : 'Sem local')).entries()]
    .map(([nome, arr]) => ({ nome, minutos: somaMin(arr), chamados: new Set(arr.map((v) => v.ticket.id)).size }))
    .sort((a, b) => b.minutos - a.minutos)

  // ---- material: itens dos chamados concluídos no mês ----
  const itensMapa = new Map<string, { descricao: string; tipo: string; quantidade: number; valorTotal: number; chamados: Set<string> }>()
  for (const t of concluidos) {
    for (const i of parseJsonArray(t.itens) as Item[]) {
      const k = `${i.tipo}|${i.descricao.toLowerCase()}`
      const e = itensMapa.get(k) ?? { descricao: i.descricao, tipo: i.tipo, quantidade: 0, valorTotal: 0, chamados: new Set<string>() }
      e.quantidade += i.quantidade
      e.valorTotal += (i.valor ?? 0) * i.quantidade
      e.chamados.add(t.code)
      itensMapa.set(k, e)
    }
  }
  const itens = [...itensMapa.values()]
    .map((e) => ({ ...e, valorTotal: Math.round(e.valorTotal * 100) / 100, chamados: [...e.chamados] }))
    .sort((a, b) => b.quantidade - a.quantidade)

  // ---- registros do mês ----
  const registrosMes = (await prisma.registro.findMany({ where: { ocorridoEm: { gte: inicio, lt: fim }, ...(localId ? { localId } : {}) } }))
    .filter((r) => canSeeRegistro(u, r, ids))

  // Lista: o que foi aberto, concluído ou teve hora trabalhada no mês.
  const naLista = new Map(visiveis.map((t) => [t.id, t]))
  for (const v of idas) if (!naLista.has(v.ticket.id)) naLista.set(v.ticket.id, v.ticket)
  const lista = [...naLista.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return {
    local,
    periodo: { inicio: inicio.toISOString(), fim: fim.toISOString(), mes: mesKey },
    resumo: {
      abertos: abertos.length,
      concluidos: concluidos.length,
      emAberto: abertos.filter((t) => !done.has(t.status)).length,
      mediaHoras: media(concluidos),
      minutosTrabalhados: somaMin(idas),
      visitas: idas.length,
      registros: registrosMes.length,
    },
    horasPorTecnico,
    horasPorLocal,
    itens,
    registrosPorTipo: ['ocorrencia', 'solicitacao', 'informacao'].map((tipo) => ({ tipo, total: registrosMes.filter((r) => r.tipo === tipo).length })),
    porStatus: statuses.map((s) => ({ label: s.label, total: abertos.filter((t) => t.status === s.key).length })),
    porResponsavel,
    porLocal,
    porDia,
    lista: lista.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      minutosNoMes: minutosNoMes.get(t.id) ?? 0,
      itens: (parseJsonArray(t.itens) as Item[]).length,
      local: t.localId ? nomesLocais[t.localId] ?? '—' : '',
      status: stLabel[t.status] ?? t.status,
      concluido: done.has(t.status),
      abertoPor: t.createdByName,
      responsavel: t.assigneeName ?? '',
      criadoEm: t.createdAt,
      concluidoEm: t.resolvedAt,
    })),
  }
})

// ----------------------------- configurações -----------------------------

app.get('/settings', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const rows = await prisma.setting.findMany()
  return Object.fromEntries(rows.filter((s) => !s.key.startsWith('vapid_')).map((s) => [s.key, s.value]))
})

const SETTINGS_EDITAVEIS = new Set(['ticket_statuses'])

app.patch('/settings/:key', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const key = String(req.params.key)
  if (!SETTINGS_EDITAVEIS.has(key)) return reply.code(400).send({ error: 'configuração desconhecida' })
  if (!u.perms.has('gerenciar_status_chamados')) return reply.code(403).send({ error: 'sem permissão' })
  let value = String(req.body?.value ?? '')

  if (key === 'ticket_statuses') {
    let arr: any
    try { arr = JSON.parse(value) } catch { return reply.code(400).send({ error: 'lista de status inválida (JSON)' }) }
    if (!Array.isArray(arr) || arr.length === 0 || arr.some((x) => !x?.key || !String(x.label ?? '').trim())) {
      return reply.code(400).send({ error: 'lista de status inválida' })
    }
    // Existe exatamente UM status final, preservado pela chave: renomear/reordenar
    // as colunas não muda quem arquiva.
    const doneKey = (await ticketStatuses()).find((s) => s.done)?.key ?? 'resolvido'
    const list: TicketStatusDef[] = arr.slice(0, 12).map((x: any) => ({ key: String(x.key).slice(0, 40), label: String(x.label).trim().slice(0, 40) }))
    const final = list.find((s) => s.key === doneKey) ?? list[list.length - 1]
    final.done = true
    value = JSON.stringify(list)
    // Coluna apagada leva os chamados dela para a primeira coluna — não os deixa órfãos.
    const chaves = list.map((s) => s.key)
    const orfaos = await prisma.ticket.findMany({ where: { status: { notIn: chaves } }, select: { code: true } })
    if (orfaos.length) {
      await prisma.ticket.updateMany({ where: { status: { notIn: chaves } }, data: { status: list[0].key } })
      await audit(u, 'editar', 'chamado', `${orfaos.length} chamado(s)`, undefined,
        `Coluna removida — movidos para "${list[0].label}": ${orfaos.map((t) => t.code).join(', ')}`.slice(0, 400))
    }
  }
  const s = await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  await audit(u, 'editar', 'config', key, undefined, key === 'ticket_statuses' ? 'Status de chamados atualizados' : `= ${value}`)
  return { key: s.key, value: s.value }
})

// ----------------------------- web push -----------------------------

app.get('/push/vapid', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  return { publicKey: vapidPublicKey() }
})

app.post('/push/subscribe', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const b = req.body ?? {}
  const endpoint = b.endpoint as string
  const p256dh = b.keys?.p256dh as string
  const auth = b.keys?.auth as string
  if (!endpoint || !p256dh || !auth) return reply.code(400).send({ error: 'inscrição inválida' })
  await prisma.pushSubscription.upsert({ where: { endpoint }, update: { p256dh, auth, userId: u.sub }, create: { endpoint, p256dh, auth, userId: u.sub } })
  return { ok: true }
})

app.post('/push/unsubscribe', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const endpoint = req.body?.endpoint as string
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: u.sub } })
  return { ok: true }
})

app.post('/push/test', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  await announce([u.sub], { kind: 'system', title: 'Notificação de teste', body: 'Chegou no sino ✓', url: '/' }, { push: true })
  return { ok: true }
})

// ----------------------------- notificações (sino) -----------------------------

app.get('/notifications', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  return prisma.notification.findMany({ where: { userId: u.sub }, orderBy: { ts: 'desc' }, take: 100 })
})

app.post('/notifications/read-all', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  await prisma.notification.updateMany({ where: { userId: u.sub, read: false }, data: { read: true } })
  return { ok: true }
})

app.patch('/notifications/:id', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: u.sub }, data: { read: req.body?.read !== false } })
  return { ok: true }
})

app.delete('/notifications/:id', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  await prisma.notification.deleteMany({ where: { id: req.params.id, userId: u.sub } })
  return { ok: true }
})

app.delete('/notifications', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  await prisma.notification.deleteMany({ where: { userId: u.sub } })
  return { ok: true }
})

app.get('/health', async () => ({ ok: true, versao: process.env.npm_package_version ?? null }))

// ----------------------------- boot -----------------------------

const port = Number(process.env.PORT || 3002)
app.listen({ port, host: '0.0.0.0' }).then(async () => {
  console.log(`[api-chamados] rodando em http://localhost:${port}`)
  await enforceAuditImmutability()
  await ensureBaseData().catch((e) => console.error('[bootstrap] falha ao garantir dados base:', e))
  await ensureUploadDir()
  await initVapid()
})
