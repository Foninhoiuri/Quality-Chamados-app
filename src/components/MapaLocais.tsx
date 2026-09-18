import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '@/lib/store'
import type { Local } from '@/lib/types'

/** Centro do Brasil: só serve enquanto não se sabe nada melhor. */
const BRASIL: [number, number] = [-15.78, -47.93]
/** Raio que conta como "perto de mim" ao enquadrar o mapa. */
const PERTO_KM = 30

/** Distância aproximada em km — o suficiente para dizer o que está perto. */
function distanciaKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * O pino é uma plaquinha: nome do local e quantos chamados, legíveis sem clicar. Pino
 * genérico obriga a abrir um por um para saber qual é qual.
 */
function placa(l: Local, selecionado: boolean): L.DivIcon {
  const ativos = l.ticketsAtivos ?? 0
  const andamento = l.ticketsAndamento ?? 0
  const quente = ativos > 0
  const borda = selecionado ? '#f87171' : quente ? 'rgba(239,68,68,.55)' : 'rgba(148,163,184,.35)'
  const fundo = quente ? 'rgba(69,10,10,.96)' : 'rgba(15,23,42,.96)'
  const nome = (l.name || '').slice(0, 22)
  const contagem = quente
    ? `<span style="color:#fca5a5;font-weight:600">${ativos}</span><span style="color:#94a3b8"> ativo${ativos > 1 ? 's' : ''}${andamento ? ` · ${andamento} em atend.` : ''}</span>`
    : '<span style="color:#64748b">sem chamado</span>'

  return L.divIcon({
    className: 'placa-local',
    html: `
      <div style="
        position:relative;display:inline-block;padding:5px 8px;border-radius:8px;
        background:${fundo};border:1px solid ${borda};box-shadow:0 4px 12px rgba(0,0,0,.5);
        font:500 11px/1.25 system-ui,-apple-system,sans-serif;white-space:nowrap;
        transform:translateY(-6px);${selecionado ? 'outline:2px solid rgba(248,113,113,.45);outline-offset:1px;' : ''}">
        <div style="color:#e2e8f0;font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis">${nome}</div>
        <div style="font-size:10px;margin-top:1px">${contagem}</div>
        <span style="
          position:absolute;left:12px;bottom:-5px;width:9px;height:9px;background:${fundo};
          border-right:1px solid ${borda};border-bottom:1px solid ${borda};transform:rotate(45deg)"></span>
      </div>`,
    // Sem `iconSize`: a plaquinha tem a largura do nome que está dentro dela.
    iconAnchor: [14, 8],
    popupAnchor: [40, -10],
  })
}

/** O ponto "você está aqui". */
const pinoEu = L.divIcon({
  className: 'pino-eu',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#38bdf8;border:2px solid #0f172a;box-shadow:0 0 0 4px rgba(56,189,248,.25)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

/**
 * O mapa nasce dentro de um container escondido (no celular, atrás do botão "Mapa"), e
 * aí o Leaflet mede zero e não pede um único tile. Observar o tamanho e reavisá-lo é o
 * que faz o mapa aparecer quando a aba vira.
 */
function AjustarTamanho() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const observador = new ResizeObserver(() => map.invalidateSize())
    observador.observe(el)
    const id = setTimeout(() => map.invalidateSize(), 150)
    return () => { observador.disconnect(); clearTimeout(id) }
  }, [map])
  return null
}

/**
 * Enquadramento: com a localização em mãos, o mapa abre em volta de quem está usando, com
 * os locais próximos cabendo na tela. Sem ela, mostra todos os pontos.
 */
function Enquadrar({ pontos, eu, foco }: { pontos: [number, number][]; eu: [number, number] | null; foco: [number, number] | null }) {
  const map = useMap()
  const jaEnquadrou = useRef(false)

  useEffect(() => {
    if (foco) { map.flyTo(foco, Math.max(map.getZoom(), 16), { duration: 0.6 }); return }
    if (jaEnquadrou.current) return

    const aplicar = () => {
      // Container ainda escondido (a aba "Mapa" fechada): medir agora daria um
      // enquadramento no vazio, e ele nunca mais seria refeito.
      if (map.getSize().x === 0) return false
      if (eu) {
        const perto = pontos.filter((p) => distanciaKm(eu, p) <= PERTO_KM)
        if (perto.length) map.fitBounds(L.latLngBounds([eu, ...perto]), { padding: [56, 56], maxZoom: 16 })
        else map.setView(eu, 12)
        return true
      }
      if (pontos.length === 0) return false
      // Locais no mesmo endereço fariam o fitBounds colar no zoom máximo, e aí o mapa
      // vira um quarteirão sem referência nenhuma.
      if (pontos.length === 1) map.setView(pontos[0], 15)
      else map.fitBounds(L.latLngBounds(pontos), { padding: [56, 56], maxZoom: 16 })
      return true
    }

    if (aplicar()) { jaEnquadrou.current = true; return }
    const aoRedimensionar = () => { if (aplicar()) { jaEnquadrou.current = true; map.off('resize', aoRedimensionar) } }
    map.on('resize', aoRedimensionar)
    return () => { map.off('resize', aoRedimensionar) }
  }, [map, pontos, eu, foco])

  return null
}

export function MapaLocais({ locais, selecionado, onSelecionar }: {
  locais: Local[]
  selecionado: string | null
  onSelecionar: (id: string) => void
}) {
  const tema = useStore((s) => s.theme)
  const comPino = useMemo(() => locais.filter((l) => l.lat != null && l.lng != null), [locais])
  const pontos = useMemo(() => comPino.map((l) => [l.lat as number, l.lng as number] as [number, number]), [comPino])
  const alvo = comPino.find((l) => l.id === selecionado)
  const foco: [number, number] | null = alvo ? [alvo.lat as number, alvo.lng as number] : null

  // Onde a pessoa está: o mapa abre na região dela, com os locais perto à volta.
  const [eu, setEu] = useState<[number, number] | null>(null)
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setEu([p.coords.latitude, p.coords.longitude]),
      () => { /* recusou ou falhou: fica o enquadramento pelos pontos */ },
      { timeout: 8000, maximumAge: 600000 },
    )
  }, [])

  // Base: OpenStreetMap, que é livre. O tema escuro é feito no CSS, invertendo e
  // dessaturando a base — nada de serviço de mapa pago.
  const escuro = tema !== 'light'

  return (
    <div className="relative h-full">
      {comPino.length === 0 && (
        <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-center text-[11px] text-slate-300 shadow-lg">
          Nenhum local no mapa ainda. Preencha o CEP e o endereço do local — ou use “Localizar no mapa” no cartão dele.
        </div>
      )}
      <MapContainer
        center={eu ?? pontos[0] ?? BRASIL}
        zoom={eu ? 13 : pontos.length ? 13 : 4}
        scrollWheelZoom
        className="h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-slate-800"
        style={{ background: escuro ? '#0b1120' : '#e2e8f0' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          className={escuro
            ? '[filter:invert(1)_hue-rotate(185deg)_brightness(1.02)_contrast(.86)_saturate(.45)]'
            : '[filter:saturate(.7)_contrast(.95)]'}
        />
        <AjustarTamanho />
        <Enquadrar pontos={pontos} eu={eu} foco={foco} />

        {eu && (
          <Marker position={eu} icon={pinoEu}>
            <Popup><span style={{ fontSize: 12 }}>Você está aqui</span></Popup>
          </Marker>
        )}

        {comPino.map((l) => (
          <Marker
            key={l.id}
            position={[l.lat as number, l.lng as number]}
            icon={placa(l, l.id === selecionado)}
            eventHandlers={{ click: () => onSelecionar(l.id) }}
          >
            <Popup>
              <div style={{ minWidth: 150 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                {(l.address || l.city) && <div style={{ fontSize: 11, color: '#475569' }}>{[l.address, l.city].filter(Boolean).join(', ')}</div>}
                {l.cep && <div style={{ fontSize: 11, color: '#94a3b8' }}>CEP {l.cep}</div>}
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <strong>{l.ticketsAtivos ?? 0}</strong> ativo(s) · <strong>{l.ticketsAndamento ?? 0}</strong> em andamento
                  <div style={{ color: '#475569' }}>{l.ticketsTotal ?? 0} no total</div>
                  {eu && <div style={{ color: '#475569' }}>a {distanciaKm(eu, [l.lat as number, l.lng as number]).toFixed(1)} km de você</div>}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
