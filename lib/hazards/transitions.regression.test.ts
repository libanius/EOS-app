import { detectTransitions, type StoredHazardState } from './transitions'
import type { HazardEvent } from './types'

const previous = (severity: 'minor' | 'moderate', hazardType = 'wildfire'): StoredHazardState => ({
  id: 'eonet:EONET_22791',
  severity,
  eventType: 'wildfire',
  hazardType,
  title: 'Wildfire THE H1',
  metrics: null,
})

const current = (severity: 'minor' | 'moderate', source = 'nasa_eonet'): HazardEvent => ({
  id: 'eonet:EONET_22791',
  sourceEventId: 'EONET_22791',
  source,
  authority: 'official',
  visualClass: 'OFFICIAL_ALERT',
  hazardType: 'wildfire',
  eventType: 'wildfire',
  title: 'Wildfire THE H1',
  summary: '',
  severity,
  urgency: 'future',
  certainty: 'observed',
  detectedAt: '2026-11-18T00:00:00Z',
  updatedAt: '2026-11-18T00:00:00Z',
} as HazardEvent)

describe('cross-location wildfire severity regression', () => {
  it.each([
    ['minor', 'moderate'],
    ['moderate', 'minor'],
  ] as const)('does not treat EONET %s → %s as a change in fire intensity', (from, to) => {
    const changes = detectTransitions({
      previous: new Map([['eonet:EONET_22791', previous(from)]]),
      current: [current(to)],
    })
    expect(changes).toHaveLength(0)
  })

  it('continues to report a real non-EONET severity upgrade', () => {
    const changes = detectTransitions({
      previous: new Map([['eonet:EONET_22791', previous('minor')]]),
      current: [current('moderate', 'nws')],
    })
    expect(changes.map(change => change.kind)).toEqual(['upgraded'])
  })

  it('still reports a newly detected wildfire', () => {
    const changes = detectTransitions({
      previous: new Map(),
      current: [current('moderate')],
    })
    expect(changes.map(change => change.kind)).toEqual(['detected'])
  })
})
