export type NotifStatus = 'unsupported' | 'default' | 'granted' | 'denied'

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export function notifStatus(): NotifStatus {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as NotifStatus
}

/** Pede permissão de notificação (precisa de gesto do usuário). */
export async function requestNotifPermission(): Promise<NotifStatus> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return (await Notification.requestPermission()) as NotifStatus
  } catch {
    return 'denied'
  }
}

/** Mostra uma notificação local (via service worker se possível). */
export async function showNotification(title: string, body?: string, url = '/') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const opts: NotificationOptions = { body, icon: '/icon-192.png', badge: '/icon-192.png', data: url } as any
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null
    if (reg) await reg.showNotification(title, opts)
    else new Notification(title, opts)
  } catch {
    /* silencioso */
  }
}
