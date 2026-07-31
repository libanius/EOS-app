'use client'

/**
 * MapPointPicker — escolher o ponto EXATO no mapa.
 *
 * Buscar endereço resolve a rua e falha no resto. O dono mora num condomínio
 * onde vários prédios dividem o mesmo número: o geocoder devolve um ponto só, e
 * "o ponto de encontro é no bloco C" não cabe num resultado de busca. A imagem
 * de satélite distingue os prédios; o dedo escolhe qual.
 *
 * A mira fica FIXA no centro e o mapa se move por baixo. É mais preciso que
 * tocar num alvo: o dedo cobre exatamente o pixel que se quer enxergar, e no
 * zoom de um telhado essa diferença é o prédio errado. É também o padrão que
 * todo app de entrega usa, então já é conhecido (princípio da familiaridade).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapConfig, type MapBaseMode } from '@/lib/world/providers'
import { Pill } from './primitives'
import { haptic } from './motion'

const COPY = {
  pt: {
    title: 'Escolher no mapa',
    hint: 'Arraste o mapa até a mira ficar em cima do lugar exato. Aproxime para ver o prédio certo.',
    satellite: 'Satélite',
    dark: 'Mapa escuro',
    use: 'Usar este ponto',
    cancel: 'Cancelar',
    accuracy: 'Aproxime mais para escolher com precisão',
    centring: 'Centralizando onde você está…',
  },
  en: {
    title: 'Pick on the map',
    hint: 'Drag the map until the crosshair sits on the exact spot. Zoom in to find the right building.',
    satellite: 'Satellite',
    dark: 'Dark map',
    use: 'Use this point',
    cancel: 'Cancel',
    accuracy: 'Zoom in further to pick precisely',
    centring: 'Centring on where you are…',
  },
} as const

/** Abaixo deste zoom, um pixel vale dezenas de metros: escolher é chute. */
const PRECISE_ZOOM = 16

export default function MapPointPicker({
  open,
  pt,
  start,
  fallback,
  onPick,
  onClose,
}: {
  open: boolean
  pt: boolean
  /** Ponto já escolhido, quando se está editando. Tem prioridade sobre tudo. */
  start: { lat: number; lng: number } | null
  /** Melhor palpite estático — a casa do plano, ou o endereço do perfil. */
  fallback: { lat: number; lng: number } | null
  onPick: (point: { lat: number; lng: number }) => void
  onClose: () => void
}) {
  const c = COPY[pt ? 'pt' : 'en']
  const holder = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [base, setBase] = useState<MapBaseMode>('satellite')
  const [zoom, setZoom] = useState(17)
  const [locating, setLocating] = useState(false)
  const [centre, setCentre] = useState(start ?? fallback)

  // A posição inicial precisa sobreviver à troca de camada, que recria o mapa.
  const centreRef = useRef(start ?? fallback)
  useEffect(() => { centreRef.current = centre }, [centre])

  /**
   * Assim que a pessoa encosta no mapa, ele para de se mover sozinho.
   *
   * Sem esta trava, uma posição de GPS chegando com três segundos de atraso
   * arrancaria a câmera de onde a pessoa acabou de arrastar — o mapa brigando
   * com quem o usa, que é o defeito que já corrigimos no dashboard (D-070).
   */
  const touched = useRef(false)

  const build = useCallback(async () => {
    if (!holder.current || mapRef.current) return
    const maplibregl = (await import('maplibre-gl')).default
    if (!holder.current) return
    const cfg = getMapConfig(base)
    const at = centreRef.current ?? { lat: cfg.center[1], lng: cfg.center[0] }

    const map = new maplibregl.Map({
      container: holder.current,
      style: cfg.styleUrl,
      center: [at.lng, at.lat],
      zoom: centreRef.current ? 17 : 12,
      pitch: 0,   // escolher endereço exige o chão, não a perspectiva
      bearing: 0,
      attributionControl: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('error', () => { /* falha de tile não pode apagar a tela */ })

    // A mira é fixa: o ponto escolhido é sempre o centro da câmera.
    const sync = () => {
      const centerNow = map.getCenter()
      setCentre({ lat: centerNow.lat, lng: centerNow.lng })
      setZoom(map.getZoom())
    }
    map.on('move', sync)
    map.on('zoom', sync)
    // `originalEvent` só existe quando um ponteiro real causou o movimento.
    map.on('dragstart', event => { if ((event as { originalEvent?: unknown }).originalEvent) touched.current = true })
    map.on('zoomstart', event => { if ((event as { originalEvent?: unknown }).originalEvent) touched.current = true })
    // Uma vez agora: sem isto, abrir sem ponto de partida deixava a mira sem
    // coordenada e o botão de confirmar desabilitado até o usuário arrastar o
    // mapa — a tela pedia uma ação que ela não explicava.
    sync()
    mapRef.current = map
  }, [base])

  useEffect(() => {
    if (!open) return
    void build()
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [open, build])

  /**
   * Abrir onde a pessoa ESTÁ.
   *
   * Antes, sem ponto de partida, o mapa abria no centro de referência do app —
   * e a pessoa tinha que procurar a própria casa navegando. Agora ele parte do
   * melhor palpite estático (a casa do plano, ou o endereço do perfil) e, se uma
   * posição chegar rápido, vai até ela.
   *
   * Só quando NÃO se está editando um ponto existente: quem abriu para ajustar
   * um lugar já escolhido não quer ser levado para outro lugar.
   */
  useEffect(() => {
    if (!open || start) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let cancelled = false

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false)
        if (cancelled || touched.current) return
        const at = { lat: position.coords.latitude, lng: position.coords.longitude }
        centreRef.current = at
        setCentre(at)
        mapRef.current?.easeTo({ center: [at.lng, at.lat], zoom: 17, duration: 700 })
      },
      () => setLocating(false),
      // Mesma regra de D-076: aceita fix recente. Aqui é só para enquadrar o
      // mapa, então precisão importa menos que chegar rápido.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    )

    return () => { cancelled = true }
  }, [open, start])

  if (!open) return null

  const precise = zoom >= PRECISE_ZOOM

  return (
    <div className="wv2 wv2-mappick" role="dialog" aria-label={c.title}>
      <div ref={holder} className="wv2-mappick-map" />

      {/* A mira não intercepta o toque: o mapa embaixo continua arrastável. */}
      <div className="wv2-mappick-cross" aria-hidden="true">
        <span className="ring" />
        <span className="dot" />
      </div>

      <div className="wv2-mappick-panel wv2-fume">
        <div className="wv2-mappick-head">
          <strong className="t-title2">{c.title}</strong>
          <span className="t-foot ink-3">{c.hint}</span>
        </div>

        <div className="wv2-mappick-row">
          <button
            type="button"
            className={`wv2-chip${base === 'satellite' ? ' on' : ''}`}
            onClick={() => { haptic.selection(); setBase('satellite') }}
          >
            {c.satellite}
          </button>
          <button
            type="button"
            className={`wv2-chip${base === 'dark' ? ' on' : ''}`}
            onClick={() => { haptic.selection(); setBase('dark') }}
          >
            {c.dark}
          </button>
          {centre && (
            <span className="t-foot ink-3 coords">
              {centre.lat.toFixed(5)}, {centre.lng.toFixed(5)}
            </span>
          )}
        </div>

        {locating && <p className="t-foot ink-3">{c.centring}</p>}
        {!precise && !locating && <p className="t-foot warn">{c.accuracy}</p>}

        <div className="wv2-mappick-acts">
          <Pill onClick={onClose}>{c.cancel}</Pill>
          <Pill
            primary
            disabled={!centre}
            onClick={() => {
              if (!centre) return
              haptic.impact()
              onPick(centre)
            }}
          >
            {c.use}
          </Pill>
        </div>
      </div>
    </div>
  )
}
