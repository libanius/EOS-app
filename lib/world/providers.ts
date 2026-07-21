/**
 * World Dashboard — provider-neutral map config (doc 16 §6/§7).
 * The renderer (MapLibre) is fixed; the visual base is swappable without
 * touching EOS logic. Default is a KEYLESS dark vector style so HWD-02 works
 * with no account. Set env vars to upgrade to MapTiler (adds 3D terrain).
 */

export type MapProviderConfig = {
  styleUrl: string
  center: [number, number] // [lng, lat]
  zoom: number
  pitch: number
  bearing: number
  hasTerrain: boolean
  terrainSource?: string
}

// Keyless, MapLibre-compatible dark vector basemap (CARTO). Good enough for the
// automotive-grade dark instrument look without any API key.
const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

// Parkland, FL — the reference operating area (doc 16 §8.1).
const PARKLAND: [number, number] = [-80.237, 26.31]

export function getMapConfig(): MapProviderConfig {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY
  const styleOverride = process.env.NEXT_PUBLIC_MAP_STYLE_URL

  // With a key, use hybrid (satellite + labels) — the photorealistic aerial that
  // matches the Higgsfield concept. Keyless falls back to the dark vector base.
  const styleUrl =
    styleOverride ||
    (key ? `https://api.maptiler.com/maps/hybrid/style.json?key=${key}` : CARTO_DARK)

  return {
    styleUrl,
    center: PARKLAND,
    zoom: 13.1,
    pitch: 56, // pitched automotive perspective (doc 16 §11.1: ~45–70°)
    bearing: -18,
    hasTerrain: Boolean(key),
    terrainSource: key
      ? `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`
      : undefined,
  }
}
