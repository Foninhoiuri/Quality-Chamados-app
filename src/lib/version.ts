/** Versão do app, vinda do `version` do package.json (injetada pelo Vite). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

/** "1.1.0" → "v1.1" */
export const versaoCurta = (v = APP_VERSION) => `v${v.split('.').slice(0, 2).join('.')}`

export const BUILD_AT: string = typeof __BUILD_AT__ === 'string' ? __BUILD_AT__ : ''

export function buildEmTexto(): string {
  if (!BUILD_AT) return ''
  const d = new Date(BUILD_AT)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR')
}
