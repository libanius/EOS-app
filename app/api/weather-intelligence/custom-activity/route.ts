import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import { enforceAiBudget, rateLimitHeaders } from '@/lib/rate-limit'
import { logError } from '@/lib/error-log'
import type { WeatherCurrent } from '@/lib/weather/types'

interface RequestBody {
  activity: string
  current: WeatherCurrent
  alert_count: number
}

export async function POST(req: NextRequest) {
  /**
   * Esta rota chama o modelo e não exigia sequer autenticação (D-118) — qualquer
   * um podia gastar a fatura da OpenAI do dono a partir de um terminal.
   * Autenticar e limitar são a mesma correção: sem identidade não há em quem
   * aplicar limite.
   */
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const excedeu = await enforceAiBudget(`activity:${user.id}`, { perMinute: 6, perDay: 60 })
  if (excedeu) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Muitas análises em sequência. Tente de novo em instantes.' },
      { status: 429, headers: rateLimitHeaders(excedeu.result) },
    )
  }

  let body: RequestBody
  try { body = (await req.json()) as RequestBody }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { activity, current, alert_count } = body
  if (!activity?.trim()) return NextResponse.json({ error: 'activity required' }, { status: 400 })

  const prompt = `You are EOS — an outdoor safety advisor. Analyze if the current weather is suitable for the following activity and give a structured recommendation.

ACTIVITY: ${activity}

CURRENT CONDITIONS:
- Temperature: ${Math.round(current.temp_f)}°F / feels like ${Math.round(current.feels_like_f)}°F
- Condition: ${current.condition}
- Wind: ${Math.round(current.wind_mph)} mph, gusts ${Math.round(current.wind_gust_mph)} mph (${current.wind_dir_label})
- Rain probability: ${current.precip_prob_pct}%
- Humidity: ${current.humidity_pct}%
- Visibility: ${current.visibility_mi.toFixed(1)} mi
- UV Index: ${current.uv_index}
- Cloud cover: ${current.cloud_cover_pct}%
- Daytime: ${current.is_daytime}
- Active weather alerts: ${alert_count}

Respond ONLY with this JSON (no markdown, no extra text):
{
  "risk": "low" | "medium" | "high" | "critical",
  "title": "one-line verdict (max 60 chars)",
  "reason": "2-3 sentences explaining why, referencing specific weather values",
  "checklist": ["item 1", "item 2", "item 3"],
  "best_time": "optional: best time window like 'Before 10am' or null"
}`

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are a concise outdoor safety advisor. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as {
      risk: string; title: string; reason: string; checklist: string[]; best_time: string | null
    }

    return NextResponse.json(parsed, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    await logError('api/weather-intelligence/custom-activity', err, { userId: user.id })
    return NextResponse.json({ error: 'Analysis failed' }, { status: 502 })
  }
}
