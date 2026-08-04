import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generationParams, getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import {
  DEFAULT_SIMULATION,
  type ReserveLevel,
  type Severity,
  type SimulationConfig,
  type SimulationSources,
  type SimulationValues,
  type SourceMode,
  type ThreatType,
} from '@/lib/simulation'

type ParseBody = {
  description: string
  pt?: boolean
}

type ParseResult = {
  patch: Partial<SimulationConfig>
  notes: string[]
}

const THREATS: ThreatType[] = ['hurricane', 'flood', 'wildfire', 'earthquake', 'winter', 'blackout', 'general']
const RESERVES: ReserveLevel[] = ['real', 'half', 'critical']
const SOURCE_MODES: SourceMode[] = ['live', 'sim', 'down']

function numberIn(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(min, Math.min(max, Math.round(value)))
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function cleanPatch(raw: unknown, description: string): ParseResult {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const patch: Partial<SimulationConfig> = { description }

  if (THREATS.includes(input.threat as ThreatType)) patch.threat = input.threat as ThreatType
  const severity = numberIn(input.severity, 1, 5)
  if (severity) patch.severity = severity as Severity
  const arrivalHours = numberIn(input.arrivalHours, 0, 72)
  if (arrivalHours !== undefined) patch.arrivalHours = arrivalHours
  if (RESERVES.includes(input.reserves as ReserveLevel)) patch.reserves = input.reserves as ReserveLevel

  const powerOut = bool(input.powerOut)
  const networkDown = bool(input.networkDown)
  const roadsBlocked = bool(input.roadsBlocked)
  const mobilityLimited = bool(input.mobilityLimited)
  const medicalNeed = bool(input.medicalNeed)
  if (powerOut !== undefined) patch.powerOut = powerOut
  if (networkDown !== undefined) patch.networkDown = networkDown
  if (roadsBlocked !== undefined) patch.roadsBlocked = roadsBlocked
  if (mobilityLimited !== undefined) patch.mobilityLimited = mobilityLimited
  if (medicalNeed !== undefined) patch.medicalNeed = medicalNeed

  const rawSources = input.sources && typeof input.sources === 'object'
    ? input.sources as Partial<Record<keyof SimulationSources, unknown>>
    : null
  if (rawSources) {
    const sources: Partial<SimulationSources> = {}
    for (const key of Object.keys(DEFAULT_SIMULATION.sources) as Array<keyof SimulationSources>) {
      if (SOURCE_MODES.includes(rawSources[key] as SourceMode)) sources[key] = rawSources[key] as SourceMode
    }
    if (Object.keys(sources).length) patch.sources = sources as SimulationSources
  }

  const rawValues = input.values && typeof input.values === 'object'
    ? input.values as Partial<Record<keyof SimulationValues, unknown>>
    : null
  if (rawValues) {
    const values: Partial<SimulationValues> = {}
    const tempC = numberIn(rawValues.tempC, -20, 50)
    const windKmh = numberIn(rawValues.windKmh, 0, 250)
    const gustKmh = numberIn(rawValues.gustKmh, 0, 300)
    const rainPct = numberIn(rawValues.rainPct, 0, 100)
    const humidityPct = numberIn(rawValues.humidityPct, 0, 100)
    const uvIndex = numberIn(rawValues.uvIndex, 0, 12)
    const visibilityKm = numberIn(rawValues.visibilityKm, 0, 30)
    const aqi = numberIn(rawValues.aqi, 0, 500)
    if (tempC !== undefined) values.tempC = tempC
    if (windKmh !== undefined) values.windKmh = windKmh
    if (gustKmh !== undefined) values.gustKmh = gustKmh
    if (rainPct !== undefined) values.rainPct = rainPct
    if (humidityPct !== undefined) values.humidityPct = humidityPct
    if (uvIndex !== undefined) values.uvIndex = uvIndex
    if (visibilityKm !== undefined) values.visibilityKm = visibilityKm
    if (aqi !== undefined) values.aqi = aqi
    if (Object.keys(values).length) patch.values = values as SimulationValues
  }

  const notes = Array.isArray(input.notes)
    ? input.notes.map(n => String(n).trim()).filter(Boolean).slice(0, 4)
    : []

  return { patch, notes }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: ParseBody
  try {
    body = (await request.json()) as ParseBody
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const description = body.description?.trim()
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ error: 'OpenAI indisponível.' }, { status: 503 })

  const pt = body.pt !== false
  const model = getOpenAIModel()
  const system = pt
    ? `Você converte texto livre em configuração revisável do simulador EOS.
Responda SOMENTE JSON.
Campos permitidos:
{
  "threat": "hurricane|flood|wildfire|earthquake|winter|blackout|general",
  "severity": 1-5,
  "arrivalHours": 0-72,
  "powerOut": boolean,
  "networkDown": boolean,
  "roadsBlocked": boolean,
  "mobilityLimited": boolean,
  "medicalNeed": boolean,
  "reserves": "real|half|critical",
  "sources": {"weather":"live|sim|down","alerts":"live|sim|down","airQuality":"live|sim|down","earthquakes":"live|sim|down","radar":"live|sim|down","shelters":"live|sim|down","family":"live|sim|down"},
  "values": {"tempC":number,"windKmh":number,"gustKmh":number,"rainPct":number,"humidityPct":number,"uvIndex":number,"visibilityKm":number,"aqi":number},
  "notes": ["inferência curta para o usuário revisar"]
}
Use apenas inferências fortes. O usuário revisa antes de rodar.`
    : `Convert free text into a reviewable EOS simulator configuration.
Reply ONLY with JSON using these fields:
threat, severity, arrivalHours, powerOut, networkDown, roadsBlocked, mobilityLimited, medicalNeed, reserves, sources, values, notes.
Allowed values match the EOS simulator. Use only strong inferences. The user reviews before starting.`

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: description },
      ],
      response_format: { type: 'json_object' },
      ...generationParams(model, { maxOutputTokens: 900, temperature: 0.1 }),
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as unknown
    return NextResponse.json({ ok: true, ...cleanPatch(parsed, description) })
  } catch {
    return NextResponse.json({ error: pt ? 'Não consegui interpretar o cenário.' : 'Could not parse the scenario.' }, { status: 200 })
  }
}
