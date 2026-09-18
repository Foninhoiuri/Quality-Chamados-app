import { useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Loader2 } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
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

/** Vários locais no mesmo ponto da tela: um círculo com quantos são. */
function grupo(quantos: number, ativos: number): L.DivIcon {
  const quente = ativos > 0
  return L.divIcon({
    className: 'placa-local',
    html: `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        width:44px;height:44px;border-radius:50%;
        background:${quente ? 'rgba(127,20,20,.95)' : 'rgba(30,41,59,.95)'};
        border:2px solid ${quente ? 'rgba(248,113,113,.7)' : 'rgba(148,163,184,.4)'};
        box-shadow:0 4px 12px rgba(0,0,0,.5);font:600 13px/1 system-ui,sans-serif;color:#e2e8f0">
        <span>${quantos}</span>
        <span style="font-size:9px;font-weight:500;color:${quente ? '#fca5a5' : '#94a3b8'};margin-top:2px">
          ${quente ? `${ativos} ativo${ativos > 1 ? 's' : ''}` : 'locais'}
        </span>
      </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
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
function Enquadrar({ pontos, eu }: { pontos: [number, number][]; eu: [number, number] | null }) {
  const map = useMap()
  const jaEnquadrou = useRef(false)
  const jaUsouMinhaPosicao = useRef(false)

  useEffect(() => {
    // A localização chega depois do mapa montar. Quando chega, vale um reenquadramento:
    // antes disso o mapa tinha se ajustado só pelos pinos (ou pelo país inteiro).
    if (eu && !jaUsouMinhaPosicao.current) jaEnquadrou.current = false
    if (jaEnquadrou.current) return

    const aplicar = () => {
      // Container ainda escondido (a aba "Mapa" fechada): medir agora daria um
      // enquadramento no vazio, e ele nunca mais seria refeito.
      if (map.getSize().x === 0) return false
      if (eu) {
        jaUsouMinhaPosicao.current = true
        const perto = pontos.filter((p) => distanciaKm(eu, p) <= PERTO_KM)
        if (perto.length) map.fitBounds(L.latLngBounds([eu, ...perto]), { padding: [56, 56], maxZoom: 16 })
        else map.setView(eu, 13)
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
  }, [map, pontos, eu])

  return null
}

/** Distância em pixels abaixo da qual duas plaquinhas se atrapalham e viram um grupo. */
const COLISAO_PX = 70

/**
 * Marcadores do mapa. Quando as plaquinhas se amontoam no zoom atual, elas viram um
 * círculo com a quantidade — e ao clicar nele o mapa aproxima o suficiente para separá-las.
 * É o único caso em que o mapa se mexe sozinho: agrupar e não deixar abrir seria um beco.
 */
function Marcadores({ locais, selecionado, onSelecionar, eu }: {
  locais: Local[]
  selecionado: string | null
  onSelecionar: (id: string) => void
  eu: [number, number] | null
}) {
  const map = useMap()
  const [, redesenhar] = useState(0)
  useMapEvents({
    zoomend: () => redesenhar((n) => n + 1),
    moveend: () => redesenhar((n) => n + 1),
  })

  const grupos = useMemo(() => {
    const out: { pontos: Local[]; centro: [number, number] }[] = []
    for (const l of locais) {
      const p = map.latLngToLayerPoint([l.lat as number, l.lng as number])
      const perto = out.find((g) => {
        const c = map.latLngToLayerPoint(g.centro)
        return Math.hypot(c.x - p.x, c.y - p.y) < COLISAO_PX
      })
      if (perto) perto.pontos.push(l)
      else out.push({ pontos: [l], centro: [l.lat as number, l.lng as number] })
    }
    return out
    // A posição na tela muda a cada zoom/arraste: o redesenho é a dependência de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locais, map, map.getZoom(), map.getCenter().lat, map.getCenter().lng])

  return (
    <>
      {grupos.map((g) => {
        if (g.pontos.length === 1) {
          const l = g.pontos[0]
          return (
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
          )
        }
        const ativos = g.pontos.reduce((s, l) => s + (l.ticketsAtivos ?? 0), 0)
        return (
          <Marker
            key={g.pontos.map((l) => l.id).join('-')}
            position={g.centro}
            icon={grupo(g.pontos.length, ativos)}
            eventHandlers={{
              click: () => map.flyTo(g.centro, Math.min(map.getZoom() + 3, 17), { duration: 0.5 }),
            }}
          />
        )
      })}
    </>
  )
}

export function MapaLocais({ locais, selecionado, onSelecionar }: {
  locais: Local[]
  selecionado: string | null
  onSelecionar: (id: string) => void
}) {
  const tema = useStore((s) => s.theme)
  const comPino = useMemo(() => locais.filter((l) => l.lat != null && l.lng != null), [locais])
  const pontos = useMemo(() => comPino.map((l) => [l.lat as number, l.lng as number] as [number, number]), [comPino])
  // Onde a pessoa está: o mapa abre na região dela, com os locais perto à volta.
  const [eu, setEu] = useState<[number, number] | null>(null)
  const [buscandoLocal, setBuscandoLocal] = useState(false)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [mapaRef, setMapaRef] = useState<L.Map | null>(null)
  // Sem nenhum tile carregado, o mapa é um retângulo azul e ninguém sabe por quê.
  const [semTiles, setSemTiles] = useState(false)

  const pedirLocalizacao = (centralizar: boolean) => {
    if (!navigator.geolocation) return setErroLocal('Este navegador não informa a localização')
    setBuscandoLocal(true)
    setErroLocal(null)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: [number, number] = [p.coords.latitude, p.coords.longitude]
        setEu(pos)
        setBuscandoLocal(false)
        if (centralizar && mapaRef) mapaRef.flyTo(pos, 15, { duration: 0.6 })
      },
      (e) => {
        setBuscandoLocal(false)
        setErroLocal(e.code === e.PERMISSION_DENIED ? 'Localização bloqueada nas permissões do site' : 'Não foi possível obter sua localização')
      },
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: centralizar },
    )
  }

  useEffect(() => { pedirLocalizacao(false) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

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
      {/* Centralizar em mim: o mapa abre onde dá, mas achar-se nele é um toque. */}
      <button
        type="button"
        onClick={() => pedirLocalizacao(true)}
        disabled={buscandoLocal}
        title={erroLocal ?? 'Centralizar em mim'}
        aria-label="Centralizar em mim"
        className="absolute right-3 top-3 z-[500] flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/95 text-slate-200 shadow-lg hover:border-red-700 hover:text-red-300 disabled:opacity-60"
      >
        {buscandoLocal ? <Loader2 size={17} className="animate-spin" /> : <LocateFixed size={17} />}
      </button>
      {erroLocal && (
        <div className="absolute inset-x-14 top-3 z-[500] rounded-lg border border-amber-500/30 bg-slate-900/95 px-2 py-1.5 text-center text-[11px] text-amber-300 shadow-lg">
          {erroLocal}
        </div>
      )}
      {semTiles && (
        <div className="absolute inset-x-3 bottom-10 z-[500] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-center text-[11px] text-slate-300 shadow-lg">
          O mapa não carregou — o servidor de mapas do OpenStreetMap não respondeu. Verifique a conexão e recarregue.
        </div>
      )}

      <MapContainer
        center={eu ?? pontos[0] ?? BRASIL}
        zoom={eu ? 13 : pontos.length ? 13 : 4}
        scrollWheelZoom
        ref={setMapaRef}
        className="h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-slate-800"
        style={{ background: escuro ? '#0b1120' : '#e2e8f0' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            load: () => setSemTiles(false),
            tileerror: () => setSemTiles(true),
          }}
          className={escuro
            ? '[filter:invert(1)_hue-rotate(185deg)_brightness(1.02)_contrast(.86)_saturate(.45)]'
            : '[filter:saturate(.7)_contrast(.95)]'}
        />
        <AjustarTamanho />
        <Enquadrar pontos={pontos} eu={eu} />

        {eu && (
          <Marker position={eu} icon={pinoEu}>
            <Popup><span style={{ fontSize: 12 }}>Você está aqui</span></Popup>
          </Marker>
        )}

        <Marcadores locais={comPino} selecionado={selecionado} onSelecionar={onSelecionar} eu={eu} />
      </MapContainer>
    </div>
  )
}
