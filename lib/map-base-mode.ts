export const MAP_BASE_MODES = ['satellite', 'hybrid', 'dark'] as const

export type MapBaseMode = typeof MAP_BASE_MODES[number]

export const DEFAULT_MAP_BASE_MODE: MapBaseMode = 'satellite'

export function normalizeMapBaseMode(value: unknown): MapBaseMode | null {
  return MAP_BASE_MODES.includes(value as MapBaseMode) ? value as MapBaseMode : null
}
