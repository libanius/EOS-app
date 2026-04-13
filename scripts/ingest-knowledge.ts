#!/usr/bin/env ts-node
/**
 * EOS Knowledge Base Ingestion Script
 * ------------------------------------
 * Reads PDF files, chunks them into ~400-token segments,
 * generates OpenAI embeddings, and inserts into Supabase pgvector.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/ingest-knowledge.ts
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (not anon — needs INSERT on knowledge_base)
 *   OPENAI_API_KEY
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// ─── Config ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 400        // target tokens per chunk (≈ 300 words)
const CHUNK_OVERLAP = 50      // token overlap between chunks
const EMBEDDING_MODEL = 'text-embedding-3-small'  // 1536 dims — matches schema
const BATCH_SIZE = 20         // embeddings per API call (max 2048)

// Map filenames → scenario types (null = GENERAL, applies to all)
const PDF_CONFIG: Array<{
  file: string
  source: string
  scenarioType: string | null
}> = [
  {
    file: 'FEMA_Emergency_Supply_List.pdf',
    source: 'FEMA Emergency Supply List',
    scenarioType: null,
  },
  {
    file: 'Red_Cross_Disaster_Handbook.pdf',
    source: 'Red Cross Disaster Handbook',
    scenarioType: null,
  },
  {
    file: 'CDC_Emergency_Preparedness_Capabilities.pdf',
    source: 'CDC Emergency Preparedness',
    scenarioType: null,
  },
  {
    file: 'Military_Survival_FM_21-76.pdf',
    source: 'Military Survival FM 21-76',
    scenarioType: null,
  },
  {
    file: 'SAS_Survival_Handbook.pdf',
    source: 'SAS Survival Handbook',
    scenarioType: null,
  },
]

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local not found — copy .env.example and fill in your keys')
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '')
    }
  }
}

// ─── Text Chunking ────────────────────────────────────────────────────────────

/**
 * Rough token estimator: 1 token ≈ 4 chars for English/Portuguese.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function chunkText(text: string): string[] {
  // Split on paragraph/sentence boundaries first
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 20)

  const chunks: string[] = []
  let current = ''
  let currentTokens = 0

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)

    if (currentTokens + paraTokens > CHUNK_SIZE && current) {
      chunks.push(current.trim())
      // Keep overlap: last N tokens worth of text
      const words = current.split(' ')
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP * 4 / 5))
      current = overlapWords.join(' ') + ' ' + para
      currentTokens = estimateTokens(current)
    } else {
      current += (current ? '\n\n' : '') + para
      currentTokens += paraTokens
    }
  }

  if (current.trim().length > 30) {
    chunks.push(current.trim())
  }

  return chunks
}

// ─── PDF Reading ──────────────────────────────────────────────────────────────

async function extractPdfText(filePath: string): Promise<string> {
  try {
    // Dynamic import — pdf-parse must be installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    return data.text as string
  } catch (err) {
    throw new Error(`Failed to parse PDF ${filePath}: ${err}`)
  }
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

async function generateEmbeddings(
  openai: OpenAI,
  texts: string[]
): Promise<number[][]> {
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    })
    allEmbeddings.push(...response.data.map((d) => d.embedding))
    process.stdout.write(`  embeddings ${i + batch.length}/${texts.length}\r`)
  }

  return allEmbeddings
}

// ─── Supabase Insert ──────────────────────────────────────────────────────────

async function insertChunks(
  supabase: ReturnType<typeof createClient>,
  chunks: Array<{
    content: string
    embedding: number[]
    source: string
    scenarioType: string | null
    chunkIndex: number
  }>
): Promise<void> {
  const rows = chunks.map((c) => ({
    content: c.content,
    embedding: `[${c.embedding.join(',')}]`,
    source: c.source,
    scenario_type: c.scenarioType?.toUpperCase() ?? null,
    chunk_index: c.chunkIndex,
  }))

  const { error } = await supabase.from('knowledge_base').insert(rows)
  if (error) throw new Error(`Supabase insert error: ${error.message}`)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧠 EOS Knowledge Base Ingestion\n')

  loadEnv()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!supabaseUrl || !supabaseKey || !openaiKey) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY'
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const openai = new OpenAI({ apiKey: openaiKey })

  // Locate PDFs — check common paths
  const possibleRoots = [
    path.join(process.cwd(), 'Source'),
    path.join(process.cwd(), '..', 'EOS', 'Source '),
    path.join(process.cwd(), 'pdfs'),
  ]

  let pdfRoot: string | null = null
  for (const r of possibleRoots) {
    if (fs.existsSync(r)) {
      pdfRoot = r
      break
    }
  }

  if (!pdfRoot) {
    throw new Error(
      `PDF folder not found. Expected one of:\n${possibleRoots.join('\n')}\n\n` +
        'Copy the source PDFs into a "Source" folder next to this script, or adjust possibleRoots.'
    )
  }

  console.log(`📁 PDF root: ${pdfRoot}\n`)

  // Clear existing embeddings (fresh ingest)
  console.log('🗑  Clearing existing knowledge_base rows...')
  const { error: clearErr } = await supabase
    .from('knowledge_base')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all
  if (clearErr) console.warn(`  Warning clearing table: ${clearErr.message}`)

  let totalChunks = 0

  for (const cfg of PDF_CONFIG) {
    const filePath = path.join(pdfRoot, cfg.file)

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Not found, skipping: ${cfg.file}`)
      continue
    }

    console.log(`\n📄 Processing: ${cfg.source}`)

    // Extract text
    process.stdout.write('  Extracting text...')
    const rawText = await extractPdfText(filePath)
    console.log(` ${rawText.length} chars`)

    // Chunk
    const textChunks = chunkText(rawText)
    console.log(`  Chunked into ${textChunks.length} segments`)

    // Embed
    process.stdout.write('  Generating embeddings...')
    const embeddings = await generateEmbeddings(openai, textChunks)
    console.log('')

    // Insert
    process.stdout.write('  Inserting into Supabase...')
    const rows = textChunks.map((content, i) => ({
      content,
      embedding: embeddings[i],
      source: cfg.source,
      scenarioType: cfg.scenarioType,
      chunkIndex: i,
    }))

    await insertChunks(supabase, rows)
    console.log(` ✓ ${rows.length} rows inserted`)
    totalChunks += rows.length
  }

  console.log(`\n✅ Done! ${totalChunks} total chunks ingested into knowledge_base.\n`)
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
