import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldVersionPlansForPlaceMove } from '../plan-places'

describe('plan place catalog', () => {
  it('does not version plans when only precision is confirmed', () => {
    const before = { lat: 26.31000, lng: -80.24000, precision: 'unknown' }
    const after = { lat: 26.31000, lng: -80.24000, precision: 'gps' }

    expect(shouldVersionPlansForPlaceMove(before, after)).toBe(false)
  })

  it('versions plans only when a place moves more than 50 meters', () => {
    const before = { lat: 26.31000, lng: -80.24000 }

    expect(shouldVersionPlansForPlaceMove(before, { lat: 26.31020, lng: -80.24000 })).toBe(false)
    expect(shouldVersionPlansForPlaceMove(before, { lat: 26.31100, lng: -80.24000 })).toBe(true)
  })

  it('migrates every legacy waypoint as unknown precision instead of inferring confidence', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260819045025_exec_t01_circle_places.sql'),
      'utf8',
    )

    expect(migration).toMatch(/precision\s+text NOT NULL DEFAULT 'unknown'/)
    expect(migration).toContain("'unknown',")
    expect(migration).not.toContain("waypoint.kind = 'gps'")
    expect(migration).not.toContain("precision,\n        'gps'")
    expect(migration).not.toContain("precision,\n        'address'")
    expect(migration).not.toContain("precision,\n        'city'")
  })
})
