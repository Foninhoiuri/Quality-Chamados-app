import { useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, ExternalLink, FileText, ImagePlus, Loader2, Upload, X } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { assetUrl } from '@/lib/api'
import { useStore } from '@/lib/store'
import { useMobile } from '@/lib/useMediaQuery'
import { imagemParaDataUrl } from '@/lib/utils'

export const ehPdf = (c: string) => c.startsWith('data:application/pdf') || c.endsWith('.pdf')
export const urlDo = (c: string) => (c.startsWith('data:') ? c : assetUrl(c))

function lerArquivo(f: File): Promise<string> {
  // Imagem é reduzida (foto de celular tem 8 MB); PDF vai como está.
  if (f.type.startsWith('image/')) return imagemParaDataUrl(f, 1600)
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

/**
 * Prévia do comprovante sem sair do painel: imagem em tela, PDF num quadro — nada de
 * baixar arquivo para conferir um pagamento.
 */
export function PreviaComprovante({ lista, inicio = 0, onClose }: { lista: string[]; inicio?: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(inicio, lista.length - 1))
  const atual = lista[i]
  if (!atual) return null
  return (
    <Modal
      open
      wide
      telaCheia
      onClose={onClose}
      title={lista.length > 1 ? `Comprovante ${i + 1} de ${lista.length}` : 'Comprovante'}
      footer={
        <>
          {lista.length > 1 && (
            <>
              <Button variant="subtle" onClick={() => setI((i - 1 + lista.length) % lista.length)} aria-label="Anterior"><ChevronLeft size={14} /></Button>
              <Button variant="subtle" onClick={() => setI((i + 1) % lista.length)} aria-label="Próximo"><ChevronRight size={14} /></Button>
            </>
          )}
          <a href={urlDo(atual)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
            <ExternalLink size={14} /> Abrir em outra aba
          </a>
          <Button onClick={onClose}>Fechar</Button>
        </>
      }
    >
      {ehPdf(atual) ? (
        <iframe src={urlDo(atual)} title="Comprovante em PDF" className="h-[70vh] w-full rounded-lg border border-slate-800 bg-white" />
      ) : (
        <img src={urlDo(atual)} alt="Comprovante" className="mx-auto max-h-[70vh] rounded-lg object-contain" />
      )}
    </Modal>
  )
}

/**
 * Comprovante de pagamento: foto ou PDF. A mesma caixa das fotos do chamado — no celular
 * abre a câmera, no computador arrasta o arquivo —, só que aceitando PDF também.
 * Sem `onChange` é só leitura; tocar abre a prévia.
 */
export function Comprovantes({ lista, onChange }: { lista: string[]; onChange?: (l: string[]) => void }) {
  const camera = useRef<HTMLInputElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const [lendo, setLendo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [previa, setPrevia] = useState<number | null>(null)
  const showToast = useStore((s) => s.showToast)
  const mobile = useMobile()

  async function receber(files: File[]) {
    if (!files.length || !onChange) return
    setLendo(true)
    const novos: string[] = []
    for (const f of files) {
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') { showToast(`${f.name}: envie imagem ou PDF`); continue }
      if (f.size > 15 * 1024 * 1024) { showToast(`${f.name} passa de 15 MB`); continue }
      try { novos.push(await lerArquivo(f)) } catch { showToast(`Não foi possível ler ${f.name}`) }
    }
    onChange([...lista, ...novos].slice(0, 10))
    setLendo(false)
  }
  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; receber(f) }

  return (
    <div className="space-y-2">
      {lista.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {lista.map((c, i) => (
            <div key={i} className="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setPrevia(i) }} title="Ver comprovante">
                {ehPdf(c) ? (
                  <span className="flex h-14 w-14 flex-col items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-[10px] text-slate-300"><FileText size={18} className="text-red-400" /> PDF</span>
                ) : (
                  <img src={urlDo(c)} alt={`Comprovante ${i + 1}`} className="h-14 w-14 rounded-md border border-slate-700 object-cover" />
                )}
              </button>
              {onChange && (
                <button type="button" onClick={() => onChange(lista.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-red-600 hover:text-white" aria-label="Remover comprovante">
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {onChange && (
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(Array.from(e.dataTransfer.files ?? [])) }}
          className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-2 transition-colors ${arrastando ? 'border-red-600 bg-red-500/10' : 'border-slate-700'}`}
        >
          {lendo ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> lendo…</span>
          ) : (
            <>
              {mobile && (
                <button type="button" onClick={() => camera.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[12px] font-medium text-slate-100 hover:bg-slate-700">
                  <Camera size={14} /> Tirar foto
                </button>
              )}
              <button type="button" onClick={() => arquivo.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800">
                <ImagePlus size={14} /> {mobile ? 'Foto ou PDF' : 'Escolher foto ou PDF'}
              </button>
              <span className="hidden items-center gap-1 text-[11px] text-slate-500 sm:inline-flex"><Upload size={11} /> ou arraste o comprovante aqui</span>
            </>
          )}
        </div>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={escolher} className="hidden" />
      <input ref={arquivo} type="file" accept="image/*,application/pdf" multiple onChange={escolher} className="hidden" />

      {previa !== null && <PreviaComprovante lista={lista} inicio={previa} onClose={() => setPrevia(null)} />}
    </div>
  )
}
