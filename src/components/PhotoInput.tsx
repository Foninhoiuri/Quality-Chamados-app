import { useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Upload, X } from 'lucide-react'
import { api, assetUrl } from '@/lib/api'
import { useStore } from '@/lib/store'
import { useMobile } from '@/lib/useMediaQuery'
import { imagemParaDataUrl } from '@/lib/utils'

/**
 * Fotos do chamado. Somente leitura quando não recebe `onChange`.
 *
 * Como se põe uma foto aqui depende de onde a pessoa está: no celular, o que ela quer é
 * ABRIR A CÂMERA (está no local, com o problema na frente) — e, às vezes, pegar o que já
 * fotografou. No computador ela arrasta do explorador de arquivos. Um botão só, "escolher
 * arquivo", obrigava o técnico a fotografar, sair do app, entrar na galeria e procurar.
 */
export function PhotoInput({ photos, onChange, max = 12 }: { photos: string[]; onChange?: (p: string[]) => void; max?: number }) {
  const camera = useRef<HTMLInputElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const showToast = useStore((s) => s.showToast)
  const mobile = useMobile()

  async function enviar(files: File[]) {
    const imagens = files.filter((f) => f.type.startsWith('image/'))
    if (!imagens.length) return
    setBusy(true)
    const next = [...photos]
    let falhas = 0
    for (const f of imagens) {
      if (next.length >= max) break
      try {
        const { url } = await api.upload(await imagemParaDataUrl(f))
        next.push(url)
      } catch { falhas++ }
    }
    if (falhas) showToast(`${falhas} imagem(ns) não puderam ser enviadas`)
    if (imagens.length > max - photos.length) showToast(`Só cabem ${max} fotos aqui`)
    onChange?.(next.slice(0, max))
    setBusy(false)
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await enviar(files)
  }

  const cheio = photos.length >= max

  return (
    <>
      <div className="space-y-2">
        {photos.length > 0 && (
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
          </div>
        )}

        {!onChange && photos.length === 0 && <span className="text-[12px] text-slate-600">sem fotos</span>}

        {onChange && (cheio ? (
          <span className="text-[11px] text-slate-600">máximo de {max} fotos</span>
        ) : (
          <div
            // Arrastar do explorador de arquivos é o gesto do computador — e o alvo é a
            // caixa inteira, não um quadradinho de 64px.
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); enviar(Array.from(e.dataTransfer.files ?? [])) }}
            className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-2 transition-colors ${
              arrastando ? 'border-red-600 bg-red-500/10' : 'border-slate-700'
            }`}
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> enviando…</span>
            ) : (
              <>
                {mobile && (
                  <button
                    type="button"
                    onClick={() => camera.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[12px] font-medium text-slate-100 hover:bg-slate-700"
                  >
                    <Camera size={14} /> Tirar foto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => arquivo.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800"
                >
                  <ImagePlus size={14} /> {mobile ? 'Galeria' : 'Escolher fotos'}
                </button>
                <span className="hidden items-center gap-1 text-[11px] text-slate-500 sm:inline-flex">
                  <Upload size={11} /> ou arraste as fotos aqui
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Dois inputs: um abre a câmera de trás, o outro deixa escolher o que já existe. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
      <input ref={arquivo} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />

      {preview && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <img src={assetUrl(preview)} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  )
}
