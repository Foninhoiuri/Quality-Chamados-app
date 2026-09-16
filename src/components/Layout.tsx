import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Ticket, Bell, ChevronDown, ScrollText, FileBarChart, Users, LogOut, Settings, Menu, Building2, TriangleAlert, X, ListOrdered } from 'lucide-react'
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

type NavItem = { to: string; label: string; menuLabel?: string; icon: typeof Users; perm?: string; end?: boolean }

// `perm` esconde o item de quem não tem a permissão.
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, perm: 'ver_dashboard' },
  { to: '/chamados', label: 'Chamados', icon: Ticket, perm: 'ver_chamados' },
  { to: '/registros', label: 'Registros', icon: ListOrdered, perm: 'ver_registros' },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, perm: 'ver_relatorios' },
  { to: '/locais', label: 'Locais', icon: Building2, perm: 'ver_locais' },
]

const MORE_LINKS: NavItem[] = [
  { to: '/usuarios', label: 'Usuários', menuLabel: 'Usuários e permissões', icon: Users, perm: 'ver_usuarios' },
  { to: '/auditoria', label: 'Auditoria', menuLabel: 'Auditoria (logs)', icon: ScrollText, perm: 'ver_auditoria' },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

const allowed = (items: NavItem[], perms: Set<string>) => items.filter((i) => !i.perm || perms.has(i.perm))

function Avatar({ size = 32 }: { size?: number }) {
  const user = useCurrentUser()
  if (user.avatar) return <img src={assetUrl(user.avatar)} alt={user.name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <div className="flex items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white" style={{ width: size, height: size }}>
      {iniciais(user.name)}
    </div>
  )
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const user = useCurrentUser()
  const role = useCurrentRole()
  const perms = usePerms()
  const logout = useStore((s) => s.logout)
  const box = useRef<HTMLDivElement>(null)
  useClickFora(box, open, () => setOpen(false))

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-800" aria-expanded={open}>
        <Avatar />
        <div className="hidden text-left leading-tight sm:block">
          <div className="text-xs font-medium text-slate-200">{user.name}</div>
          <div className="text-[10px]" style={{ color: role?.color ?? '#71717a' }}>{role?.name ?? '—'}</div>
        </div>
        <ChevronDown size={14} className="text-slate-500" />
      </button>

      {open && (
        <div className="fixed left-3 right-3 top-[calc(var(--header-h)+0.25rem)] z-50 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-60">
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-medium text-slate-100">{user.name}</div>
            <div className="mb-1.5 mt-0.5"><RoleBadge name={role?.name ?? '—'} color={role?.color} /></div>
            <div className="truncate text-[11px] text-slate-500">{user.email}</div>
          </div>
          <div className="p-1.5">
            {allowed(MORE_LINKS, perms).map(({ to, menuLabel, label, icon: Icon }) => (
              <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-300 hover:bg-slate-800">
                <Icon size={16} className="text-slate-400" />
                {menuLabel ?? label}
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-800 p-1.5">
            <button onClick={() => { setOpen(false); logout() }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-300">
              <LogOut size={16} /> Sair da conta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Barra inferior (mobile): itens principais + "Mais" (folha com o resto).
function MobileNav() {
  const [more, setMore] = useState(false)
  const perms = usePerms()
  const logout = useStore((s) => s.logout)
  const nav = allowed(NAV, perms)
  const rest = allowed(MORE_LINKS, perms)
  const tile = (isActive: boolean) => cn('flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium', isActive ? 'text-red-400' : 'text-slate-400')

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-800 bg-slate-950/95 pb-[var(--safe-b)] backdrop-blur md:hidden"
        style={{ minHeight: 'calc(var(--nav-mobile-h) + var(--safe-b))' }}
      >
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => tile(isActive)}>
            <Icon size={20} />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className={tile(false)}>
          <Menu size={20} />
          <span>Mais</span>
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-800 bg-slate-900 p-4 pb-[calc(1.5rem+var(--safe-b))]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
            <div className="grid grid-cols-3 gap-2">
              {rest.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMore(false)}
                  className={({ isActive }) =>
                    cn('flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px]', isActive ? 'border-red-700 bg-red-500/10 text-red-300' : 'border-slate-800 bg-slate-950/40 text-slate-300')
                  }
                >
                  <Icon size={20} />
                  <span className="text-center leading-tight">{label}</span>
                </NavLink>
              ))}
              <button onClick={() => { setMore(false); logout() }} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/40 px-2 py-3 text-[11px] text-slate-300 hover:border-red-700 hover:text-red-300">
                <LogOut size={20} />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Bolinha de status: reflete a conexão com a API.
function StatusIndicator() {
  const online = useStore((s) => s.apiOnline)
  const color = online ? '#34d399' : '#f87171'
  return (
    <span className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px]" title={online ? 'API conectada' : 'API sem conexão'}>
      <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {!online && <span className="text-red-400">sem conexão</span>}
    </span>
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

function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const notifications = useStore((s) => s.notifications)
  const markNotifRead = useStore((s) => s.markNotifRead)
  const markAllNotifsRead = useStore((s) => s.markAllNotifsRead)
  const deleteNotif = useStore((s) => s.deleteNotif)
  const clearNotifs = useStore((s) => s.clearNotifs)
  const unread = notifications.filter((n) => !n.read).length
  const box = useRef<HTMLDivElement>(null)
  useClickFora(box, open, () => setOpen(false))

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-lg p-1 hover:bg-slate-800" title="Notificações" aria-label="Notificações">
        <Bell size={18} className="text-slate-400 hover:text-slate-200" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-[calc(var(--header-h)+0.25rem)] z-50 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-80">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <span className="text-sm font-medium text-slate-100">Notificações</span>
            <div className="flex items-center gap-3 text-[11px]">
              {unread > 0 && <button onClick={() => markAllNotifsRead()} className="text-slate-400 hover:text-slate-200">marcar lidas</button>}
              {notifications.length > 0 && <button onClick={() => clearNotifs()} className="text-slate-500 hover:text-red-300">limpar</button>}
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-slate-500">Sem notificações</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={cn('group flex items-start gap-2 border-b border-slate-800/60 px-3 py-2.5 last:border-0', !n.read && 'bg-slate-800/25')}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-slate-700' : n.kind === 'ticket' ? 'bg-red-500' : 'bg-slate-400')} />
                  <button
                    onClick={() => {
                      if (!n.read) markNotifRead(n.id)
                      setOpen(false)
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
      )}
    </div>
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
      to="/chamados"
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
  const refreshTickets = useStore((s) => s.refreshTickets)
  const refreshNotifications = useStore((s) => s.refreshNotifications)
  const setApiOnline = useStore((s) => s.setApiOnline)
  const [navColapsada, setNavColapsada] = useState(() => {
    try { return localStorage.getItem('chamados-nav-colapsada') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('chamados-nav-colapsada', navColapsada ? '1' : '0') } catch { /* sem storage */ }
  }, [navColapsada])

  // Ao vivo: re-hidrata chamados e notificações periodicamente.
  useEffect(() => {
    const tick = () => {
      refreshNotifications().then(() => setApiOnline(true)).catch((e) => { if (e?.status === 0) setApiOnline(false) })
      if (perms.has('ver_chamados')) refreshTickets().catch(() => {})
    }
    const id = setInterval(tick, 12000)
    return () => clearInterval(id)
  }, [refreshTickets, refreshNotifications, setApiOnline, perms])

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

        <nav className={cn('mt-2 flex-1 space-y-0.5', navColapsada ? 'px-2' : 'px-3')}>
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
              <Icon size={17} />
              {!navColapsada && label}
            </NavLink>
          ))}
        </nav>

        {perms.has('ver_chamados') && (
          <div className={cn('border-t border-slate-800/80', navColapsada ? 'p-2' : 'p-3')}>
            <FilaResumo colapsada={navColapsada} />
          </div>
        )}

        <button
          onClick={() => setNavColapsada((v) => !v)}
          className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 shadow-md hover:border-red-700 hover:text-red-400"
          title={navColapsada ? 'Expandir menu' : 'Colapsar menu'}
        >
          <ChevronDown size={13} className={cn('transition-transform', navColapsada ? '-rotate-90' : 'rotate-90')} />
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-4 backdrop-blur md:px-6"
          style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-600 md:hidden">
              <img src="/logo.png" alt="Aexecutiva" className="h-5 w-5 object-contain" />
            </div>
            <StatusIndicator />
          </div>
          <div className="flex items-center gap-4">
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[calc(var(--nav-mobile-h)+var(--safe-b)+1rem)] md:p-6 md:pb-6">
          <NotificationsBanner />
          <ErroNaTela onde="conteúdo da página">
            <Outlet />
          </ErroNaTela>
        </main>

        <footer className="hidden h-9 shrink-0 items-center justify-between border-t border-slate-800/80 bg-slate-950/40 px-6 text-[11px] text-slate-500 md:flex">
          <span title={buildEmTexto() ? `Construído em ${buildEmTexto()}` : undefined}>Quality Chamados · {versaoCurta()}</span>
          {perms.has('ver_auditoria') && (
            <Link to="/auditoria" className="flex items-center gap-1 hover:text-slate-300">
              <ScrollText size={12} /> Trilha de auditoria
            </Link>
          )}
        </footer>
      </div>

      <MobileNav />
      <ShortcutsListener />
      <NotificationsManager />
      <Toast />
    </div>
  )
}
