import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'

export const runtime = 'nodejs'

type Guidance = {
  shelter: {
    name: string
    lat: number
    lng: number
    confidence: 'low' | 'medium' | 'high'
    source: 'openai_inferred' | 'fallback'
  }
  route: {
    label: string
    confidence: 'low' | 'medium' | 'high'
    points: Array<[number, number]>
  }
  caveat: string
}

function finiteCoord(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function fallbackGuidance(lat: number, lng: number): Guidance {
  const shelterLat = lat + 0.010
  const shelterLng = lng + 0.012
  return {
    shelter: {
      name: 'Candidate shelter area',
      lat: shelterLat,
      lng: shelterLng,
      confidence: 'low',
      source: 'fallback',
    },
    route: {
      label: 'Candidate direct route',
      confidence: 'low',
      points: [
        [lng, lat],
        [lng + 0.004, lat + 0.003],
        [lng + 0.008, lat + 0.007],
        [shelterLng, shelterLat],
      ],
    },
    caveat: 'Prototype only. Not an official route or verified open shelter.',
  }
}

function parseGuidance(raw: string, lat: number, lng: number): Guidance | null {
  try {
    const data = JSON.parse(raw) as Guidance
    const s = data.shelter
    if (!s || !finiteCoord(s.lat, s.lng)) return null
    const points = Array.isArray(data.route?.points)
      ? data.route.points
        .map(p => Array.isArray(p) && p.length === 2 ? [Number(p[0]), Number(p[1])] as [number, number] : null)
        .filter((p): p is [number, number] => Boolean(p && finiteCoord(p[1], p[0])))
      : []
    if (points.length < 2) points.unshift([lng, lat], [s.lng, s.lat])
    return {
      shelter: {
        name: String(s.name || 'Candidate shelter').slice(0, 80),
        lat: s.lat,
        lng: s.lng,
        confidence: ['low', 'medium', 'high'].includes(s.confidence) ? s.confidence : 'low',
        source: 'openai_inferred',
      },
      route: {
        label: String(data.route?.label || 'AI candidate route').slice(0, 80),
        confidence: ['low', 'medium', 'high'].includes(data.route?.confidence) ? data.route.confidence : 'low',
        points: points.slice(0, 8),
      },
      caveat: 'OpenAI-inferred prototype. Not an official route or verified open shelter.',
    }
  } catch {
    return null
  }
}

// GET /api/world/guidance?lat=..&lng=..
// D-051: OpenAI may infer candidate shelter/route guidance for the isolated
// prototype, but it is not official routing/shelter-status data.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  if (!finiteCoord(lat, lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ...fallbackGuidance(lat, lng), ok: false }, { status: 200 })
  }

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 650,
      messages: [
        {
          role: 'system',
          content: [
            'Return only valid JSON.',
            'You are producing prototype situational guidance for EOS.',
            'You are not an official routing, map, emergency management, or shelter-status source.',
            'Use conservative nearby public/civic-style shelter candidates only when plausible.',
            'Never claim the shelter is open, official, safe, or verified.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            location: { lat, lng },
            output_shape: {
              shelter: { name: 'string', lat: 'number', lng: 'number', confidence: 'low|medium|high' },
              route: { label: 'string', confidence: 'low|medium|high', points: 'array of [lng,lat], 2-8 points' },
            },
          }),
        },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = parseGuidance(raw, lat, lng)
    return NextResponse.json({ ...(parsed ?? fallbackGuidance(lat, lng)), ok: Boolean(parsed) })
  } catch {
    return NextResponse.json({ ...fallbackGuidance(lat, lng), ok: false }, { status: 200 })
  }
}
