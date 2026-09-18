import type { TipoRegistroDef } from './types'

/** Rede de segurança: as categorias que existiam antes de serem configuráveis. */
export const TIPOS_REGISTRO_PADRAO: TipoRegistroDef[] = [
  { key: 'ocorrencia', label: 'Ocorrência', color: '#fbbf24' },
  { key: 'solicitacao', label: 'Solicitação', color: '#38bdf8' },
  { key: 'informacao', label: 'Informação', color: '#a1a1aa' },
]

/** Categorias vêm do setting `registro_tipos` (gerenciáveis na tela de Registros). */
export function parseTiposRegistro(settings: Record<string, string>): TipoRegistroDef[] {
  try {
    const a = JSON.parse(settings['registro_tipos'] || '')
    if (Array.isArray(a) && a.length) return a
  } catch { /* usa o padrão */ }
  return TIPOS_REGISTRO_PADRAO
}

/** Categoria de um registro; a que foi apagada ainda aparece, com o nome que sobrou. */
export const tipoRegistroDe = (tipos: TipoRegistroDef[], key: string): TipoRegistroDef =>
  tipos.find((t) => t.key === key) ?? { key, label: key, color: '#a1a1aa' }

/** Cores sugeridas ao criar uma categoria — mesma paleta do resto do app. */
export const CORES_CATEGORIA = ['#fbbf24', '#38bdf8', '#34d399', '#f87171', '#a78bfa', '#f472b6', '#a1a1aa']
