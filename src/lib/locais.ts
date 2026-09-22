import type { Local, TipoRegistroDef } from './types'

/**
 * TIPOS DE LOCAL: a etiqueta do cadastro — que tipo de lugar é este. Serve para achar na
 * lista comprida e para ler o relatório ("três condomínios e uma obra"). Vem do setting
 * `local_tipos`, editável na própria tela de Locais.
 */
export const TIPOS_LOCAL_PADRAO: TipoRegistroDef[] = [
  { key: 'condominio', label: 'Condomínio', color: '#38bdf8', abrev: 'COND' },
  { key: 'comercial', label: 'Comercial', color: '#fbbf24', abrev: 'COM' },
  { key: 'residencial', label: 'Residencial', color: '#34d399', abrev: 'RES' },
  { key: 'obra', label: 'Obra', color: '#f472b6', abrev: 'OBRA' },
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

/** Como o tipo aparece DENTRO do chamado: a sigla, ou as 4 primeiras letras do nome. */
export const siglaDoTipo = (t: TipoRegistroDef) => (t.abrev?.trim() || t.label.slice(0, 4)).toUpperCase()

/** Um endereço em partes. Serve para o cadastro e para qualquer coisa parecida com um local. */
type PartesDoEndereco = Pick<Local, 'address' | 'city'> & Partial<Pick<Local, 'number' | 'complement' | 'cep'>>

/**
 * A RUA COM O NÚMERO: "Rua Bérgamo, 15". É o que o mapa entende e o que se lê primeiro —
 * o complemento ("fundos", "bloco B") fica de fora porque atrapalha a busca.
 */
export const ruaComNumero = (l?: Partial<PartesDoEndereco> | null) =>
  [l?.address, l?.number].filter(Boolean).join(', ')

/** O endereço como se escreve num papel: rua, número, complemento, cidade e CEP. */
export function enderecoDoLocal(l?: Partial<PartesDoEndereco> | null, comComplemento = true): string {
  if (!l) return ''
  const rua = [ruaComNumero(l), comComplemento ? l.complement : ''].filter(Boolean).join(' - ')
  return [rua, l.city, l.cep].filter(Boolean).join(', ')
}
