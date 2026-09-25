import { useEffect, type ReactElement } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { Layout } from './components/Layout'
import Login from './components/Login'
import Setup from './components/Setup'
import ForcePasswordChange from './components/ForcePasswordChange'
import { useStore, useCan, usePerms } from './lib/store'
import { FASES, faseDoTicket, parseStatuses } from './lib/tickets'
import Dashboard from './pages/Dashboard'
import Chamados from './pages/Chamados'
import Relatorios from './pages/Relatorios'
import Registros from './pages/Registros'
import Pedidos from './pages/Pedidos'
import Locais from './pages/Locais'
import Usuarios from './pages/Usuarios'
import Auditoria from './pages/Auditoria'
import Configuracoes from './pages/Configuracoes'
import Ajuda from './pages/Ajuda'

/** Guarda de rota: URL digitada à mão sem permissão mostra "sem acesso" em vez de tela vazia. */
function Guarded({ perm, children }: { perm: string; children: ReactElement }) {
  if (useCan(perm)) return children
  return (
    <div className="grid h-full place-items-center py-20">
      <div className="max-w-sm text-center">
        <Lock size={22} className="mx-auto mb-3 text-slate-600" />
        <div className="text-sm font-medium text-slate-200">Sem acesso a esta tela</div>
        <p className="mt-1 text-[13px] text-slate-500">Seu perfil não tem a permissão necessária. Fale com um administrador se precisar dela.</p>
      </div>
    </div>
  )
}

/**
 * `/chamados?t=<id>` é o link que as notificações e os registros usam. Como o chamado
 * agora mora na tela da fase dele, o destino certo só se sabe com o chamado em mãos.
 */
function ParaOChamado() {
  const [params] = useSearchParams()
  const settings = useStore((s) => s.settings)
  const tickets = useStore((s) => s.tickets)
  const id = params.get('t')
  const t = id ? tickets.find((x) => x.id === id) : null
  const fase = t ? faseDoTicket(parseStatuses(settings), t) : 'aberto'
  const rota = FASES.find((f) => f.id === fase)?.rota ?? '/abertos'
  // Chamado que não está mais na lista ativa (arquivado): a tela de concluídos o tem.
  const destino = id && !t ? '/concluidos' : rota
  return <Navigate to={`${destino}${id ? `?t=${id}` : ''}`} replace />
}

/** Página inicial: dashboard para quem pode; senão, direto para os chamados. */
function Inicio() {
  const perms = usePerms()
  if (perms.has('ver_dashboard')) return <Dashboard />
  if (perms.has('ver_chamados')) return <Navigate to="/abertos" replace />
  return <Navigate to="/configuracoes" replace />
}

export default function App() {
  const booted = useStore((s) => s.booted)
  const me = useStore((s) => s.me)
  const needsSetup = useStore((s) => s.needsSetup)
  const boot = useStore((s) => s.boot)
  const logout = useStore((s) => s.logout)

  useEffect(() => {
    boot()
    const onUnauthorized = () => logout()
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [boot, logout])

  if (!booted) {
    return (
      <div className="grid h-screen place-items-center bg-[var(--app-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-red-600">
            <img src="/logo.png" alt="Aexecutiva" className="h-12 w-12 object-contain" />
          </div>
          <div className="text-center">
            <div className="text-base font-semibold text-slate-100">Aexecutiva · Quality Work</div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Central de Chamados</div>
          </div>
          <Loader2 size={18} className="animate-spin text-slate-600" />
        </div>
      </div>
    )
  }
  if (!me && needsSetup) return <Setup />
  if (!me) return <Login />
  if (me.mustChangePassword) return <ForcePasswordChange />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
        {/* Uma tela por fase do chamado. `/chamados` e `/arquivados` continuam valendo
            (links antigos, notificações) e caem na tela certa. */}
        <Route path="/abertos" element={<Guarded perm="ver_chamados"><Chamados fase="aberto" /></Guarded>} />
        <Route path="/andamento" element={<Guarded perm="ver_chamados"><Chamados fase="andamento" /></Guarded>} />
        <Route path="/concluidos" element={<Guarded perm="ver_chamados"><Chamados fase="concluido" /></Guarded>} />
        <Route path="/chamados" element={<ParaOChamado />} />
        <Route path="/arquivados" element={<Navigate to="/concluidos" replace />} />
        <Route path="/registros" element={<Guarded perm="ver_registros"><Registros /></Guarded>} />
        <Route path="/pedidos" element={<Guarded perm="ver_pedidos"><Pedidos /></Guarded>} />
        <Route path="/relatorios" element={<Guarded perm="ver_relatorios"><Relatorios /></Guarded>} />
        <Route path="/locais" element={<Guarded perm="ver_locais"><Locais /></Guarded>} />
        <Route path="/usuarios" element={<Guarded perm="ver_usuarios"><Usuarios /></Guarded>} />
        <Route path="/auditoria" element={<Guarded perm="ver_auditoria"><Auditoria /></Guarded>} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        {/* Sem guarda: a ajuda existe para todo mundo — quem filtra o conteúdo é a permissão. */}
        <Route path="/ajuda" element={<Ajuda />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
