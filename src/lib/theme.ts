export type Theme = 'dark' | 'light'
const KEY = 'quality-chamados-theme'

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Aplica o tema no <html data-theme> e persiste. O CSS (index.css) faz o resto. */
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* navegador sem storage: vale só nesta aba */
  }
}
