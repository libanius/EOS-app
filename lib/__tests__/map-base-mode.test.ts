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
})
