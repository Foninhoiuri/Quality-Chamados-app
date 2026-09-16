import type { TipoRegistro } from './types'

export const TIPO_REGISTRO: Record<TipoRegistro, { label: string; color: string }> = {
  ocorrencia: { label: 'Ocorrência', color: '#fbbf24' },
  solicitacao: { label: 'Solicitação', color: '#38bdf8' },
  informacao: { label: 'Informação', color: '#a1a1aa' },
}
export const TIPOS_REGISTRO = Object.keys(TIPO_REGISTRO) as TipoRegistro[]
export const tipoRegistroDe = (t: string) => TIPO_REGISTRO[t as TipoRegistro] ?? { label: t, color: '#a1a1aa' }
