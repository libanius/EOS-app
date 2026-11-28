import { tornadoInstructions, tornadoPhase, validOfficialPolygon } from '../tornado-experience'

describe('tornado emergency deterministic UX', () => {
  it('distinguishes watch, warning and shelter without declaring all-clear', () => {
    expect(tornadoPhase('Tornado Watch', false, false)).toBe('watch')
    expect(tornadoPhase('Tornado Warning', false, false)).toBe('warning')
    expect(tornadoPhase('Tornado Warning', false, true)).toBe('shelter')
    expect(tornadoPhase('Tornado Warning', true, true)).toBe('ended')
    expect(tornadoPhase('Flood Warning', false, false)).toBeNull()
  })
  it('never treats shelter check-in as cancellation', () => {
    expect(tornadoInstructions('shelter').join(' ')).toMatch(/does not cancel/)
  })
  it('rejects missing or malformed official geometries', () => {
    expect(validOfficialPolygon(null)).toBe(false)
    expect(validOfficialPolygon({ type: 'Polygon', coordinates: [[[200, 40], [200, 40], [200, 40], [200, 40]]] })).toBe(false)
    expect(validOfficialPolygon({ type: 'Polygon', coordinates: [[[-80, 26], [-80.1, 26], [-80.1, 26.1], [-80, 26]]] })).toBe(true)
  })
})
