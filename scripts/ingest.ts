/**
 * EOS — Knowledge Base Ingestion Script
 *
 * Pipeline:
 *   docs/*.pdf  →  text extraction  →  chunking  →  OpenAI embeddings  →  Supabase knowledge_base
 *
 * Usage:
 *   npm run ingest
 *
 * Required env vars (add to .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY     ← needed to bypass RLS for inserts
 *   OPENAI_API_KEY
 *
 * Place PDFs in the docs/ folder. File name → scenario_type mapping:
 *   fema*          → GENERAL
 *   red*cross*     → GENERAL
 *   cdc*           → PANDEMIC
 *   bible*         → GENERAL
 *   psych*         → GENERAL
 *   hurricane*     → HURRICANE
 *   earthquake*    → EARTHQUAKE
 *   flood*         → FLOOD
 *   fire*          → FIRE
 *   fallout*       → FALLOUT
 *   (default)      → GENERAL
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load .env.local before anything else
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
// pdf-parse is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  dataBuffer: Buffer
) => Promise<{ text: string }>

// ─── Config ───────────────────────────────────────────────────────────────────

const DOCS_DIR = path.resolve(process.cwd(), 'docs')
const CHUNK_SIZE = 1500        // characters per chunk (≈ 300–400 tokens)
const CHUNK_OVERLAP = 200      // character overlap between consecutive chunks
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_BATCH = 20     // chunks per OpenAI embedding batch call
const UPSERT_BATCH = 50        // rows per Supabase upsert call

type ScenarioTypeEnum =
  | 'HURRICANE'
  | 'EARTHQUAKE'
  | 'FALLOUT'
  | 'PANDEMIC'
  | 'FIRE'
  | 'FLOOD'
  | 'GENERAL'

// ─── Filename → scenario_type ─────────────────────────────────────────────────

function inferScenarioType(filename: string): ScenarioTypeEnum {
  const lower = filename.toLowerCase()
  if (/hurricane/.test(lower)) return 'HURRICANE'
  if (/earthquake/.test(lower)) return 'EARTHQUAKE'
  if (/fallout|nuclear|radiation/.test(lower)) return 'FALLOUT'
  if (/pandemic|cdc|covid|virus/.test(lower)) return 'PANDEMIC'
  if (/fire/.test(lower)) return 'FIRE'
  if (/flood/.test(lower)) return 'FLOOD'
  return 'GENERAL'
}

// ─── Text chunking ────────────────────────────────────────────────────────────

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  // Normalise whitespace
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return []

  const chunks: string[] = []
  let start = 0

  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length)
    // Try to break at a sentence or paragraph boundary
    let breakAt = end
    if (end < clean.length) {
      const searchFrom = Math.max(start, end - 200)
      const idx = clean.lastIndexOf('. ', end)
      if (idx > searchFrom) breakAt = idx + 1
    }
    const chunk = clean.slice(start, breakAt).trim()
    if (chunk.length > 50) chunks.push(chunk) // skip tiny leftovers
    start = breakAt - overlap
    if (start <= 0 || start >= clean.length) break
  }

  return chunks
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEnv() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ]
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(
      `\n❌  Missing environment variables:\n   ${missing.join('\n   ')}\n` +
        `\nAdd them to .env.local and re-run.\n`
    )
    process.exit(1)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  validateEnv()

  // ── Clients ──
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // ── Discover PDFs ──
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`\n❌  docs/ folder not found at ${DOCS_DIR}`)
    console.error(
      '   Create it and add your PDF files (FEMA, Red Cross, CDC, Bible, Psychological).\n'
    )
    process.exit(1)
  }

  const pdfFiles = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => path.join(DOCS_DIR, f))

  if (pdfFiles.length === 0) {
    console.warn(
      '\n⚠️  No PDF files found in docs/. Nothing to ingest.\n' +
        '   Drop your PDFs there and run npm run ingest again.\n'
    )
    return
  }

  console.log(`\n📚  Found ${pdfFiles.length} PDF(s) to ingest:`)
  pdfFiles.forEach((f) => console.log(`   • ${path.basename(f)}`))
  console.log()

  let totalChunks = 0
  let totalInserted = 0

  for (const pdfPath of pdfFiles) {
    const filename = path.basename(pdfPath)
    const scenarioType = inferScenarioType(filename)
    const sourceLabel = filename.replace(/\.pdf$/i, '')

    console.log(`\n📄  Processing: ${filename}  [${scenarioType}]`)

    // ── Extract text ──
    let rawText = ''
    try {
      const buffer = fs.readFileSync(pdfPath)
      const parsed = await pdfParse(buffer)
      rawText = parsed.text
    } catch (err) {
      console.error(`   ⚠️  Failed to parse PDF: ${err}`)
      continue
    }

    if (!rawText.trim()) {
      console.warn('   ⚠️  No text extracted — scanned image PDF? Skipping.')
      continue
    }

    // ── Chunk ──
    const chunks = chunkText(rawText, CHUNK_SIZE, CHUNK_OVERLAP)
    console.log(`   ✂️  ${chunks.length} chunks created`)
    totalChunks += chunks.length

    // ── Embed in batches ──
    const rows: {
      content: string
      embedding: number[]
      source: string
      scenario_type: ScenarioTypeEnum
      chunk_index: number
    }[] = []

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH)
      process.stdout.write(
        `   🔢  Embedding chunks ${i + 1}–${Math.min(i + EMBEDDING_BATCH, chunks.length)} / ${chunks.length}...`
      )

      try {
        const embRes = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
        })

        embRes.data.forEach((item, idx) => {
          rows.push({
            content: batch[idx],
            embedding: item.embedding,
            source: sourceLabel,
            scenario_type: scenarioType,
            chunk_index: i + idx,
          })
        })
        console.log(' ✅')
      } catch (err) {
        console.error(`\n   ❌  Embedding batch failed: ${err}`)
        continue
      }
    }

    // ── Upsert into Supabase ──
    console.log(`   💾  Inserting ${rows.length} rows into knowledge_base...`)

    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const batch = rows.slice(i, i + UPSERT_BATCH)
      const { error } = await supabase.from('knowledge_base').insert(batch)

      if (error) {
        console.error(
          `   ❌  Supabase insert error (chunk ${i}–${i + batch.length}):`,
          error.message
        )
      } else {
        totalInserted += batch.length
        process.stdout.write('.')
      }
    }
    console.log(` done`)
  }

  console.log(
    `\n✅  Ingestion complete — ${totalInserted} / ${totalChunks} chunks stored in knowledge_base.\n`
  )
}

main().catch((err) => {
  console.error('\n❌  Ingest script crashed:', err)
  process.exit(1)
})
