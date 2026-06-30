// Nominatim geocoding (OpenStreetMap, free, no key required).
// Rate limit: 1 req/s. Used only on explicit user save — not polling.
// D-024: stores lat/lng alongside location text for monitoring APIs.

export async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const results = await res.json() as Array<{ lat: string; lon: string }>
    if (!results.length) return null
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
  } catch {
    return null
  }
}
