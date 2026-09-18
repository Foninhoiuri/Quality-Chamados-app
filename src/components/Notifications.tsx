import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, Check, X, AlertTriangle, Cloud, Loader2 } from 'lucide-react'
import { useStore, useCurrentUser } from '@/lib/store'
import { notifStatus, requestNotifPermission, showNotification, isIOS, isStandalone, type NotifStatus } from '@/lib/notifications'
import { api } from '@/lib/api'
import { pushSupported, isPushSubscribed, enablePush, disablePush } from '@/lib/push'
import type { EventoNotificacao } from '@/lib/types'

const CHAVE_VISTO = (userId: string) => `chamados-notif-visto:${userId}`
const MAX_POPUPS = 5

/**
 * Pop-up do navegador derivado do SINO: só mostra o que ainda está por ler e é mais
 * novo que a última vez que notificou. Nada aparece na tela sem existir no sino.
 */
export function NotificationsManager() {
  const notifications = useStore((s) => s.notifications)
  const me = useCurrentUser()
  const userId = me?.id ?? null
  const visto = useRef<string | null>(null)

  useEffect(() => {
    try { visto.current = userId ? localStorage.getItem(CHAVE_VISTO(userId)) : null } catch { visto.current = null }
  }, [userId])

  useEffect(() => {
    if (!userId || notifications.length === 0) return
    const maisNova = notifications.reduce((max, n) => (n.ts > max ? n.ts : max), '')
    const marcar = () => {
      visto.current = maisNova
      try { localStorage.setItem(CHAVE_VISTO(userId), maisNova) } catch { /* sem storage */ }
    }
    // Primeiro acesso neste navegador: adota o que existe como visto (sem rajada de pop-ups).
    if (visto.current === null) return marcar()
    const novas = notifications.filter((n) => !n.read && n.ts > visto.current!).sort((a, b) => a.ts.localeCompare(b.ts))
    if (novas.length === 0) return
    marcar()
    for (const n of novas.slice(-MAX_POPUPS)) showNotification(n.title, n.body, n.url ?? '/')
  }, [notifications, userId])

  return null
}

/** Banner discreto para pedir permissão quando ainda está "default". */
export function NotificationsBanner() {
  const [status, setStatus] = useState<NotifStatus>(notifStatus())
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('chamados-notif-banner') === 'off' } catch { return false }
  })
  if (status !== 'default' || dismissed) return null
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200/90 print:hidden">
      <span className="flex items-center gap-2"><Bell size={14} /> Ative as notificações para saber quando um chamado seu andar.</span>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={async () => setStatus(await requestNotifPermission())} className="rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-sky-500">Ativar</button>
        <button
          onClick={() => { try { localStorage.setItem('chamados-notif-banner', 'off') } catch { /* sem storage */ } setDismissed(true) }}
          className="rounded p-1 text-slate-400 hover:text-slate-200"
          aria-label="Dispensar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

/** Controle completo em Configurações — pede permissão e mostra status/erros. */
export function NotificationsSetup() {
  const [status, setStatus] = useState<NotifStatus>(notifStatus())
  const iosNeedsInstall = isIOS() && !isStandalone()

  return (
    <div className="space-y-2">
      {status === 'unsupported' ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200/90">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Este navegador não suporta notificações.
            {iosNeedsInstall && ' No iPhone/iPad, instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.'}
          </span>
        </div>
      ) : status === 'granted' ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-300/90">
          <span className="flex items-center gap-2"><Check size={14} /> Notificações ativadas.</span>
          <button onClick={() => showNotification('Quality Chamados', 'Notificação de teste ✓')} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800">Testar</button>
        </div>
      ) : status === 'denied' ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px] text-red-300/90">
          <BellOff size={14} className="mt-0.5 shrink-0" />
          <span>Notificações bloqueadas. Habilite nas permissões do site (cadeado ao lado do endereço) e recarregue.</span>
        </div>
      ) : (
        <button onClick={async () => setStatus(await requestNotifPermission())} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-200 hover:border-red-700 hover:bg-red-500/5">
          <Bell size={15} className="text-slate-400" /> Ativar notificações do navegador
        </button>
      )}
      {status === 'granted' && <PushToggle />}
      <PreferenciasNotificacao />
    </div>
  )
}

/**
 * Sobre O QUE avisar. Vale para o sino, o pop-up e o push — o filtro é do servidor, então
 * o que está desligado aqui não chega por caminho nenhum.
 */
function PreferenciasNotificacao() {
  const me = useCurrentUser()
  const updateProfile = useStore((s) => s.updateProfile)
  const showToast = useStore((s) => s.showToast)
  const [eventos, setEventos] = useState<EventoNotificacao[] | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api.notifEvents().then((r) => { if (vivo) setEventos(r) }).catch(() => { if (vivo) setEventos([]) })
    return () => { vivo = false }
  }, [])

  const prefs = me?.notifPrefs ?? {}
  const ligado = (id: string) => prefs[id] !== false

  async function alternar(id: string) {
    const proximo = { ...prefs, [id]: !ligado(id) }
    setSalvando(id)
    try { await updateProfile({ notifPrefs: proximo }) } catch { showToast('Não foi possível salvar a preferência') } finally { setSalvando(null) }
  }

  if (!eventos?.length) return null
  const desligados = eventos.filter((e) => !ligado(e.id)).length

  return (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-slate-200"><Bell size={15} className="text-slate-400" /> Sobre o que me avisar</span>
        {desligados > 0 && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{desligados} desligado(s)</span>}
      </div>
      <div className="space-y-1">
        {eventos.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 py-0.5">
            <span className={`text-[12px] ${ligado(e.id) ? 'text-slate-300' : 'text-slate-500 line-through'}`}>{e.label}</span>
            <button
              role="switch"
              aria-checked={ligado(e.id)}
              aria-label={e.label}
              onClick={() => alternar(e.id)}
              disabled={salvando === e.id}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${ligado(e.id) ? 'bg-red-600' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${ligado(e.id) ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Vale para o sino, o pop-up e o push. Desligado aqui, não chega por nenhum deles.</p>
    </div>
  )
}

/** Web push do servidor: recebe aviso de chamado mesmo com o app fechado. */
function PushToggle() {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { isPushSubscribed().then(setOn) }, [])

  async function toggle() {
    setBusy(true); setError(null)
    try {
      if (on) { await disablePush(); setOn(false) }
      else { const ok = await enablePush(); setOn(ok); if (!ok) setError('Não foi possível ativar o push neste dispositivo.') }
    } catch {
      setError('Falha ao configurar o push do servidor.')
    } finally {
      setBusy(false)
    }
  }

  if (!pushSupported()) return null
  return (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-slate-200"><Cloud size={15} className="text-slate-400" /> Push do servidor</span>
        <button role="switch" aria-checked={!!on} onClick={toggle} disabled={busy || on === null} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-red-600' : 'bg-slate-700'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="text-[11px] text-slate-500">Recebe aviso de chamado novo, pego, concluído ou comentado mesmo com o app fechado.</p>
      {on && (
        <button onClick={() => api.pushTest().catch(() => {})} className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />} Enviar push de teste
        </button>
      )}
      {error && <div className="text-[11px] text-red-400">{error}</div>}
    </div>
  )
}
