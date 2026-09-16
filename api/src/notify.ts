import webpush from 'web-push'
import { prisma } from './db'

/**
 * Ponto ÚNICO de aviso. Tudo que o usuário vê como notificação nasce aqui e vira
 * antes uma linha em `Notification` (o sino). O pop-up do navegador é derivado do
 * sino, no front; o web push (app fechado) sai daqui.
 */

let vapidPublic = ''

export function vapidPublicKey(): string {
  return vapidPublic
}

/** Carrega (ou gera na primeira vez) o par de chaves VAPID guardado em Setting. */
export async function initVapid() {
  const read = async (k: string) => (await prisma.setting.findUnique({ where: { key: k } }))?.value ?? ''
  let pub = await read('vapid_public')
  let priv = await read('vapid_private')
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys()
    pub = keys.publicKey
    priv = keys.privateKey
    await prisma.setting.upsert({ where: { key: 'vapid_public' }, update: { value: pub }, create: { key: 'vapid_public', value: pub } })
    await prisma.setting.upsert({ where: { key: 'vapid_private' }, update: { value: priv }, create: { key: 'vapid_private', value: priv } })
  }
  vapidPublic = pub
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:chamados@quality.net.br', pub, priv)
}

/** Envia push para todas as inscrições dos usuários. Inscrições mortas são removidas. Nunca lança. */
export async function sendPush(userIds: (string | null | undefined)[], payload: { title: string; body?: string; url?: string }) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])]
  if (!vapidPublic || ids.length === 0) return
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: ids } } })
  const data = JSON.stringify(payload)
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data)
    } catch (e: any) {
      const code = e?.statusCode
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
    }
  }))
}

export interface Aviso {
  kind: 'ticket' | 'system'
  title: string
  body?: string
  url?: string
}

/** Grava no sino de cada usuário e, se `push`, dispara também o web push. Nunca lança. */
export async function announce(userIds: (string | null | undefined)[], n: Aviso, opts: { push?: boolean } = {}) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])]
  if (ids.length === 0) return
  try {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body ?? null, url: n.url ?? null })),
    })
  } catch { /* silencioso */ }
  if (opts.push) sendPush(ids, { title: n.title, body: n.body, url: n.url }).catch(() => {})
}

/** Usuários ativos que TÊM a permissão e cujo escopo cobre o local. Papel + grants − denies. */
export async function usersWithPerm(perm: string, localId?: string | null): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { status: 'ativo' },
    select: {
      id: true,
      scope: true,
      role: { select: { permissions: { select: { id: true } } } },
      grants: { select: { id: true } },
      denies: { select: { id: true } },
    },
  })
  return users
    .filter((u) => {
      const inScope = !localId || u.scope === 'global' || u.scope.split(',').map((s) => s.trim()).includes(localId)
      if (!inScope) return false
      if (u.denies.some((d) => d.id === perm)) return false
      return (u.role?.permissions ?? []).some((p) => p.id === perm) || u.grants.some((g) => g.id === perm)
    })
    .map((u) => u.id)
}
