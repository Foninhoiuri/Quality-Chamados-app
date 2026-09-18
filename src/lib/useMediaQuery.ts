import { useEffect, useState } from 'react'

/** Reage a uma media query (o layout do celular às vezes muda o comportamento, não só o CSS). */
export function useMediaQuery(query: string): boolean {
  const [bate, setBate] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const ouvir = (e: MediaQueryListEvent) => setBate(e.matches)
    setBate(mq.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [query])
  return bate
}

/** `true` abaixo de 640px — onde o dedo manda e a tela é estreita. */
export const useMobile = () => useMediaQuery('(max-width: 639px)')
