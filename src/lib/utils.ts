import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const iniciais = (nome: string) =>
  nome.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/** "16/09 14:30" */
export function fmtDataHora(ts?: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 150 → "2h 30min"; 45 → "45min"; 0 → "0h" */
export function fmtMinutos(min?: number | null) {
  const m = Math.max(0, Math.round(min ?? 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h && !r) return '0h'
  if (!h) return `${r}min`
  return r ? `${h}h ${String(r).padStart(2, '0')}min` : `${h}h`
}

/** "YYYY-MM-DD" de hoje no fuso de quem está usando. */
export function hojeIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "há 5 min", "há 3 h", "há 2 d" */
export function tempoAtras(ts: string | number) {
  const m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000))
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.round(h / 24)} d`
}

/** Redimensiona a imagem escolhida (lado maior ≤ `max`, JPEG) e devolve uma data URL leve. */
export function imagemParaDataUrl(file: File, max = 1280, quadrado = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        if (quadrado) {
          canvas.width = max
          canvas.height = max
          const s = Math.max(max / img.width, max / img.height)
          const w = img.width * s, h = img.height * s
          ctx.drawImage(img, (max - w) / 2, (max - h) / 2, w, h)
        } else {
          const s = Math.min(1, max / Math.max(img.width, img.height))
          canvas.width = Math.round(img.width * s)
          canvas.height = Math.round(img.height * s)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
