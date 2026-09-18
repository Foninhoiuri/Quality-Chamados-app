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
import { announce, EVENTOS, initVapid, parsePrefs, usersWithPerm, vapidPublicKey } from './notify'

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

/**
 * Fase é o que separa as três telas de chamado. `aberto` e `concluido` têm uma coluna
 * cada, fixas; só `andamento` aceita colunas novas (aguardando peça, cliente…).
 */
type FaseChamado = 'aberto' | 'andamento' | 'concluido'
interface TicketStatusDef { key: string; label: string; done?: boolean; fase?: FaseChamado }
const DEFAULT_STATUSES: TicketStatusDef[] = [
  { key: 'aberto', label: 'Aberto', fase: 'aberto' },
  { key: 'andamento', label: 'Em andamento', fase: 'andamento' },
  { key: 'resolvido', label: 'Concluído', done: true, fase: 'concluido' },
]

/** Config antiga (sem `fase`) é lida pela posição: primeira = entrada, a `done` = fim. */
function comFase(lista: TicketStatusDef[]): TicketStatusDef[] {
  const iDone = lista.findIndex((s) => s.done)
  return lista.map((s, i) => ({
    ...s,
    fase: s.fase ?? (i === 0 ? 'aberto' : s.done || (iDone < 0 && i === lista.length - 1) ? 'concluido' : 'andamento'),
  }))
}

async function ticketStatuses(): Promise<TicketStatusDef[]> {
  const raw = await getSetting('ticket_statuses', '')
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return comFase(a) } catch { /* usa default */ } }
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
  return arr.filter((x) => typeof x === 'string' && UPLOAD_PATH_RE.test(x)).slice(0, 12)
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
function cleanVisitas(arr: any, antes: Visita[], u: AuthUser, equipe: { id: string; name: string }[] = []): Visita[] | string {
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
    } else if (inicio) {
      // Ida EM ANDAMENTO: o técnico marcou a chegada e ainda está no local. Conta zero
      // até ele marcar a saída — é o que permite registrar com um toque, sem formulário.
      minutos = 0
    } else {
      minutos = Math.round(Number(v?.minutos))
      if (!Number.isFinite(minutos) || minutos <= 0) return 'informe hora de início e saída, ou o tempo no local'
    }
    if (minutos > 24 * 60) return 'uma ida ao local não pode passar de 24 horas'
    const existente = v?.id ? porId.get(String(v.id)) : undefined
    // Uma ida pertence a UM técnico — é o que impede o chamado compartilhado de contar as
    // mesmas horas duas vezes. Quem preenche diz qual dos técnicos do chamado foi nela.
    const escolhido = v?.tecnicoId ? equipe.find((p) => p.id === String(v.tecnicoId)) : undefined
    out.push({
      id: existente?.id ?? novoId(),
      data, inicio, fim, minutos,
      tecnicoId: escolhido?.id ?? existente?.tecnicoId ?? u.sub,
      tecnicoNome: escolhido?.name ?? existente?.tecnicoNome ?? u.name,
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

const NOVENTA_DIAS_MS = 90 * 24 * 3600 * 1000

/**
 * Data de lançamento vinda do formulário. Aceita o dia inteiro ("2026-09-01", que vira
 * meio-dia para o fuso não jogar para a véspera) e o instante exato em ISO, que é o que
 * o campo de data e hora manda.
 */
function dataLancada(v: string): Date | null {
  const bruto = String(v ?? '').trim()
  if (!bruto) return null
  const d = new Date(DATA_RE.test(bruto) ? `${bruto}T12:00:00` : bruto)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Data de abertura de um chamado lançado fora da hora. Dois caminhos:
 * - `realizadoEm` do serviço já realizado: é o técnico registrando o que ele mesmo fez
 *   (até 90 dias atrás), então não pede permissão extra;
 * - `createdAt` em qualquer outro caso: só com `ajustar_datas_chamado`.
 * `undefined` = resposta de erro já enviada.
 */
async function dataDoLancamento(u: AuthUser, b: any, jaRealizado: boolean, reply: any): Promise<Date | null | undefined> {
  const bruto = jaRealizado && b.realizadoEm ? String(b.realizadoEm) : b.createdAt ? String(b.createdAt) : ''
  if (!bruto) return null
  const retro = jaRealizado && b.realizadoEm
  if (!retro && !u.perms.has('ajustar_datas_chamado')) {
    reply.code(403).send({ error: 'sem permissão para lançar chamado com outra data' })
    return undefined
  }
  const d = dataLancada(bruto)
  if (!d) { reply.code(400).send({ error: 'data inválida' }); return undefined }
  if (d.getTime() > Date.now()) { reply.code(400).send({ error: 'a data não pode ser no futuro' }); return undefined }
  if (retro && Date.now() - d.getTime() > NOVENTA_DIAS_MS) {
    reply.code(400).send({ error: 'serviço já realizado aceita data de até 90 dias atrás' })
    return undefined
  }
  return d
}

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
    sharedWith: parseJsonArray(t.sharedWith),
    minutosTotais: minutosTotais(t),
    commentCount: byTicket[t.id] ?? 0,
  }))
}

/** Técnicos de apoio do chamado (compartilhamento). JSON [{id, name}]. */
function shared(t: any): { id: string; name: string }[] {
  return parseJsonArray(t.sharedWith).filter((x: any) => x && typeof x.id === 'string')
}
const sharedIds = (t: any) => shared(t).map((s) => s.id)

// Quem é avisado sobre um chamado: quem abriu, o técnico que pegou e quem está junto nele.
function ticketAudience(t: any): string[] {
  return [t.createdById, t.assigneeId, ...sharedIds(t)].filter(Boolean)
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
  if (sharedIds(t).includes(u.sub)) return true
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
  const { passwordHash, grants, denies, notifPrefs, ...safe } = u
  return { ...safe, grants: grants.map((g) => g.id), denies: denies.map((d) => d.id), notifPrefs: parsePrefs(notifPrefs) }
}
const shapeRole = (r: any) => ({ id: r.id, name: r.name, color: r.color, system: r.system, permissions: (r.permissions ?? []).map((p: any) => p.id) })
const shapePermission = (p: any) => ({ id: p.id, label: p.label, module: p.module, system: p.system })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Senha temporária feita para ser DITADA: sem 0/O, 1/I/l e sem os sinais do base64url,
 * que viravam erro de digitação na hora de repassar ("a senha não funciona").
 */
const ALFABETO_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function senhaTemporaria(): string {
  const bytes = crypto.randomBytes(8)
  const letras = [...bytes].map((b) => ALFABETO_SENHA[b % ALFABETO_SENHA.length])
  return `${letras.slice(0, 4).join('')}-${letras.slice(4, 8).join('')}`
}
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
  const motivo = !user ? 'e-mail não cadastrado'
    : !user.passwordHash ? 'usuário sem senha definida'
    : user.status !== 'ativo' ? 'usuário inativo'
    : !bcrypt.compareSync(String(password ?? ''), user.passwordHash) ? 'senha incorreta'
    : null
  if (motivo) {
    registrarFalha()
    // Fica na auditoria para dar para descobrir DEPOIS por que alguém não entrou — a
    // pessoa que tentou vê sempre a mesma mensagem genérica. A senha nunca é registrada.
    await prisma.auditLog.create({
      data: { actorName: user?.name ?? emailKey, actorRole: user?.role?.name ?? '—', action: 'login', entity: 'sessao', target: emailKey, detail: `Login recusado: ${motivo}` },
    }).catch(() => {})
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
  // Sobre o que este usuário quer ser avisado. Só os eventos conhecidos; o que não vier
  // fica ligado (o padrão é receber tudo).
  if ('notifPrefs' in b) {
    const p = b.notifPrefs && typeof b.notifPrefs === 'object' ? b.notifPrefs : {}
    const limpo: Record<string, boolean> = {}
    for (const e of EVENTOS) if (e.id in p) limpo[e.id] = !!p[e.id]
    data.notifPrefs = JSON.stringify(limpo)
  }
  const user = await prisma.user.update({ where: { id: u.sub }, data })
  await audit(u, 'editar', 'usuario', user.name, undefined, 'notifPrefs' in b && Object.keys(data).length === 1 ? 'Preferências de notificação atualizadas' : 'Perfil atualizado')
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

const LOCAL_FIELDS = ['code', 'name', 'city', 'address', 'cep', 'phone', 'note'] as const

/** Coordenada vinda do formulário (pino arrastado no mapa ou sugestão de endereço escolhida). */
function lerCoordenada(b: any): { lat: number; lng: number } | null {
  const lat = Number(b?.lat)
  const lng = Number(b?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * Endereço → coordenada, pelo Nominatim (OpenStreetMap). É o que põe o pino no mapa dos
 * locais. Falha em silêncio: sem internet, sem resultado ou fora do ar, o local
 * simplesmente fica sem pino e o botão "localizar" tenta de novo depois.
 *
 * O uso é esporádico (um local por cadastro), dentro da política de uso do serviço.
 */
async function geocodificar(l: { name?: string; address?: string; city?: string; cep?: string }): Promise<{ lat: number; lng: number } | null> {
  const busca = [l.address, l.city, l.cep].filter(Boolean).join(', ').trim()
  if (!busca) return null
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(busca)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'QualityChamados/1.0 (central de chamados interna)', 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const json: any = await res.json()
    const hit = Array.isArray(json) ? json[0] : null
    if (!hit) return null
    const lat = Number(hit.lat)
    const lng = Number(hit.lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

/**
 * CEP → endereço, pelo ViaCEP. É o atalho do cadastro de local: digitou o CEP, o resto
 * do endereço aparece preenchido e sobra digitar o número.
 */
app.get('/cep/:cep', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  if (!u.perms.has('gerenciar_locais') && !u.perms.has('criar_chamados')) return reply.code(403).send({ error: 'sem permissão' })
  const cep = String(req.params.cep ?? '').replace(/\D/g, '')
  if (cep.length !== 8) return reply.code(400).send({ error: 'CEP precisa ter 8 dígitos' })
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return reply.code(502).send({ error: 'serviço de CEP indisponível' })
    const j: any = await res.json()
    if (j?.erro) return reply.code(404).send({ error: 'CEP não encontrado' })
    return {
      cep: String(j.cep ?? cep),
      address: [j.logradouro, j.bairro].filter(Boolean).join(' - '),
      city: [j.localidade, j.uf].filter(Boolean).join(' - '),
    }
  } catch {
    return reply.code(502).send({ error: 'não foi possível consultar o CEP agora' })
  }
})

/**
 * Sugestões de endereço enquanto se digita — o mesmo serviço do pino, só que devolvendo
 * várias opções. Passa pelo servidor para o Nominatim ver um `User-Agent` só e para o
 * navegador não falar com terceiros.
 */
app.get('/geocode/sugestoes', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  if (!u.perms.has('gerenciar_locais') && !u.perms.has('criar_chamados')) return reply.code(403).send({ error: 'sem permissão' })
  const q = String(req.query?.q ?? '').trim()
  if (q.length < 4) return []
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&countrycodes=br&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'QualityChamados/1.0 (central de chamados interna)', 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const json: any = await res.json()
    if (!Array.isArray(json)) return []
    return json.map((h: any) => {
      const a = h.address ?? {}
      const rua = [a.road, a.house_number].filter(Boolean).join(', ')
      const cidade = a.city || a.town || a.village || a.municipality || ''
      return {
        descricao: String(h.display_name ?? '').slice(0, 200),
        address: [rua, a.suburb].filter(Boolean).join(' - ') || String(h.name ?? '').slice(0, 120),
        city: [cidade, a.state].filter(Boolean).join(' - '),
        lat: Number(h.lat),
        lng: Number(h.lon),
      }
    }).filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
  } catch {
    return []
  }
})

app.get('/locais', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  // Quem abre chamado precisa escolher o local, mesmo sem a tela de Locais.
  if (!u.perms.has('ver_locais') && !u.perms.has('criar_chamados')) return reply.code(403).send({ error: 'sem permissão' })
  const ids = scopeIds(u)
  const locais = await prisma.local.findMany({ where: ids ? { id: { in: ids } } : {}, orderBy: { name: 'asc' } })
  const done = await doneKeys()
  const tickets = await prisma.ticket.findMany({
    where: { canceledAt: null, localId: { in: locais.map((l) => l.id) } },
    select: { localId: true, status: true, assigneeId: true, archivedAt: true },
  })
  // Três números por local: em aberto agora, desses quantos já têm técnico, e o total de sempre.
  const zero = () => ({ ativos: 0, andamento: 0, total: 0 })
  const por: Record<string, ReturnType<typeof zero>> = {}
  for (const t of tickets) {
    if (!t.localId) continue
    const c = (por[t.localId] ??= zero())
    c.total++
    if (t.archivedAt || done.has(t.status)) continue
    c.ativos++
    if (t.assigneeId) c.andamento++
  }
  return locais.map((l) => {
    const c = por[l.id] ?? zero()
    return { ...l, ticketCount: c.ativos, ticketsAtivos: c.ativos, ticketsAndamento: c.andamento, ticketsTotal: c.total }
  })
})

app.post('/locais', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_locais')
  if (!u) return
  if (scopeIds(u)) return reply.code(403).send({ error: 'usuário restrito a locais não cria locais' })
  const b = req.body ?? {}
  const name = String(b.name ?? '').trim()
  if (!name) return reply.code(400).send({ error: 'informe o nome do local' })
  const data: any = { code: String(b.code ?? '').trim() || (await nextLocalCode()), name }
  for (const k of ['city', 'address', 'cep', 'phone', 'note'] as const) if (k in b) data[k] = String(b[k] ?? '')
  // Coordenada que veio do formulário manda; só sem ela o endereço é geocodificado.
  const coord = lerCoordenada(b) ?? (await geocodificar(data))
  if (coord) { data.lat = coord.lat; data.lng = coord.lng }
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
  const manual = lerCoordenada(b)
  if (manual) {
    // Pino posicionado à mão: é a verdade, não se mexe nele.
    data.lat = manual.lat
    data.lng = manual.lng
  } else if (('address' in data && data.address !== before.address) || ('city' in data && data.city !== before.city) || ('cep' in data && data.cep !== before.cep)) {
    // Endereço mudou e ninguém marcou o ponto: o pino velho apontaria para o lugar errado.
    const coord = await geocodificar({ address: data.address ?? before.address, city: data.city ?? before.city, cep: data.cep ?? before.cep })
    data.lat = coord?.lat ?? null
    data.lng = coord?.lng ?? null
  }
  const l = await prisma.local.update({ where: { id: req.params.id }, data })
  const detail = diffDetail(before, b, [
    { key: 'name', label: 'Nome' }, { key: 'code', label: 'Código' }, { key: 'city', label: 'Cidade' },
    { key: 'address', label: 'Endereço' }, { key: 'phone', label: 'Telefone' },
  ])
  await audit(u, 'editar', 'local', l.name, l.name, detail || undefined)
  return l
})

/** Tenta (de novo) achar a coordenada deste local pelo endereço. */
app.post('/locais/:id/geocode', async (req: any, reply) => {
  const u = await guard(req, reply, 'gerenciar_locais')
  if (!u) return
  if (outOfScope(u, req.params.id, reply)) return
  const l = await prisma.local.findUnique({ where: { id: req.params.id } })
  if (!l) return reply.code(404).send()
  if (!l.address && !l.city) return reply.code(400).send({ error: 'cadastre o endereço do local primeiro' })
  const coord = await geocodificar(l)
  if (!coord) return reply.code(422).send({ error: 'não foi possível achar este endereço no mapa — confira a rua, o número e a cidade' })
  const atualizado = await prisma.local.update({ where: { id: l.id }, data: coord })
  return atualizado
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
  // `notifPrefs` é preferência de cada um: não interessa à tela de usuários e não sai daqui.
  return users.map(({ passwordHash, notifPrefs, grants, denies, ...x }) => ({ ...x, grants: grants.map((g) => g.id), denies: denies.map((d) => d.id) }))
})

app.post('/users', async (req: any, reply) => {
  const u = await guard(req, reply, 'criar_usuarios')
  if (!u) return
  const b = req.body ?? {}
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!b.name || !email) return reply.code(400).send({ error: 'nome e e-mail são obrigatórios' })
  if (!EMAIL_RE.test(email)) return reply.code(400).send({ error: 'e-mail inválido' })
  if (b.status && !USER_STATUS.has(b.status)) return reply.code(400).send({ error: 'status inválido' })
  // Senha escolhida por quem cadastra; em branco (ou só espaços), o servidor gera uma
  // temporária e a devolve UMA vez. `?? ` não servia aqui: string vazia passava direto e
  // o usuário nascia com hash de senha vazia — daí a temporária "não funcionar".
  const escolhida = typeof b.password === 'string' && b.password.trim() ? String(b.password) : null
  if (escolhida && escolhida.length < 6) return reply.code(400).send({ error: 'a senha precisa ter ao menos 6 caracteres' })
  const tempPassword = escolhida ? null : senhaTemporaria()
  // Quem cadastra decide se a pessoa troca no primeiro acesso; com senha gerada, sempre troca.
  const trocarNoPrimeiroAcesso = tempPassword ? true : b.mustChangePassword !== false
  const created = await prisma.user.create({
    data: {
      name: String(b.name).trim(), email, roleId: b.roleId ?? 'role-operador', scope: b.scope || 'global',
      status: b.status ?? 'ativo', passwordHash: bcrypt.hashSync(escolhida ?? (tempPassword as string), 10),
      mustChangePassword: trocarNoPrimeiroAcesso, phone: b.phone ?? null,
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
  if (typeof b.password === 'string' && b.password.trim()) {
    if (b.password.length < 6) return reply.code(400).send({ error: 'a senha precisa ter ao menos 6 caracteres' })
    data.passwordHash = bcrypt.hashSync(String(b.password), 10)
    // Padrão: a pessoa cria a própria senha no primeiro acesso (quem redefine não deve
    // ficar sabendo a senha final). Dá para desligar caso a caso.
    data.mustChangePassword = b.mustChangePassword !== false
  }
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
  // O histórico é uma tela à parte: quem não tem a permissão não lê chamado arquivado.
  if (history && !u.perms.has('ver_arquivados')) return reply.code(403).send({ error: 'sem permissão para ver o histórico' })
  const archived = archivedPred(await doneKeys(), Date.now() - WEEK_MS)
  // Chamado cancelado não aparece em lugar nenhum do app — só na auditoria.
  const all = await prisma.ticket.findMany({ where: { canceledAt: null }, orderBy: { createdAt: 'desc' } })
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
  const done0 = await doneKeys()

  /**
   * SERVIÇO JÁ REALIZADO: o técnico esteve no local por outro motivo, resolveu algo e só
   * agora registra. Nasce concluído, com ele como responsável e a solução preenchida —
   * não passa pela fila. `realizadoEm` (até 90 dias atrás) é a data do serviço.
   */
  const jaRealizado = !!b.jaRealizado
  if (jaRealizado && !(u.perms.has('registrar_atendimento') && u.perms.has('concluir_chamados'))) {
    return reply.code(403).send({ error: 'sem permissão para registrar serviço já realizado' })
  }
  const doneKey = statuses.find((s) => s.done)?.key
  if (jaRealizado && !doneKey) return reply.code(400).send({ error: 'o quadro não tem coluna de conclusão' })
  const solucao = String(b.solucao ?? '').trim()
  if (jaRealizado && !solucao) return reply.code(400).send({ error: 'descreva o que foi feito (solução) para registrar um serviço já realizado' })

  const quando = await dataDoLancamento(u, b, jaRealizado, reply)
  if (quando === undefined) return

  // Chamado nasce na coluna de entrada. Só quem move chamados escolhe outra — e nunca a
  // de conclusão, que exige a solução preenchida no atendimento.
  const status = jaRealizado
    ? (doneKey as string)
    : u.perms.has('gerenciar_chamados') && statuses.some((s) => s.key === b.status && !done0.has(s.key)) ? b.status : statuses[0].key

  const extra: any = {}
  if (jaRealizado) {
    extra.assigneeId = u.sub
    extra.assigneeName = u.name
    extra.solucao = solucao.slice(0, 8000)
    extra.analise = b.analise ? String(b.analise).trim().slice(0, 8000) || null : null
    extra.acoesTomadas = b.acoesTomadas ? String(b.acoesTomadas).trim().slice(0, 8000) || null : null
    extra.resolvedAt = quando ?? new Date()
    const v = cleanVisitas(b.visitas ?? [], [], u)
    if (typeof v === 'string') return reply.code(400).send({ error: v })
    extra.visitas = JSON.stringify(v)
    const i = cleanItens(b.itens ?? [])
    if (typeof i === 'string') return reply.code(400).send({ error: i })
    extra.itens = JSON.stringify(i)
    if (b.donePhotos?.length && !u.perms.has('anexar_fotos_chamado')) return reply.code(403).send({ error: 'sem permissão para anexar fotos' })
    extra.donePhotos = JSON.stringify(cleanPhotos(b.donePhotos))
  }
  if (quando) extra.createdAt = quando

  const t = await prisma.ticket.create({
    data: {
      code: await nextTicketCode(), title, description: b.description ? String(b.description) : null,
      solicitante: b.solicitante ? String(b.solicitante).trim().slice(0, 200) || null : null,
      status, origin: jaRealizado ? 'realizado' : b.registroId ? 'registro' : 'manual',
      localId: b.localId || null,
      createdById: u.sub, createdByName: u.name,
      photos: JSON.stringify(cleanPhotos(b.photos)),
      ...extra,
    },
  })
  // Chamado aberto a partir de um registro: o registro passa a apontar para ele.
  if (b.registroId) {
    await prisma.registro.updateMany({ where: { id: String(b.registroId), ticketId: null }, data: { ticketId: t.id } })
  }
  const localName = t.localId ? (await prisma.local.findUnique({ where: { id: t.localId }, select: { name: true } }))?.name : undefined
  await audit(u, 'criar', 'chamado', t.title, localName, [t.code, jaRealizado ? 'serviço já realizado' : '', quando ? `data ${quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''].filter(Boolean).join(' · '))
  // Só o que entra na fila avisa os técnicos — serviço já realizado nasce fechado.
  if (!jaRealizado) {
    const aud = await usersWithPerm('aceitar_chamados', t.localId)
    await announce(aud.filter((id) => id !== u.sub), { kind: 'ticket', title: `Novo chamado ${t.code}`, body: t.title, url: ticketUrl(t.id), event: 'chamado_novo' }, { push: true })
  }
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
  /**
   * Chamado concluído é registro fechado: é o que foi entregue e o que o relatório já
   * contou. Mexer nele exige `editar_concluidos`; reabrir continua sendo assunto de
   * `reabrir_chamados`.
   */
  if (done.has(before.status) && !u.perms.has('editar_concluidos')) {
    const soReabrindo = 'status' in b && !done.has(b.status) && Object.keys(b).length === 1
    if (!soReabrindo) return reply.code(403).send({ error: 'chamado concluído — sem permissão para editar' })
  }
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
  // Datas: lançamento que não foi feito na hora. Só com `ajustar_datas_chamado`.
  for (const campo of ['createdAt', 'resolvedAt'] as const) {
    if (!(campo in b)) continue
    if (!u.perms.has('ajustar_datas_chamado')) return reply.code(403).send({ error: 'sem permissão para editar as datas do chamado' })
    if (b[campo] === null) { data[campo] = campo === 'resolvedAt' ? null : before.createdAt; continue }
    const d = dataLancada(String(b[campo]))
    if (!d) return reply.code(400).send({ error: `${campo === 'createdAt' ? 'data de abertura' : 'data de conclusão'} inválida` })
    if (d.getTime() > Date.now()) return reply.code(400).send({ error: 'a data não pode ser no futuro' })
    data[campo] = d
  }
  if (data.resolvedAt && data.createdAt && data.resolvedAt < data.createdAt) {
    return reply.code(400).send({ error: 'a conclusão não pode ser antes da abertura' })
  }
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
  const dataBr = (v: any) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
  const diff = diffDetail(before, data, [
    { key: 'status', label: 'Status', fmt: (v: any) => stLabel[v] ?? v },
    { key: 'title', label: 'Título' },
    { key: 'createdAt', label: 'Abertura', fmt: dataBr },
    { key: 'resolvedAt', label: 'Conclusão', fmt: dataBr },
  ])
  await audit(u, 'editar', 'chamado', t.title, undefined, [t.code, diff].filter(Boolean).join(' · '))

  if (statusChanged) {
    const titulo = `Chamado ${t.code} · ${stLabel[t.status] ?? t.status}`
    await announce(ticketAudience(t).filter((id) => id !== u.sub), { kind: 'ticket', title: titulo, body: t.title, url: ticketUrl(t.id), event: 'chamado_status' }, { push: true })
  }
  return (await shapeTickets([t]))[0]
})

// Finalizar: manda o chamado concluído para o histórico agora, sem esperar a semana.
app.post('/tickets/:id/archive', async (req: any, reply) => {
  const u = await guard(req, reply, 'concluir_chamados')
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t || t.canceledAt) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  if (!(await doneKeys()).has(t.status)) {
    return reply.code(400).send({ error: 'só chamado concluído pode ser finalizado — mova para a coluna de conclusão primeiro' })
  }
  const atualizado = await prisma.ticket.update({ where: { id: t.id }, data: { archivedAt: new Date(), resolvedAt: t.resolvedAt ?? new Date() } })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · finalizado e enviado ao histórico`)
  return (await shapeTickets([atualizado]))[0]
})

/** Devolver ao quadro um chamado que já tinha ido para o histórico. */
app.post('/tickets/:id/unarchive', async (req: any, reply) => {
  const u = await guard(req, reply, 'concluir_chamados')
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (t.canceledAt) return reply.code(400).send({ error: 'chamado cancelado não volta' })
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  // Arquivado pela semana: sem uma conclusão recente ele voltaria e sumiria de novo.
  const data: any = { archivedAt: null }
  if (!t.resolvedAt || new Date(t.resolvedAt).getTime() < Date.now() - WEEK_MS) data.resolvedAt = new Date()
  const atualizado = await prisma.ticket.update({ where: { id: t.id }, data })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · devolvido do histórico para os concluídos`)
  return (await shapeTickets([atualizado]))[0]
})

/**
 * CANCELAR: o chamado sai do quadro e do histórico e não volta. O que foi escrito fica
 * na auditoria — título, relato, quem abriu, quem cancelou e o motivo.
 *
 * Quem cancela: `cancelar_chamados`, ou quem abriu o chamado enquanto ele ainda está em
 * aberto (sem técnico e fora da conclusão) — mesmo sem ser gestor.
 */
app.post('/tickets/:id/cancel', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (t.canceledAt) return reply.code(400).send({ error: 'este chamado já foi cancelado' })
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  const done = await doneKeys()
  const donoEmAberto = t.createdById === u.sub && !t.assigneeId && !done.has(t.status)
  if (!u.perms.has('cancelar_chamados') && !donoEmAberto) {
    return reply.code(403).send({
      error: t.createdById === u.sub ? 'o chamado já saiu da fila — peça para um administrador cancelar' : 'sem permissão para cancelar este chamado',
    })
  }
  const motivo = String(req.body?.motivo ?? '').trim().slice(0, 500)
  const canceled = await prisma.ticket.update({
    where: { id: t.id },
    data: { canceledAt: new Date(), canceledById: u.sub, canceledByName: u.name, cancelReason: motivo || null },
  })
  const localName = t.localId ? (await prisma.local.findUnique({ where: { id: t.localId }, select: { name: true } }))?.name : undefined
  // A auditoria é o único lugar onde este chamado ainda pode ser lido: guarda o conteúdo.
  const detalhe = [
    t.code,
    `aberto por ${t.createdByName}`,
    t.solicitante ? `solicitante: ${t.solicitante}` : '',
    t.description ? `relato: ${String(t.description).slice(0, 1500)}` : 'sem relato',
    motivo ? `motivo do cancelamento: ${motivo}` : 'sem motivo informado',
  ].filter(Boolean).join(' · ')
  await audit(u, 'excluir', 'chamado', t.title, localName, detalhe)
  const aud = ticketAudience(t).filter((id) => id !== u.sub)
  await announce(aud, { kind: 'ticket', title: `Chamado ${t.code} cancelado`, body: `${u.name} cancelou: ${t.title}`, event: 'chamado_cancelado' }, { push: true })
  return { ok: true, id: canceled.id }
})

/**
 * COMPARTILHAR: põe outros técnicos junto no chamado. Eles veem tudo e são avisados,
 * mas quem preenche o atendimento continua sendo o responsável que pegou o chamado.
 */
app.post('/tickets/:id/share', async (req: any, reply) => {
  const u = await guard(req, reply, 'compartilhar_chamados')
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t) return reply.code(404).send()
  if (t.canceledAt) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  if (!t.assigneeId) return reply.code(400).send({ error: 'o chamado ainda está na fila — alguém precisa pegá-lo antes' })
  if (t.assigneeId !== u.sub && !u.perms.has('corrigir_atendimento')) {
    return reply.code(403).send({ error: 'só o responsável pelo chamado compartilha' })
  }
  const pedidos = Array.isArray(req.body?.userIds) ? req.body.userIds.map((x: any) => String(x)).slice(0, 10) : null
  if (!pedidos) return reply.code(400).send({ error: 'informe os técnicos' })
  // Só técnico ativo, no escopo do local, e nunca o próprio responsável.
  const podem = new Set(await usersWithPerm('registrar_atendimento', t.localId))
  const validos = await prisma.user.findMany({
    where: { id: { in: pedidos.filter((id: string) => id !== t.assigneeId && podem.has(id)) }, status: 'ativo' },
    select: { id: true, name: true },
  })
  const antes = shared(t)
  const depois = validos.map((v) => ({ id: v.id, name: v.name }))
  const novos = depois.filter((d) => !antes.some((a) => a.id === d.id))
  const atualizado = await prisma.ticket.update({ where: { id: t.id }, data: { sharedWith: JSON.stringify(depois) } })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · junto no chamado: ${depois.map((d) => d.name).join(', ') || '—'}`)
  if (novos.length) {
    await announce(novos.map((n) => n.id), {
      kind: 'ticket', title: `Você entrou no chamado ${t.code}`,
      body: `${u.name} compartilhou: ${t.title}`, url: ticketUrl(t.id), event: 'chamado_compartilhado',
    }, { push: true })
  }
  return (await shapeTickets([atualizado]))[0]
})

/** Técnicos que podem ser postos junto num chamado (para a tela de compartilhar). */
app.get('/tecnicos', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_chamados')
  if (!u) return
  const ids = await usersWithPerm('registrar_atendimento', req.query?.localId || null)
  const users = await prisma.user.findMany({ where: { id: { in: ids }, status: 'ativo' }, select: { id: true, name: true, avatar: true }, orderBy: { name: 'asc' } })
  return users
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
    await announce([t.createdById], { kind: 'ticket', title: `Chamado ${updated.code} em atendimento`, body: `${u.name} pegou: ${updated.title}`, url: ticketUrl(t.id), event: 'chamado_pego' }, { push: true })
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
  const updated = await prisma.ticket.update({ where: { id: t.id }, data: { assigneeId: null, assigneeName: null, sharedWith: '[]', status: statuses[0].key } })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · devolvido à fila (estava com ${t.assigneeName ?? '—'})`)
  const aud = [...(await usersWithPerm('aceitar_chamados', t.localId)), t.createdById, t.assigneeId].filter((id): id is string => !!id && id !== u.sub)
  await announce(aud, { kind: 'ticket', title: `Chamado ${t.code} voltou para a fila`, body: t.title, url: ticketUrl(t.id), event: 'chamado_fila' }, { push: true })
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
  if ((await doneKeys()).has(before.status) && !u.perms.has('editar_concluidos')) {
    return reply.code(403).send({ error: 'chamado concluído — sem permissão para editar o atendimento' })
  }
  const b = req.body ?? {}
  const data: any = {}
  const texto = (v: any) => (v ? String(v).trim().slice(0, 8000) || null : null)
  for (const k of ['analise', 'possivelSolucao', 'solucao', 'acoesTomadas'] as const) if (k in b) data[k] = texto(b[k])
  if ((await doneKeys()).has(before.status) && 'solucao' in data && !data.solucao) {
    return reply.code(400).send({ error: 'chamado concluído precisa manter a solução preenchida' })
  }
  if ('visitas' in b) {
    // Quem pode aparecer como autor de uma ida: o responsável e quem está junto no chamado.
    const equipe = [
      ...(before.assigneeId ? [{ id: before.assigneeId, name: before.assigneeName ?? '—' }] : []),
      ...shared(before),
    ]
    const v = cleanVisitas(b.visitas, parseJsonArray(before.visitas), u, equipe)
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
  const u = await requireAuth(req, reply)
  if (!u) return
  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!existing) return reply.code(404).send()
  if (!canSeeTicket(u, existing, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  // Quem abriu apaga o próprio chamado enquanto ele está em aberto (sem técnico e sem
  // conclusão) — não precisa ser gestor para desfazer o que acabou de abrir.
  const emAberto = !existing.assigneeId && !(await doneKeys()).has(existing.status)
  if (!u.perms.has('excluir_chamados') && !(existing.createdById === u.sub && emAberto)) {
    return reply.code(403).send({ error: 'sem permissão para excluir este chamado' })
  }
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
  const u = await requireAuth(req, reply)
  if (!u) return
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!t || t.canceledAt) return reply.code(404).send()
  if (!canSeeTicket(u, t, scopeIds(u))) return reply.code(403).send({ error: 'fora do escopo' })
  // O andamento é a conversa do chamado: quem está nele — abriu, pegou ou foi posto junto —
  // fala ali mesmo sem depender da permissão geral de comentar.
  const noChamado = t.createdById === u.sub || t.assigneeId === u.sub || sharedIds(t).includes(u.sub)
  if (!noChamado && !u.perms.has('comentar_chamados')) return reply.code(403).send({ error: 'sem permissão para comentar' })
  const body = String(req.body?.body ?? '').trim()
  if (!body) return reply.code(400).send({ error: 'comentário vazio' })
  const c = await prisma.ticketComment.create({ data: { ticketId: t.id, authorId: u.sub, authorName: u.name, body: body.slice(0, 4000) } })
  // Comentário mexe no "atualizado em" do chamado — é o que ordena os recentes.
  await prisma.ticket.update({ where: { id: t.id }, data: { updatedAt: new Date() } })
  await audit(u, 'editar', 'chamado', t.title, undefined, `${t.code} · comentário`)
  const aud = (await ticketAudience(t)).filter((id) => id !== u.sub)
  const seu = t.createdById === u.sub ? '' : ' no seu chamado'
  await announce(aud, {
    kind: 'ticket',
    title: `${u.name} comentou${seu} ${t.code}`,
    body: body.slice(0, 140),
    url: ticketUrl(t.id),
    event: 'chamado_comentario',
  }, { push: true })
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

/** Categorias do registro — configuráveis, como as colunas do quadro. */
interface TipoRegistroDef { key: string; label: string; color: string }
const TIPOS_REGISTRO_PADRAO: TipoRegistroDef[] = [
  { key: 'ocorrencia', label: 'Ocorrência', color: '#fbbf24' },
  { key: 'solicitacao', label: 'Solicitação', color: '#38bdf8' },
  { key: 'informacao', label: 'Informação', color: '#a1a1aa' },
]
async function tiposRegistro(): Promise<TipoRegistroDef[]> {
  const raw = await getSetting('registro_tipos', '')
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a } catch { /* usa o padrão */ } }
  return TIPOS_REGISTRO_PADRAO
}
const chavesTipoRegistro = async () => new Set((await tiposRegistro()).map((t) => t.key))

/** Primeira linha da descrição — título dos registros feitos antes de existir campo de título. */
const primeiraLinha = (s: string) => String(s ?? '').split('\n')[0].trim().slice(0, 120)

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
  return rs.map((r) => ({
    ...r,
    // Registro antigo não tinha título: o começo da descrição faz esse papel.
    titulo: r.titulo || primeiraLinha(r.descricao) || 'Registro',
    localName: r.localId ? locais[r.localId] : undefined,
    ticketCode: r.ticketId ? tickets[r.ticketId] : undefined,
  }))
}

async function lerRegistro(b: any): Promise<{ data: any } | { erro: string }> {
  const data: any = {}
  if ('titulo' in b) {
    const t = String(b.titulo ?? '').trim()
    if (!t) return { erro: 'informe o título do registro' }
    data.titulo = t.slice(0, 200)
  }
  // Descrição é opcional: "pediu 2ª via do controle" não precisa de mais nada.
  if ('descricao' in b) data.descricao = String(b.descricao ?? '').trim().slice(0, 4000)
  if ('tipo' in b) {
    if (!(await chavesTipoRegistro()).has(b.tipo)) return { erro: 'categoria inválida' }
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
  if (q.tipo && (await chavesTipoRegistro()).has(q.tipo)) where.tipo = q.tipo
  const rs = await prisma.registro.findMany({ where, orderBy: { ocorridoEm: 'desc' }, take: 1000 })
  return shapeRegistros(rs.filter((r) => canSeeRegistro(u, r, ids)))
})

app.post('/registros', async (req: any, reply) => {
  const u = await guard(req, reply, 'criar_registros')
  if (!u) return
  const b = req.body ?? {}
  if (!String(b.titulo ?? '').trim()) return reply.code(400).send({ error: 'informe o título do registro' })
  const lido = await lerRegistro(b)
  if ('erro' in lido) return reply.code(400).send({ error: lido.erro })
  if (lido.data.localId && outOfScope(u, lido.data.localId, reply)) return
  const padrao = (await tiposRegistro())[0]?.key ?? 'ocorrencia'
  const r = await prisma.registro.create({ data: { tipo: padrao, ...lido.data, autorId: u.sub, autorName: u.name } })
  await audit(u, 'criar', 'registro', r.titulo.slice(0, 80), undefined, r.tipo)
  return (await shapeRegistros([r]))[0]
})

app.patch('/registros/:id', async (req: any, reply) => {
  const u = await guard(req, reply, 'criar_registros')
  if (!u) return
  const before = await prisma.registro.findUnique({ where: { id: req.params.id } })
  if (!before) return reply.code(404).send()
  if (!canSeeRegistro(u, before, scopeIds(u)) || !podeMexerRegistro(u, before)) return reply.code(403).send({ error: 'só quem registrou pode editar' })
  const lido = await lerRegistro(req.body ?? {})
  if ('erro' in lido) return reply.code(400).send({ error: lido.erro })
  if (lido.data.localId && lido.data.localId !== before.localId && outOfScope(u, lido.data.localId, reply)) return
  const r = await prisma.registro.update({ where: { id: before.id }, data: lido.data })
  await audit(u, 'editar', 'registro', (r.titulo || r.descricao).slice(0, 80))
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

/**
 * O que há de mais novo em cada área. O app compara com a última vez que a pessoa esteve
 * lá e acende um ponto na barra — assim dá para saber que entrou chamado sem depender de
 * notificação, e sem recarregar a página.
 */
app.get('/novidades', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const ids = scopeIds(u)
  const statuses = await ticketStatuses()
  const faseDe = (t: any) => statuses.find((s) => s.key === t.status)?.fase ?? 'aberto'
  const tickets = u.perms.has('ver_chamados')
    ? (await prisma.ticket.findMany({ where: { canceledAt: null }, select: { status: true, createdAt: true, updatedAt: true, resolvedAt: true, localId: true, createdById: true, assigneeId: true, sharedWith: true } }))
        .filter((t) => canSeeTicket(u, t, ids))
    : []
  const maisNovo = (lista: any[], campo: (t: any) => Date | null) =>
    lista.reduce((m, t) => { const d = campo(t); const x = d ? new Date(d).getTime() : 0; return x > m ? x : m }, 0)

  const registro = u.perms.has('ver_registros')
    ? (await prisma.registro.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })).filter((r) => canSeeRegistro(u, r, ids))[0]
    : null

  return {
    abertos: maisNovo(tickets.filter((t) => faseDe(t) === 'aberto'), (t) => t.createdAt),
    andamento: maisNovo(tickets.filter((t) => faseDe(t) === 'andamento'), (t) => t.updatedAt),
    concluidos: maisNovo(tickets.filter((t) => faseDe(t) === 'concluido'), (t) => t.resolvedAt ?? t.updatedAt),
    registros: registro ? new Date(registro.createdAt).getTime() : 0,
  }
})

app.get('/stats/overview', async (req: any, reply) => {
  const u = await guard(req, reply, 'ver_dashboard')
  if (!u) return
  const ids = scopeIds(u)
  const statuses = await ticketStatuses()
  const done = new Set(statuses.filter((s) => s.done).map((s) => s.key))
  const archived = archivedPred(done, Date.now() - WEEK_MS)
  // Sem `ver_chamados` o dashboard fica só com zeros — não vaza chamado de ninguém.
  const todos = u.perms.has('ver_chamados') ? (await prisma.ticket.findMany({ where: { canceledAt: null } })).filter((t) => canSeeTicket(u, t, ids)) : []
  const agora = Date.now()
  const ativos = todos.filter((t) => !archived(t))
  const abertos = ativos.filter((t) => !done.has(t.status))
  const meus = (t: any) => t.assigneeId === u.sub

  // Janela do dashboard: a semana é o padrão — é o que a operação enxerga de fato.
  const JANELAS = [7, 15, 30]
  const janela = JANELAS.includes(Number(req.query?.dias)) ? Number(req.query.dias) : 7
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dias = Array.from({ length: janela }, (_, i) => new Date(hoje.getTime() - (janela - 1 - i) * DIA_MS))
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

  /**
   * O mesmo número na janela atual e na anterior, do mesmo tamanho. É o que transforma
   * "12 concluídos" em "12 concluídos, 20% a mais que na semana passada".
   */
  const inicioAtual = agora - janela * DIA_MS
  const inicioAnterior = agora - 2 * janela * DIA_MS
  const entre = (d: any, de: number, ate: number) => {
    if (!d) return false
    const x = new Date(d).getTime()
    return x >= de && x < ate
  }
  const minutosDe = (lista: any[]) => lista.reduce((soma, t) => soma + minutosTotais(t), 0)
  const abertosAtual = todos.filter((t) => entre(t.createdAt, inicioAtual, agora))
  const abertosAnterior = todos.filter((t) => entre(t.createdAt, inicioAnterior, inicioAtual))
  const concluidosAtual = todos.filter((t) => entre(t.resolvedAt, inicioAtual, agora))
  const concluidosAnterior = todos.filter((t) => entre(t.resolvedAt, inicioAnterior, inicioAtual))
  const horasMedias = (lista: any[]) => {
    const fechados = lista.filter((t) => t.resolvedAt)
    if (!fechados.length) return null
    const soma = fechados.reduce((s, t) => s + (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()), 0)
    return Math.round((soma / fechados.length / 3600000) * 10) / 10
  }
  // Horas trabalhadas contam pela DATA DA IDA, não pela do chamado.
  const minutosNoIntervalo = (de: number, ate: number) =>
    todos.reduce((soma, t) => soma + (parseJsonArray(t.visitas) as Visita[])
      .filter((v) => { const x = new Date(`${v.data}T12:00:00`).getTime(); return x >= de && x < ate })
      .reduce((s, v) => s + (v.minutos || 0), 0), 0)

  return {
    ativos: ativos.length,
    emAberto: abertos.length,
    naFila: naFila.length,
    emAtendimento: abertos.filter((t) => !!t.assigneeId).length,
    meus: abertos.filter(meus).length,
    comparativo: {
      abertos: { atual: abertosAtual.length, anterior: abertosAnterior.length },
      concluidos: { atual: concluidosAtual.length, anterior: concluidosAnterior.length },
      tempoMedio: { atual: horasMedias(concluidosAtual), anterior: horasMedias(concluidosAnterior) },
      minutosTrabalhados: { atual: minutosNoIntervalo(inicioAtual, agora), anterior: minutosNoIntervalo(inicioAnterior, inicioAtual) },
    },
    concluidos7d: todos.filter((t) => t.resolvedAt && done.has(t.status) && agora - new Date(t.resolvedAt).getTime() < WEEK_MS).length,
    // Quantos concluíram dentro da janela escolhida (7, 15 ou 30 dias).
    concluidosJanela: todos.filter((t) => t.resolvedAt && done.has(t.status) && agora - new Date(t.resolvedAt).getTime() < janela * DIA_MS).length,
    janelaDias: janela,
    serie: serie.map(({ chave, ...r }) => r),
    // Situação dos chamados DA JANELA (7, 15 ou 30 dias) — é a soma do anel do dashboard.
    porStatus: (() => {
      const desde = agora - janela * DIA_MS
      const naJanela = todos.filter((t) => new Date(t.createdAt).getTime() >= desde)
      return statuses.map((s) => ({ key: s.key, label: s.label, fase: s.fase ?? 'andamento', total: naJanela.filter((t) => t.status === s.key).length }))
    })(),
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

  // Chamado cancelado não entra em relatório: para a operação ele não aconteceu.
  const base: any = { canceledAt: null, ...(localId ? { localId } : ids ? { localId: { in: ids } } : {}) }
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

const SETTINGS_EDITAVEIS = new Set(['ticket_statuses', 'registro_tipos'])

app.patch('/settings/:key', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  const key = String(req.params.key)
  if (!SETTINGS_EDITAVEIS.has(key)) return reply.code(400).send({ error: 'configuração desconhecida' })
  if (!u.perms.has('gerenciar_status_chamados')) return reply.code(403).send({ error: 'sem permissão' })
  let value = String(req.body?.value ?? '')

  if (key === 'registro_tipos') {
    let arr: any
    try { arr = JSON.parse(value) } catch { return reply.code(400).send({ error: 'lista de categorias inválida (JSON)' }) }
    if (!Array.isArray(arr) || arr.length === 0) return reply.code(400).send({ error: 'deixe ao menos uma categoria' })
    const list: TipoRegistroDef[] = arr.slice(0, 12).map((x: any) => ({
      key: String(x.key ?? '').slice(0, 40),
      label: String(x.label ?? '').trim().slice(0, 40),
      color: /^#[0-9a-fA-F]{6}$/.test(String(x.color ?? '')) ? String(x.color) : '#a1a1aa',
    }))
    if (list.some((t) => !t.key || !t.label)) return reply.code(400).send({ error: 'toda categoria precisa de nome' })
    value = JSON.stringify(list)
    // Categoria apagada: os registros dela vão para a primeira — registro não se perde.
    const chaves = list.map((t) => t.key)
    const orfaos = await prisma.registro.count({ where: { tipo: { notIn: chaves } } })
    if (orfaos) {
      await prisma.registro.updateMany({ where: { tipo: { notIn: chaves } }, data: { tipo: list[0].key } })
      await audit(u, 'editar', 'registro', `${orfaos} registro(s)`, undefined, `Categoria removida — movidos para "${list[0].label}"`)
    }
  }

  if (key === 'ticket_statuses') {
    let arr: any
    try { arr = JSON.parse(value) } catch { return reply.code(400).send({ error: 'lista de status inválida (JSON)' }) }
    if (!Array.isArray(arr) || arr.length === 0 || arr.some((x) => !x?.key || !String(x.label ?? '').trim())) {
      return reply.code(400).send({ error: 'lista de status inválida' })
    }
    /**
     * As pontas não se mexem: a entrada e a conclusão são as telas "Abertos" e
     * "Concluídos". O que o quadro de Em andamento gerencia é só o miolo — e ele
     * precisa ter pelo menos uma coluna, senão o chamado pego não teria onde ficar.
     */
    const atuais = await ticketStatuses()
    const entrada = atuais.find((s) => s.fase === 'aberto') ?? atuais[0]
    const final = atuais.find((s) => s.fase === 'concluido') ?? atuais[atuais.length - 1]
    const miolo: TicketStatusDef[] = arr
      .map((x: any) => ({ key: String(x.key).slice(0, 40), label: String(x.label).trim().slice(0, 40), fase: 'andamento' as const }))
      .filter((x: TicketStatusDef) => x.key !== entrada.key && x.key !== final.key)
      .slice(0, 10)
    if (miolo.length === 0) return reply.code(400).send({ error: 'Em andamento precisa de ao menos uma coluna' })
    const list: TicketStatusDef[] = [
      { ...entrada, fase: 'aberto', done: false },
      ...miolo,
      { ...final, fase: 'concluido', done: true },
    ]
    value = JSON.stringify(list)
    // Coluna apagada leva os chamados dela para a primeira coluna — não os deixa órfãos.
    // Coluna apagada: os chamados dela ficam na primeira coluna de Em andamento — eles já
    // estão com um técnico, mandá-los para a fila de abertos perderia o atendimento em curso.
    const chaves = list.map((s) => s.key)
    const destino = miolo[0]
    const orfaos = await prisma.ticket.findMany({ where: { status: { notIn: chaves } }, select: { code: true } })
    if (orfaos.length) {
      await prisma.ticket.updateMany({ where: { status: { notIn: chaves } }, data: { status: destino.key } })
      await audit(u, 'editar', 'chamado', `${orfaos.length} chamado(s)`, undefined,
        `Coluna removida — movidos para "${destino.label}": ${orfaos.map((t) => t.code).join(', ')}`.slice(0, 400))
    }
  }
  const s = await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  const oQue = key === 'ticket_statuses' ? 'Colunas de Em andamento atualizadas' : key === 'registro_tipos' ? 'Categorias de registro atualizadas' : `= ${value}`
  await audit(u, 'editar', 'config', key, undefined, oQue)
  return { key: s.key, value: s.value }
})

// ----------------------------- web push -----------------------------

/** Lista de eventos que o usuário pode ligar/desligar (a tela de notificações lê daqui). */
app.get('/notifications/events', async (req: any, reply) => {
  const u = await requireAuth(req, reply)
  if (!u) return
  return EVENTOS.map((e) => ({ ...e }))
})

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
