import type { EduContent } from './edu'

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200

const SCENARIO_TAGS: Record<string, string> = {
  hurricane: 'HURRICANE',
  earthquake: 'EARTHQUAKE',
  fallout: 'FALLOUT',
  nuclear: 'FALLOUT',
  radiation: 'FALLOUT',
  pandemic: 'PANDEMIC',
  fire: 'FIRE',
  wildfire: 'FIRE',
  flood: 'FLOOD',
}

export function eduRagSource(id: string) {
  return `edu:${id}`
}

export function eduRagSourceVersion(version: number) {
  return `v${Math.max(1, Math.floor(Number(version) || 1))}`
}

export function inferEduScenarioType(tags: string[]): string {
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase()
    if (SCENARIO_TAGS[normalized]) return SCENARIO_TAGS[normalized]
  }
  return 'GENERAL'
}

export function buildEduRagText(item: Pick<EduContent, 'title' | 'summary' | 'transcript' | 'source_url' | 'scenario_tags'>) {
  return [
    `Title: ${item.title}`,
    item.summary ? `Summary: ${item.summary}` : '',
    item.transcript ? `Transcript / notes:\n${item.transcript}` : '',
    item.source_url ? `Source URL: ${item.source_url}` : '',
    item.scenario_tags.length ? `Scenario tags: ${item.scenario_tags.join(', ')}` : '',
  ].filter(Boolean).join('\n\n').trim()
}

export function chunkEduRagText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const chunks: string[] = []
  let start = 0

  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length)
    let breakAt = end
    if (end < clean.length) {
      const sentence = clean.lastIndexOf('. ', end)
      if (sentence > Math.max(start, end - 240)) breakAt = sentence + 1
    }
    const chunk = clean.slice(start, breakAt).trim()
    if (chunk.length > 40) chunks.push(chunk)
    if (breakAt >= clean.length) break
    start = Math.max(0, breakAt - CHUNK_OVERLAP)
    if (start >= clean.length) break
  }

  return chunks
}
