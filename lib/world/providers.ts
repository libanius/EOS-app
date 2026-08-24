/**
 * World Dashboard — provider-neutral map config (doc 16 §6/§7).
 * The renderer (MapLibre) is fixed; the visual base is swappable without
 * touching EOS logic. Default is a KEYLESS dark vector style so HWD-02 works
 * with no account. Set env vars to upgrade to MapTiler (adds 3D terrain).
 */

import type { StyleSpecification } from 'maplibre-gl'
import { DEFAULT_MAP_BASE_MODE, type MapBaseMode } from '@/lib/map-base-mode'

export type { MapBaseMode } from '@/lib/map-base-mode'

export type MapProviderConfig = {
  /**
   * URL de estilo OU um estilo MapLibre inteiro.
   *
   * Virou união porque o satélite sem chave não tem URL de estilo pronta: é
   * montado aqui a partir de tiles raster do ESRI. O renderizador aceita os dois
   * formatos, então nada além deste arquivo precisa saber a diferença.
   */
  styleUrl: string | StyleSpecification
  center: [number, number] // [lng, lat]
  zoom: number
  pitch: number
  bearing: number
  hasTerrain: boolean
  terrainSource?: string
}

/*
 * D-199: `'wind'` saiu do tipo.
 *
 * Ele carregava o `CARTO_DARK`, então escolher vento **apagava o satélite** —
 * o defeito que o dono apontou. Vento é fenômeno sobre o mundo, não uma forma
 * de desenhar o mundo, e virou camada. Tirar do tipo impede que ele volte por
 * distração.
 */
// Keyless, MapLibre-compatible dark vector basemap (CARTO). Good enough for the
// automotive-grade dark instrument look without any API key.
const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/**
 * Satélite SEM CHAVE, montado sobre tiles do ESRI World Imagery.
 *
 * Existe porque o dono precisa enxergar o detalhe do terreno — num condomínio
 * com vários prédios no mesmo número, o traço da rua não distingue nada e a
 * imagem distingue. O MapTiler resolveria com uma linha, mas exige
 * `NEXT_PUBLIC_MAPTILER_KEY`, que não está configurada; ficar sem satélite por
 * isso seria deixar o produto pior por causa de uma conta que ninguém abriu.
 *
 * A camada de referência por cima traz nomes de rua e limites — imagem pura, sem
 * rótulo nenhum, é bonita e inútil para achar um endereço.
 *
 * A atribuição do ESRI é obrigatória e vai em cada fonte, não numa nota de
 * rodapé nossa: é condição de uso do serviço.
 */
const ESRI_ATTRIBUTION =
  'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'

function esriSatelliteStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      'esri-imagery': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: ESRI_ATTRIBUTION,
      },
      'esri-labels': {
        type: 'raster',
        tiles: [
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: ESRI_ATTRIBUTION,
      },
    },
    layers: [
      // Fundo preto: enquanto o tile não chega, a tela continua sendo a mesma
      // superfície escura do resto do app em vez de piscar branco.
      { id: 'bg', type: 'background', paint: { 'background-color': '#000000' } },
      { id: 'imagery', type: 'raster', source: 'esri-imagery' },
      { id: 'labels', type: 'raster', source: 'esri-labels' },
    ],
  }
}

// Parkland, FL — the reference operating area (doc 16 §8.1).
const PARKLAND: [number, number] = [-80.237, 26.31]

export function getMapConfig(base: MapBaseMode = DEFAULT_MAP_BASE_MODE): MapProviderConfig {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY
  const styleOverride = process.env.NEXT_PUBLIC_MAP_STYLE_URL

  // With a key, use hybrid (satellite + labels) — the photorealistic aerial that
  // matches the Higgsfield concept. Keyless falls back to the dark vector base.
  // The runtime "dark" option intentionally bypasses the env style override so
  // the user can restore the original operational vector look in production.
  const isDark = base === 'dark'
  const isSatellite = base === 'satellite'
  const styleUrl = isDark
    ? CARTO_DARK
    : isSatellite
      ? esriSatelliteStyle()
      : styleOverride || (key ? `https://api.maptiler.com/maps/hybrid/style.json?key=${key}` : CARTO_DARK)

  /*
   * D-199: as ramificações `isWind` sumiram junto com a base.
   *
   * Ela abria o mapa em [0, 18] com zoom 1.55 — o meio do Atlântico, o planeta
   * inteiro na tela. Fazia sentido para "modo vento global" e nenhum sentido
   * para uma camada: ligar o vento teleportava a pessoa para longe da própria
   * casa. Agora a câmera é sempre a mesma, e só o zoom decide se as partículas
   * contam o padrão do continente ou o da rua.
   */
  return {
    styleUrl,
    center: PARKLAND,
    zoom: 13.1,
    pitch: 56, // pitched automotive perspective (doc 16 §11.1: ~45–70°)
    bearing: -18,
    hasTerrain: !isDark && !isSatellite && Boolean(key),
    terrainSource: !isDark && !isSatellite && key
      ? `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`
      : undefined,
  }
}
