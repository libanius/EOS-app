/**
 * EOS — ingest-single.ts
 *
 * Processes ONE PDF file: extract → chunk → embed → upsert.
 * Runs as a child process spawned by ingest.ts (one process per PDF).
 * Each process exits after completion, freeing all memory.
 *
 * Usage (direct):
 *   node --max-old-space-size=4096 node_modules/.bin/tsx scripts/ingest-single.ts <path-to-pdf>
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

// ─── Config ───────────────────────────────────────────────────────────────────

const CHUNK_SIZE     = 1500
const CHUNK_OVERLAP  = 200
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_BATCH = 20
const UPSERT_BATCH   = 50

type ScenarioTypeEnum =
  | 'HURRICANE' | 'EARTHQUAKE' | 'FALLOUT'
  | 'PANDEMIC'  | 'FIRE'       | 'FLOOD' | 'GENERAL'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferScenarioType(filename: string): ScenarioTypeEnum {
  const lower = filename.toLowerCase()
  if (/hurricane/.test(lower))             return 'HURRICANE'
  if (/earthquake/.test(lower))            return 'EARTHQUAKE'
  if (/fallout|nuclear|radiation/.test(lower)) return 'FALLOUT'
  if (/pandemic|cdc|covid|virus/.test(lower))  return 'PANDEMIC'
  if (/fire/.test(lower))                  return 'FIRE'
  if (/flood/.test(lower))                 return 'FLOOD'
  return 'GENERAL'
}

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return []

  const chunks: string[] = []
  let start = 0

  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length)
    let breakAt = end
    if (end < clean.length) {
      const idx = clean.lastIndexOf('. ', end)
      if (idx > Math.max(start, end - 200)) breakAt = idx + 1
    }
    const chunk = clean.slice(start, breakAt).trim()
    if (chunk.length > 50) chunks.push(chunk)
    start = breakAt - CHUNK_OVERLAP
    if (start <= 0 || start >= clean.length) break
  }

  return chunks
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pdfPath = process.argv[2]
  if (!pdfPath) {
    console.error('Usage: tsx scripts/ingest-single.ts <pdf-path>')
    process.exit(1)
  }

  const filename    = path.basename(pdfPath)
  const scenarioType = inferScenarioType(filename)
  const sourceLabel  = filename.replace(/\.pdf$/i, '')

  console.log(`\n📄  ${filename}  [${scenarioType}]`)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 1. Extract text
  let rawText = ''
  try {
    const buf = fs.readFileSync(pdfPath)
    const parsed = await pdfParse(buf)
    rawText = parsed.text
  } catch (err) {
    console.error(`   ⚠️  Parse failed: ${err}`)
    process.exit(1)
  }

  if (!rawText.trim()) {
    console.warn('   ⚠️  No text extracted (scanned image?). Skipping.')
    process.exit(0)
  }

  // 2. Chunk
  const chunks = chunkText(rawText)
  console.log(`   ✂️  ${chunks.length} chunks`)

  let inserted = 0

  // 3. Embed + upsert incrementally — never more than EMBEDDING_BATCH rows in memory at once
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH)
    const to    = Math.min(i + EMBEDDING_BATCH, chunks.length)
    process.stdout.write(`   🔢  ${i + 1}–${to} / ${chunks.length} ...`)

    let embRes
    try {
      embRes = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch })
    } catch (err) {
      console.error(`\n   ❌  Embedding failed: ${err}`)
      continue
    }

    // Build rows for this batch only, then immediately upsert and let GC free them
    const rows = embRes.data.map((item, idx) => ({
      content:       batch[idx],
      embedding:     item.embedding,
      source:        sourceLabel,
      scenario_type: scenarioType,
      chunk_index:   i + idx,
    }))

    for (let j = 0; j < rows.length; j += UPSERT_BATCH) {
      const { error } = await supabase
        .from('knowledge_base')
        .insert(rows.slice(j, j + UPSERT_BATCH))

      if (error) {
        console.error(`\n   ❌  Supabase error: ${error.message}`)
      } else {
        inserted += Math.min(UPSERT_BATCH, rows.length - j)
      }
    }

    console.log(` ✅ (${inserted} stored so far)`)
  }

  console.log(`   ✅  Done — ${inserted} / ${chunks.length} chunks stored.\n`)
}

main().catch((err) => {
  console.error('❌  ingest-single crashed:', err)
  process.exit(1)
})
