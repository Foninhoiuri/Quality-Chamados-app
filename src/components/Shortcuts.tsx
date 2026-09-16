import { useEffect } from 'react'
import { useStore } from '@/lib/store'

/**
 * Atalhos de teclado:
 * - Ctrl/⌘+Shift+A → novo item na tela atual (evento `shortcut:new`)
 * - /               → focar a busca da tela
 * - Ctrl/⌘+Shift+L → alternar tema claro/escuro
 */
export function ShortcutsListener() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      const typing = /^(input|textarea|select)$/i.test(target?.tagName || '') || !!target?.isContentEditable
      if (typing) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && e.shiftKey && k === 'a') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('shortcut:new'))
      } else if (mod && e.shiftKey && k === 'l') {
        e.preventDefault()
        const s = useStore.getState()
        s.setTheme(s.theme === 'dark' ? 'light' : 'dark')
      } else if (!mod && k === '/') {
        const busca = document.querySelector<HTMLInputElement>('input[data-busca]')
        if (busca) {
          e.preventDefault()
          busca.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6" role="status">
      <div className="pointer-events-auto rounded-lg border border-slate-700 bg-slate-900/95 px-3.5 py-2 text-sm text-slate-100 shadow-xl backdrop-blur">{toast}</div>
    </div>
  )
}
