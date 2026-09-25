import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Ticket, Bell, ChevronDown, ScrollText, FileBarChart, Users, LogOut, Settings, Building2, TriangleAlert, X, ListOrdered, Inbox, Wrench, CheckCircle2, CloudOff, CircleHelp, KeySquare } from 'lucide-react'
import { cn, iniciais } from '@/lib/utils'
import { useStore, useCurrentUser, useCurrentRole, usePerms } from '@/lib/store'
import { assetUrl } from '@/lib/api'
import { parseStatuses } from '@/lib/tickets'
import { buildEmTexto, versaoCurta } from '@/lib/version'
import { RoleBadge } from './ui'
import { ShortcutsListener, Toast } from './Shortcuts'
import { NotificationsManager, NotificationsBanner } from './Notifications'
import { ErroNaTela } from './ErroNaTela'
import { useClickFora } from '@/lib/useClickFora'
import { AREA_DA_ROTA, useNovidades } from '@/lib/novidades'
import { assinarFila, pendentes, processarFila } from '@/lib/fila'

type NavItem = {
  to: string; label: string; menuLabel?: string; icon: typeof Users; perm?: string; end?: boolean
  /** Só na barra lateral do computador — a barra do celular tem espaço para cinco. */
  soDesktop?: boolean
  /** Só no menu da conta do celular (o computador já tem na barra lateral). */
  soMobile?: boolean
}

// `perm` esconde o item de quem não tem a permissão.
// A barra é o caminho do chamado: ele nasce em Abertos, anda em Em andamento e termina
// em Concluídos. No celular são exatamente estes cinco.
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, perm: 'ver_dashboard' },
  { to: '/abertos', label: 'Abertos', icon: Inbox, perm: 'ver_chamados' },
  { to: '/andamento', label: 'Em andamento', menuLabel: 'Chamados em andamento', icon: Wrench, perm: 'ver_chamados' },
  { to: '/concluidos', label: 'Concluídos', icon: CheckCircle2, perm: 'ver_chamados' },
  { to: '/registros', label: 'Registros', icon: ListOrdered, perm: 'ver_registros' },
  { to: '/pedidos', label: 'Controles & Tags', menuLabel: 'Controles & Tags', icon: KeySquare, perm: 'ver_pedidos', soDesktop: true },
]

const MORE_LINKS: NavItem[] = [
  { to: '/pedidos', label: 'Controles & Tags', menuLabel: 'Controles & Tags', icon: KeySquare, perm: 'ver_pedidos', soMobile: true },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, perm: 'ver_relatorios' },
  { to: '/locais', label: 'Locais', icon: Building2, perm: 'ver_locais' },
  { to: '/usuarios', label: 'Usuários', menuLabel: 'Usuários e permissões', icon: Users, perm: 'ver_usuarios' },
  { to: '/auditoria', label: 'Auditoria', menuLabel: 'Auditoria (logs)', icon: ScrollText, perm: 'ver_auditoria' },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
  // Sem `perm`: a ajuda é de todos. O que muda é o conteúdo dela, não o acesso.
  { to: '/ajuda', label: 'Como funciona', menuLabel: 'Como funciona o app', icon: CircleHelp },
]

const allowed = (items: NavItem[], perms: Set<string>) => items.filter((i) => !i.perm || perms.has(i.perm))

/**
 * O avatar carrega o estado da conexão: o anel em volta fica verde com a API no ar e
 * vermelho pulsando quando ela cai. É informação de fundo — não merece um ponto extra
 * ocupando espaço na barra.
 */
function Avatar({ size = 32 }: { size?: number }) {
  const user = useCurrentUser()
  const online = useStore((s) => s.apiOnline)
  const anel = online ? '#34d399' : '#f87171'
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full', !online && 'animate-pulse')}
      style={{ padding: 2, background: `${anel}22`, boxShadow: `inset 0 0 0 1.5px ${anel}` }}
      title={online ? 'Conectado' : 'Sem conexão com o servidor'}
      aria-label={online ? 'Conectado' : 'Sem conexão com o servidor'}
    >
      {user.avatar ? (
        <img src={assetUrl(user.avatar)} alt={user.name} className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <span className="flex items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white" style={{ width: size, height: size }}>
          {iniciais(user.name)}
        </span>
      )}
    </span>
  )
}

/**
 * CARTÃO DA CONTA — o único menu do app. Junta o que antes estava espalhado entre a barra
 * de cima e a lateral: quem está logado, as notificações, as telas que não vivem na barra
 * (relatórios, locais, usuários, auditoria, configurações) e o sair.
 *
 * No desktop ele mora no rodapé da lateral e abre para cima; no celular é a folha que
 * sobe do rodapé, no lugar do antigo "Mais".
 */
function ContaCard({ aberto, onAbrir, compacto, comoBotaoDaBarra }: {
  aberto: boolean
  onAbrir: (v: boolean) => void
  /** Lateral colapsada: só o avatar. */
  compacto?: boolean
  /** No celular o gatilho é um item da barra de navegação, não um cartão. */
  comoBotaoDaBarra?: boolean
}) {
  const user = useCurrentUser()
  const role = useCurrentRole()
  const perms = usePerms()
  const logout = useStore((s) => s.logout)
  const notifications = useStore((s) => s.notifications)
  const naoLidas = notifications.filter((n) => !n.read).length
  const [verNotificacoes, setVerNotificacoes] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const fechar = useCallback(() => onAbrir(false), [onAbrir])
  useClickFora(box, aberto && !comoBotaoDaBarra, fechar)

  useEffect(() => { if (!aberto) setVerNotificacoes(false) }, [aberto])

  const conteudo = (
    <>
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <Avatar size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-100">{user.name}</div>
          <div className="truncate text-[11px] text-slate-500">{user.email}</div>
        </div>
        <RoleBadge name={role?.name ?? '—'} color={role?.color} />
      </div>

      {verNotificacoes ? (
        <ListaNotificacoes onFechar={() => setVerNotificacoes(false)} onIr={fechar} />
      ) : (
        <>
          <div className="p-1.5">
            <button
              onClick={() => setVerNotificacoes(true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <Bell size={16} className="text-slate-400" />
              <span className="flex-1 text-left">Notificações</span>
              {naoLidas > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{naoLidas > 9 ? '9+' : naoLidas}</span>}
              <ChevronDown size={14} className="-rotate-90 text-slate-600" />
            </button>
            {allowed(MORE_LINKS, perms).map(({ to, menuLabel, label, icon: Icon, soMobile }) => (
              <Link key={to} to={to} onClick={fechar} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-300 hover:bg-slate-800', soMobile && 'md:hidden')}>
                <Icon size={16} className="text-slate-400" />
                {menuLabel ?? label}
              </Link>
            ))}
          </div>

          <div className="border-t border-slate-800 p-1.5">
            <button onClick={() => { fechar(); logout() }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-300">
              <LogOut size={16} /> Sair da conta
            </button>
          </div>

          {/* A assinatura de versão vive aqui no celular — a barra de rodapé sumiu. */}
          <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-600 md:hidden" title={buildEmTexto() ? `Construído em ${buildEmTexto()}` : undefined}>
            Quality Chamados · {versaoCurta()}
          </div>
        </>
      )}
    </>
  )

  if (comoBotaoDaBarra) {
    return (
      <>
        <button
          onClick={() => onAbrir(!aberto)}
          className={cn('relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium', aberto ? 'text-red-400' : 'text-slate-400')}
        >
          <Avatar size={20} />
          <span>Conta</span>
          {naoLidas > 0 && <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-950" />}
        </button>

        {aberto && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={fechar} />
            <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-slate-800 bg-slate-900">
              {/* Fechar tem que ser fácil com uma mão: a alça, o X grande no topo e um
                  botão escrito no rodapé — três saídas, todas no alcance do polegar. */}
              <button onClick={fechar} className="shrink-0 cursor-pointer pb-1 pt-2" aria-label="Fechar menu">
                <span className="mx-auto block h-1 w-10 rounded-full bg-slate-700" />
              </button>
              <div className="flex-1 overflow-auto">{conteudo}</div>
              <div className="shrink-0 border-t border-slate-800 p-3 pb-[calc(0.75rem+var(--safe-b))]">
                <button onClick={fechar} className="w-full rounded-lg border border-slate-700 bg-slate-800 py-3 text-sm font-medium text-slate-100">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => onAbrir(!aberto)}
        aria-expanded={aberto}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-left hover:border-slate-700 hover:bg-slate-900',
          compacto && 'justify-center',
        )}
      >
        <Avatar size={compacto ? 30 : 34} />
        {!compacto && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-slate-100">{user.name}</span>
              <span className="block truncate text-[11px]" style={{ color: role?.color ?? '#71717a' }}>{role?.name ?? '—'}</span>
            </span>
            <span className="relative shrink-0">
              {naoLidas > 0 && <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{naoLidas > 9 ? '9+' : naoLidas}</span>}
              <ChevronDown size={15} className={cn('text-slate-500 transition-transform', aberto && 'rotate-180')} />
            </span>
          </>
        )}
      </button>

      {aberto && (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          {conteudo}
        </div>
      )}
    </div>
  )
}

function fmtNotifTime(ts: string) {
  const d = new Date(ts)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins} min`
  if (mins < 1440) return `${Math.round(mins / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** As notificações, dentro do cartão da conta. */
function ListaNotificacoes({ onFechar, onIr }: { onFechar: () => void; onIr: () => void }) {
  const navigate = useNavigate()
  const notifications = useStore((s) => s.notifications)
  const markNotifRead = useStore((s) => s.markNotifRead)
  const markAllNotifsRead = useStore((s) => s.markAllNotifsRead)
  const deleteNotif = useStore((s) => s.deleteNotif)
  const clearNotifs = useStore((s) => s.clearNotifs)
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div>
      {/* Voltar grande: dentro da folha do celular, um link de 12px não se acerta. */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-2 py-2">
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium text-slate-200 hover:bg-slate-800">
          <ChevronDown size={16} className="rotate-90" /> Notificações
        </button>
        <div className="flex items-center gap-3 text-[11px]">
          {unread > 0 && <button onClick={() => markAllNotifsRead()} className="text-slate-400 hover:text-slate-200">marcar lidas</button>}
          {notifications.length > 0 && <button onClick={() => clearNotifs()} className="text-slate-500 hover:text-red-300">limpar</button>}
        </div>
      </div>
      <div className="max-h-[50vh] overflow-auto">
        {notifications.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-slate-500">Sem notificações</div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={cn('group flex items-start gap-2 border-b border-slate-800/60 px-3 py-2.5 last:border-0', !n.read && 'bg-slate-800/25')}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-slate-700' : n.kind === 'ticket' ? 'bg-red-500' : 'bg-slate-400')} />
              <button
                onClick={() => {
                  if (!n.read) markNotifRead(n.id)
                  onIr()
                  navigate(n.url || '/chamados')
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-[13px] font-medium text-slate-100">{n.title}</div>
                {n.body && <div className="truncate text-[11px] text-slate-400">{n.body}</div>}
                <div className="text-[10px] text-slate-600">{fmtNotifTime(n.ts)}</div>
              </button>
              <button onClick={() => deleteNotif(n.id)} className="shrink-0 rounded p-1 text-slate-600 hover:bg-red-500/10 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100" title="Apagar">
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Barra inferior (mobile): as cinco telas do dia a dia e a conta, que guarda o resto.
function MobileNav({ temNovidade }: { temNovidade: (rota: string) => boolean }) {
  const [conta, setConta] = useState(false)
  const perms = usePerms()
  const nav = allowed(NAV, perms).filter((i) => !i.soDesktop)
  const tile = (isActive: boolean) => cn('relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium', isActive ? 'text-red-400' : 'text-slate-400')

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-800 bg-slate-950/95 pb-[var(--safe-b)] backdrop-blur md:hidden"
      style={{ minHeight: 'calc(var(--nav-mobile-h) + var(--safe-b))' }}
    >
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => tile(isActive)}>
          <span className="relative">
            <Icon size={19} />
            {temNovidade(to) && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-950" />}
          </span>
          <span className="max-w-full truncate px-0.5">{label}</span>
        </NavLink>
      ))}
      <ContaCard aberto={conta} onAbrir={setConta} comoBotaoDaBarra />
    </nav>
  )
}

/** Fora do ar, o aviso em texto — o estado normal já está no anel do avatar. */
function StatusIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5" title="Sem conexão com o servidor">
      <TriangleAlert size={12} /> sem conexão com o servidor — tentando de novo
    </span>
  )
}

/** Resumo no rodapé da sidebar: em aberto e quantos ainda esperam um técnico pegar. */
function FilaResumo({ colapsada }: { colapsada: boolean }) {
  const tickets = useStore((s) => s.tickets)
  const settings = useStore((s) => s.settings)
  const done = new Set(parseStatuses(settings).filter((s) => s.done).map((s) => s.key))
  const abertos = tickets.filter((t) => !done.has(t.status))
  const naFila = abertos.filter((t) => !t.assigneeId).length
  return (
    <Link
      to="/abertos"
      className={cn('block w-full rounded-lg border border-slate-800 bg-slate-900/60 text-left transition-colors hover:border-slate-700 hover:bg-slate-900', colapsada ? 'p-2' : 'p-3')}
      title="Chamados em aberto"
    >
      <div className={cn('flex items-center gap-2 text-xs text-slate-400', colapsada && 'justify-center')}>
        <Ticket size={14} className="text-red-400" />
        {!colapsada && 'Fila em aberto'}
      </div>
      <div className={cn('mt-1 font-semibold tabular-nums text-slate-100', colapsada ? 'text-center text-sm' : 'text-lg')}>{abertos.length}</div>
      {!colapsada && (
        <div className={cn('mt-0.5 flex items-center gap-1 text-[11px]', naFila ? 'text-amber-400' : 'text-slate-500')}>
          {naFila > 0 && <TriangleAlert size={11} />}
          {naFila ? `${naFila} esperando técnico` : 'todos com técnico'}
        </div>
      )}
    </Link>
  )
}

export function Layout() {
  const perms = usePerms()
  const me = useStore((s) => s.me)
  const showToast = useStore((s) => s.showToast)
  const refreshTickets = useStore((s) => s.refreshTickets)
  const refreshNotifications = useStore((s) => s.refreshNotifications)
  const setApiOnline = useStore((s) => s.setApiOnline)
  const online = useStore((s) => s.apiOnline)
  const location = useLocation()
  const [conta, setConta] = useState(false)
  const [navColapsada, setNavColapsada] = useState(() => {
    try { return localStorage.getItem('chamados-nav-colapsada') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('chamados-nav-colapsada', navColapsada ? '1' : '0') } catch { /* sem storage */ }
  }, [navColapsada])

  const { buscar: buscarNovidades, marcarVisto, temNovidade } = useNovidades(me?.id, perms.has('ver_chamados') || perms.has('ver_registros'))

  /**
   * O que foi feito sem sinal e ainda não subiu. Some sozinho quando a rede volta; até
   * lá, fica à vista — ninguém deve descobrir só no fim do dia que a hora não foi salva.
   */
  const [naFila, setNaFila] = useState(() => pendentes().length)
  useEffect(() => assinarFila(() => setNaFila(pendentes().length)), [])
  const enviarPendentes = useCallback(async () => {
    if (pendentes().length === 0) return
    const { enviadas, restantes } = await processarFila()
    setNaFila(restantes)
    if (enviadas > 0) {
      refreshTickets().catch(() => {})
      showToast(`${enviadas} ação(ões) enviada(s) depois que a rede voltou`)
    }
  }, [refreshTickets, showToast])
  useEffect(() => {
    enviarPendentes()
    window.addEventListener('online', enviarPendentes)
    return () => window.removeEventListener('online', enviarPendentes)
  }, [enviarPendentes])

  // Estar na tela zera o ponto dela — e continua zerando enquanto a pessoa fica ali.
  useEffect(() => {
    const area = AREA_DA_ROTA[location.pathname]
    if (!area) return
    marcarVisto(area)
    const id = setInterval(() => marcarVisto(area), 10000)
    return () => clearInterval(id)
  }, [location.pathname, marcarVisto])

  // Ao vivo: re-hidrata chamados, notificações e os pontinhos das áreas.
  useEffect(() => {
    const tick = () => {
      refreshNotifications().then(() => setApiOnline(true)).catch((e) => { if (e?.status === 0) setApiOnline(false) })
      if (perms.has('ver_chamados')) refreshTickets().catch(() => {})
      buscarNovidades()
      enviarPendentes()
    }
    const id = setInterval(tick, 12000)
    return () => clearInterval(id)
  }, [refreshTickets, refreshNotifications, setApiOnline, perms, buscarNovidades, enviarPendentes])

  const pontoNaRota = (rota: string) => {
    const area = AREA_DA_ROTA[rota]
    return area ? temNovidade(area) && location.pathname !== rota : false
  }

  return (
    <div className="app-shell flex overflow-hidden bg-[var(--app-bg)]">
      <aside className={cn('relative hidden shrink-0 flex-col border-r border-slate-800/80 bg-slate-950/60 transition-[width] duration-150 md:flex', navColapsada ? 'w-[4.5rem]' : 'w-60')}>
        <div className={cn('flex items-center gap-2.5 px-5 py-4', navColapsada && 'justify-center px-0')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600">
            <img src="/logo.png" alt="Aexecutiva" className="h-7 w-7 object-contain" />
          </div>
          {!navColapsada && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-slate-100">Aexecutiva</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">Quality Work · Chamados</div>
            </div>
          )}
        </div>

        {/* A barra é o caminho do chamado. O resto (relatórios, locais, usuários, auditoria,
            configurações) vive no cartão da conta, aqui embaixo — em um lugar só. */}
        <nav className={cn('mt-2 flex-1 space-y-0.5 overflow-y-auto', navColapsada ? 'px-2' : 'px-3')}>
          {allowed(NAV, perms).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={navColapsada ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  navColapsada && 'justify-center px-0',
                  isActive ? 'bg-red-500/10 text-red-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                )
              }
            >
              <span className="relative shrink-0">
                <Icon size={17} />
                {pontoNaRota(to) && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-950" />}
              </span>
              {!navColapsada && <span className="min-w-0 flex-1 truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={cn('space-y-2 border-t border-slate-800/80', navColapsada ? 'p-2' : 'p-3')}>
          <ContaCard aberto={conta} onAbrir={setConta} compacto={navColapsada} />
          {perms.has('ver_chamados') && <FilaResumo colapsada={navColapsada} />}
          {!navColapsada && (
            <div className="flex items-center justify-between px-1 text-[10px] text-slate-600">
              <span title={buildEmTexto() ? `Construído em ${buildEmTexto()}` : undefined}>Quality Chamados · {versaoCurta()}</span>
              {perms.has('ver_auditoria') && (
                <Link to="/auditoria" className="flex items-center gap-1 hover:text-slate-400" title="Trilha de auditoria">
                  <ScrollText size={11} />
                </Link>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setNavColapsada((v) => !v)}
          className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 shadow-md hover:border-red-700 hover:text-red-400"
          title={navColapsada ? 'Expandir menu' : 'Colapsar menu'}
        >
          <ChevronDown size={13} className={cn('transition-transform', navColapsada ? '-rotate-90' : 'rotate-90')} />
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sem barra de cima: a tela inteira é conteúdo. O aviso de conexão só aparece
            quando o servidor cai — o resto do tempo o estado vive no anel do avatar. */}
        {!online && (
          <div className="shrink-0 bg-red-950/60 px-4 py-1.5 text-center text-[11px] text-red-300" style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}>
            <StatusIndicator />
          </div>
        )}
        {naFila > 0 && (
          <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-950/50 px-4 py-1.5 text-center text-[11px] text-amber-300">
            <CloudOff size={12} />
            {naFila} {naFila === 1 ? 'registro guardado' : 'registros guardados'} no aparelho — sobe{naFila === 1 ? '' : 'm'} quando a rede voltar
            <button onClick={enviarPendentes} className="rounded px-1.5 py-0.5 underline-offset-2 hover:underline">tentar agora</button>
          </div>
        )}

        <main
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(var(--nav-mobile-h)+var(--safe-b)+1rem)] md:p-6 md:pb-6"
          style={online ? { paddingTop: 'max(1rem, env(safe-area-inset-top))' } : undefined}
        >
          <NotificationsBanner />
          <ErroNaTela onde="conteúdo da página">
            <Outlet />
          </ErroNaTela>
        </main>
      </div>

      <MobileNav temNovidade={pontoNaRota} />
      <ShortcutsListener />
      <NotificationsManager />
      <Toast />
    </div>
  )
}
