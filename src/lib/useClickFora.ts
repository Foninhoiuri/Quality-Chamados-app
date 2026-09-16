import { useEffect, type RefObject } from 'react'

/**
 * Fecha um menu ao clicar fora dele ou apertar Esc.
 *
 * Ouve no documento em vez de usar overlay `fixed inset-0`: o header tem
 * `backdrop-blur`, que vira containing block de descendentes `fixed` — o overlay
 * cobriria só a faixa do header.
 */
export function useClickFora(ref: RefObject<HTMLElement | null>, ativo: boolean, fechar: () => void) {
  useEffect(() => {
    if (!ativo) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const alvo = e.target as Node | null
      if (alvo && ref.current && !ref.current.contains(alvo)) fechar()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('touchstart', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('touchstart', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, ativo, fechar])
}
