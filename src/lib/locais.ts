import type { TipoRegistroDef } from './types'

/**
 * TIPOS DE LOCAL: a etiqueta do cadastro — que tipo de lugar é este. Serve para achar na
 * lista comprida e para ler o relatório ("três condomínios e uma obra"). Vem do setting
 * `local_tipos`, editável na própria tela de Locais.
 */
export const TIPOS_LOCAL_PADRAO: TipoRegistroDef[] = [
  { key: 'condominio', label: 'Condomínio', color: '#38bdf8' },
  { key: 'comercial', label: 'Comercial', color: '#fbbf24' },
  { key: 'residencial', label: 'Residencial', color: '#34d399' },
  { key: 'obra', label: 'Obra', color: '#f472b6' },
]

export function parseTiposLocal(settings: Record<string, string>): TipoRegistroDef[] {
  try {
    const a = JSON.parse(settings['local_tipos'] || '')
    if (Array.isArray(a)) return a
  } catch { /* usa o padrão */ }
  return TIPOS_LOCAL_PADRAO
}

/**
 * O tipo de um local. Sem etiqueta é estado legítimo (cadastro antigo, ou tipo apagado):
 * devolve `null` em vez de inventar uma.
 */
export const tipoLocalDe = (tipos: TipoRegistroDef[], key?: string | null): TipoRegistroDef | null =>
  key ? tipos.find((t) => t.key === key) ?? { key, label: key, color: '#a1a1aa' } : null
