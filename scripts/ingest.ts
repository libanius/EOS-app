/**
 * EOS — ingest.ts
 *
 * Reads pre-converted text files from docs/text/, chunks each one,
 * generates OpenAI embeddings in batches, and upserts into knowledge_base.
 *
 * Run pdf_to_text.py first to convert PDFs → text files.
 *
 * Usage:
 *   npm run ingest
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// ─── Config ───────────────────────────────────────────────────────────────────

const TEXT_DIR       = path.resolve(process.cwd(), 'docs', 'text')
const CHUNK_SIZE     = 1500
const CHUNK_OVERLAP  = 200
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_BATCH = 20
const UPSERT_BATCH   = 50

type ScenarioTypeEnum =
  | 'HURRICANE' | 'EARTHQUAKE' | 'FALLOUT'
  | 'PANDEMIC'  | 'FIRE'       | 'FLOOD' | 'GENERAL'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateEnv() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ]
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`\n❌  Missing environment variables:\n   ${missing.join('\n   ')}\n`)
    process.exit(1)
  }
}

function inferScenarioType(filename: string): ScenarioTypeEnum {
  const lower = filename.toLowerCase()
  if (/hurricane/.test(lower))                 return 'HURRICANE'
  if (/earthquake/.test(lower))                return 'EARTHQUAKE'
  if (/fallout|nuclear|radiation/.test(lower)) return 'FALLOUT'
  if (/pandemic|cdc|covid|virus/.test(lower))  return 'PANDEMIC'
  if (/fire/.test(lower))                      return 'FIRE'
  if (/flood/.test(lower))                     return 'FLOOD'
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

// ─── Process one text file ────────────────────────────────────────────────────

async function processFile(
  filePath: string,
  openai: OpenAI,
  supabase: ReturnType<typeof createClient>
): Promise<{ inserted: number; chunks: number }> {
  const filename     = path.basename(filePath)
  const sourceLabel  = filename.replace(/\.txt$/i, '')
  const scenarioType = inferScenarioType(sourceLabel)

  const rawText = fs.readFileSync(filePath, 'utf-8')
  if (!rawText.trim()) {
    console.warn(`   ⚠️  Empty file — skipping.`)
    return { inserted: 0, chunks: 0 }
  }

  const chunks = chunkText(rawText)
  console.log(`   ✂️  ${chunks.length} chunks  [${scenarioType}]`)

  let inserted = 0

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

    // Build rows for this batch only, then immediately upsert
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

    console.log(` ✅`)
  }

  return { inserted, chunks: chunks.length }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  validateEnv()

  if (!fs.existsSync(TEXT_DIR)) {
    console.error(`\n❌  docs/text/ folder not found.`)
    console.error(`    Run first:  python3 scripts/pdf_to_text.py\n`)
    process.exit(1)
  }

  const textFiles = fs
    .readdirSync(TEXT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort()
    .map((f) => path.join(TEXT_DIR, f))

  if (textFiles.length === 0) {
    console.warn('\n⚠️  No .txt files found in docs/text/.')
    console.warn('    Run first:  python3 scripts/pdf_to_text.py\n')
    return
  }

  console.log(`\n📚  Found ${textFiles.length} text file(s) to ingest:`)
  textFiles.forEach((f) => {
    const kb = (fs.statSync(f).size / 1024).toFixed(0)
    console.log(`   • ${path.basename(f).padEnd(54)} ${kb.padStart(6)} KB`)
  })
  console.log()

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  let totalInserted = 0
  let totalChunks   = 0
  const failed: string[] = []

  for (let i = 0; i < textFiles.length; i++) {
    const filePath = textFiles[i]
    const label    = path.basename(filePath)
    console.log(`\n─── [${i + 1}/${textFiles.length}] ${label}`)

    try {
      const { inserted, chunks } = await processFile(filePath, openai, supabase)
      totalInserted += inserted
      totalChunks   += chunks
      console.log(`   ✅  ${inserted} / ${chunks} chunks stored.`)
    } catch (err) {
      console.error(`   ❌  FAILED: ${err}`)
      failed.push(label)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅  Ingestion complete.`)
  console.log(`    ${totalInserted} chunks stored across ${textFiles.length - failed.length} file(s).`)
  if (failed.length > 0) {
    console.log(`\n⚠️  Failed files (${failed.length}):`)
    failed.forEach((f) => console.log(`   • ${f}`))
  }
  console.log('═'.repeat(60) + '\n')
}

main().catch((err) => {
  console.error('\n❌  Ingest crashed:', err)
  process.exit(1)
})
