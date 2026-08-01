import { googleMapsRouteUrl, googleMapsRouteUrlFromLineString } from '../world/navigation'

describe('googleMapsRouteUrl', () => {
  it('monta Google Maps com origem, destino e paradas na ordem', () => {
    const url = googleMapsRouteUrl([
      { lat: 26.31, lng: -80.24 },
      { lat: 26.32, lng: -80.23 },
      { lat: 26.33, lng: -80.22 },
    ], { travelMode: 'driving' })

    expect(url).toContain('https://www.google.com/maps/dir/?')
    const params = new URL(url!).searchParams
    expect(params.get('api')).toBe('1')
    expect(params.get('origin')).toBe('26.310000,-80.240000')
    expect(params.get('destination')).toBe('26.330000,-80.220000')
    expect(params.get('waypoints')).toBe('26.320000,-80.230000')
    expect(params.get('travelmode')).toBe('driving')
  })

  it('amostra pontos intermediarios para nao transformar todo clique em parada', () => {
    const points = Array.from({ length: 14 }, (_, i) => ({ lat: 26 + i * 0.001, lng: -80 - i * 0.001 }))
    const url = googleMapsRouteUrl(points, { maxWaypoints: 4 })
    const waypoints = new URL(url!).searchParams.get('waypoints')?.split('|') ?? []

    expect(waypoints).toHaveLength(4)
    expect(waypoints[0]).toBe('26.001000,-80.001000')
    expect(waypoints[3]).toBe('26.012000,-80.012000')
  })
})

describe('googleMapsRouteUrlFromLineString', () => {
  it('converte LineString lng/lat para Google Maps lat/lng', () => {
    const url = googleMapsRouteUrlFromLineString({
      type: 'LineString',
      coordinates: [[-80.24, 26.31], [-80.23, 26.32]],
    }, 'foot')

    const params = new URL(url!).searchParams
    expect(params.get('origin')).toBe('26.310000,-80.240000')
    expect(params.get('destination')).toBe('26.320000,-80.230000')
    expect(params.get('travelmode')).toBe('walking')
  })
})
