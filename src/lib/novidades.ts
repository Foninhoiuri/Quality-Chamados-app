import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Novidades } from './types'

/**
 * Pontinho de "tem coisa nova aqui" na barra de navegação. A regra é simples: o servidor
 * diz qual é o fato mais recente de cada área, o app guarda quando a pessoa esteve lá pela
 * última vez, e a diferença acende o ponto. Vale sem notificação nenhuma e se atualiza
 * sozinho, junto com o resto do ciclo de 12s.
 */

export type AreaNovidade = keyof Novidades

/** Cada rota da barra e a área que ela representa. */
export const AREA_DA_ROTA: Record<string, AreaNovidade> = {
  '/abertos': 'abertos',
  '/andamento': 'andamento',
  '/concluidos': 'concluidos',
  '/registros': 'registros',
}

const CHAVE = (userId: string) => `chamados-visto-em:${userId}`
const VAZIO: Novidades = { abertos: 0, andamento: 0, concluidos: 0, registros: 0 }

function lerVisto(userId: string): Partial<Record<AreaNovidade, number>> {
  try {
    const raw = localStorage.getItem(CHAVE(userId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function useNovidades(userId: string | undefined, ativo: boolean) {
  const [remoto, setRemoto] = useState<Novidades>(VAZIO)
  const [visto, setVisto] = useState<Partial<Record<AreaNovidade, number>>>({})

  useEffect(() => { setVisto(userId ? lerVisto(userId) : {}) }, [userId])

  const buscar = useCallback(() => {
    if (!ativo) return
    api.novidades().then(setRemoto).catch(() => {})
  }, [ativo])

  useEffect(() => { buscar() }, [buscar])

  /** Marca a área como vista agora — some o ponto dela. */
  const marcarVisto = useCallback((area: AreaNovidade) => {
    if (!userId) return
    setVisto((atual) => {
      const proximo = { ...atual, [area]: Date.now() }
      try { localStorage.setItem(CHAVE(userId), JSON.stringify(proximo)) } catch { /* sem storage */ }
      return proximo
    })
  }, [userId])

  /**
   * Primeira visita neste navegador: sem marco, tudo pareceria novo. Nesse caso o ponto
   * só aparece a partir da próxima novidade.
   */
  const temNovidade = useCallback((area: AreaNovidade) => {
    const marco = visto[area]
    if (!marco) return false
    return remoto[area] > marco
  }, [remoto, visto])

  return { buscar, marcarVisto, temNovidade }
}
