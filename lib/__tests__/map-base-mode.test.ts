import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_MAP_BASE_MODE, normalizeMapBaseMode } from '../map-base-mode'

describe('map base mode preference', () => {
  it('defaults to satellite and accepts only the documented modes', () => {
    expect(DEFAULT_MAP_BASE_MODE).toBe('satellite')
    expect(normalizeMapBaseMode('satellite')).toBe('satellite')
    expect(normalizeMapBaseMode('hybrid')).toBe('hybrid')
    expect(normalizeMapBaseMode('dark')).toBe('dark')
    expect(normalizeMapBaseMode('wind')).toBeNull()
  })

  it('persists the app-wide preference in profiles.map_base_mode', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260819144004_exec_t06_map_base_mode.sql'),
      'utf8',
    )

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS map_base_mode')
    expect(migration).toContain("DEFAULT 'satellite'")
    expect(migration).toContain("CHECK (map_base_mode IN ('satellite', 'hybrid', 'dark'))")
  })

  /*
   * Criterio transversal da secao 7 do spec: a preferencia "vale em todas as
   * superficies de mapa". O `/dashboard-world` (HWD v1) tinha ficado com estado
   * local proprio, comecando em 'hybrid' e escrevendo numa chave que ninguem
   * lia de volta — a escolha morria no reload e nao chegava no Mundo.
   */
  it('reads the shared preference on every map surface', () => {
    const surfaces = [
      'components/world-v2/WorldV2.tsx',
      'components/world-v2/MapPointPicker.tsx',
      'components/world-v2/RouteDraw.tsx',
      'components/world-dashboard/WorldDashboard.tsx',
    ]

    for (const surface of surfaces) {
      const source = readFileSync(join(process.cwd(), surface), 'utf8')
      expect([surface, source.includes('use-map-base-mode')]).toEqual([surface, true])
      expect([surface, /useState<MapBaseMode>/.test(source)]).toEqual([surface, false])
      expect([surface, source.includes('eos-world-map-base')]).toEqual([surface, false])
    }
  })
})
