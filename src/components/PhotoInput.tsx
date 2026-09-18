import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { api, assetUrl } from '@/lib/api'
import { useStore } from '@/lib/store'
import { imagemParaDataUrl } from '@/lib/utils'

/** Grade de fotos com upload (câmera no celular) e remoção. Somente leitura se `onChange` ausente. */
export function PhotoInput({ photos, onChange, max = 12 }: { photos: string[]; onChange?: (p: string[]) => void; max?: number }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const showToast = useStore((s) => s.showToast)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    const next = [...photos]
    let falhas = 0
    for (const f of files) {
      if (!f.type.startsWith('image/') || next.length >= max) continue
      try {
        const { url } = await api.upload(await imagemParaDataUrl(f))
        next.push(url)
      } catch { falhas++ }
    }
    if (falhas) showToast(`${falhas} imagem(ns) não puderam ser enviadas`)
    onChange?.(next.slice(0, max))
    setBusy(false)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div key={src} className="relative h-16 w-16">
            <img src={assetUrl(src)} alt={`Foto ${i + 1}`} onClick={() => setPreview(src)} className="h-16 w-16 cursor-zoom-in rounded-md border border-slate-800 object-cover" />
            {onChange && (
              <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-red-600 hover:text-white" aria-label="Remover foto">
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        {onChange && photos.length >= max && <span className="self-center text-[11px] text-slate-600">máximo de {max} fotos</span>}
        {onChange && photos.length < max && (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-slate-700 text-slate-500 hover:border-red-700 hover:text-slate-300 disabled:opacity-50" aria-label="Adicionar foto">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          </button>
        )}
        {!onChange && photos.length === 0 && <span className="text-[12px] text-slate-600">sem fotos</span>}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
      {preview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <img src={assetUrl(preview)} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  )
}
