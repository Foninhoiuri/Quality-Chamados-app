import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import { MapPin, Loader2, Search, Crosshair } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { Button, Modal } from './ui'
import { api } from '@/lib/api'
import type { SugestaoEndereco } from '@/lib/types'

/**
 * Campo de endereço com sugestões, como no GPS: digita a rua, escolhe na lista e o pino
 * já nasce no lugar certo — ninguém precisa saber o que é latitude.
 */
export function BuscaEndereco({ value, onChange, onEscolher, placeholder }: {
  value: string
  onChange: (v: string) => void
  /** Sugestão escolhida: traz endereço, cidade e a coordenada do pino. */
  onEscolher: (s: SugestaoEndereco) => void
  placeholder?: string
}) {
  const [sugestoes, setSugestoes] = useState<SugestaoEndereco[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(false)
  // Só procura o que a PESSOA digitou. A rua que o CEP preencheu (ou a sugestão que ela
  // acabou de escolher) já está certa — abrir a lista ali obrigava a escolher de novo.
  const digitou = useRef(false)

  useEffect(() => {
    const doUsuario = digitou.current
    digitou.current = false
    if (!doUsuario) { setSugestoes([]); setAberto(false); return }
    const termo = value.trim()
    if (termo.length < 4) { setSugestoes([]); return }
    // Espera a digitação parar: o serviço de endereços é gentil, não se bate nele a cada tecla.
    let vivo = true
    const id = setTimeout(async () => {
      setBuscando(true)
      try {
        const r = await api.sugestoesEndereco(termo)
        // O campo mudou enquanto a busca ia (o CEP preencheu, por ex.): resposta velha não abre lista.
        if (!vivo) return
        setSugestoes(r)
        setAberto(true)
      } catch {
        if (vivo) setSugestoes([])
      } finally {
        setBuscando(false)
      }
    }, 500)
    return () => { vivo = false; clearTimeout(id) }
  }, [value])

  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
      <input
        value={value}
        onChange={(e) => { digitou.current = true; onChange(e.target.value) }}
        onFocus={() => sugestoes.length && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder={placeholder ?? 'Rua, número, bairro'}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-8 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-red-500"
      />
      {buscando && <Loader2 size={14} className="absolute right-2.5 top-2.5 animate-spin text-slate-500" />}

      {aberto && sugestoes.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {sugestoes.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onEscolher(s)
                  setAberto(false)
                  setSugestoes([])
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-800"
              >
                <MapPin size={13} className="mt-0.5 shrink-0 text-red-400" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-slate-100">{s.address || s.descricao}</span>
                  <span className="block truncate text-[11px] text-slate-500">{s.city || s.descricao}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Acompanha o centro do mapa enquanto ele é arrastado — o pino fica parado no meio. */
function SeguirCentro({ onMover }: { onMover: (c: { lat: number; lng: number }) => void }) {
  const map = useMapEvents({
    move: () => { const c = map.getCenter(); onMover({ lat: c.lat, lng: c.lng }) },
  })
  return null
}

/**
 * Ajuste fino do pino: o mapa se move debaixo de um pino fixo no centro. É mais fácil
 * arrastar o mapa até o portão certo do que descrever o endereço com precisão.
 */
export function SeletorPino({ inicial, nome, onCancelar, onConfirmar }: {
  inicial: { lat: number; lng: number } | null
  nome?: string
  onCancelar: () => void
  onConfirmar: (c: { lat: number; lng: number }) => void
}) {
  // Sem ponto de partida, abre no centro do país — arrastar dali ainda é possível.
  const partida = inicial ?? { lat: -15.78, lng: -47.93 }
  const [centro, setCentro] = useState(partida)

  return (
    <Modal
      open
      wide
      onClose={onCancelar}
      title={nome ? `Onde fica ${nome}` : 'Marcar no mapa'}
      footer={
        <>
          <Button variant="subtle" onClick={onCancelar}>Cancelar</Button>
          <Button onClick={() => onConfirmar(centro)}><Crosshair size={14} /> Usar este ponto</Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-[12px] text-slate-400">Arraste o mapa até o pino ficar em cima do lugar certo.</p>
        <div className="relative h-[52vh] min-h-[280px] overflow-hidden rounded-xl border border-slate-800">
          <MapContainer center={[partida.lat, partida.lng]} zoom={inicial ? 17 : 4} scrollWheelZoom className="h-full w-full" style={{ background: '#0f172a' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <SeguirCentro onMover={setCentro} />
          </MapContainer>
          {/* O pino não é do mapa: fica cravado no meio da moldura, por cima. */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
            <MapPin size={38} className="drop-shadow-[0_2px_4px_rgba(0,0,0,.6)]" style={{ color: '#ef4444', fill: '#ef4444aa' }} />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
        </div>
        <div className="text-center font-mono text-[11px] text-slate-500">{centro.lat.toFixed(5)}, {centro.lng.toFixed(5)}</div>
      </div>
    </Modal>
  )
}
