#!/usr/bin/env node
/**
 * EOS — ingest.mjs  (zero dependencies — uses native Node fetch)
 *
 * Reads pre-converted text files from docs/text/, chunks each one,
 * calls OpenAI Embeddings API with native fetch, and upserts to Supabase.
 *
 * No openai package. No supabase-js package. No tsx. No bundling.
 *
 * Run python3 scripts/pdf_to_text.py first if docs/text/ is empty.
 *
 * Usage:
 *   node scripts/ingest.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, basename, join } from 'node:path'
import { fileURLToPath }           from 'node:url'
import { createRequire }           from 'node:module'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require   = createRequire(import.meta.url)

// Only heavy import: dotenv — 500KB, fast to compile
const dotenv = require('dotenv')
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

// ─── Config ────────────────────────────────────────────────────────────────────

const TEXT_DIR        = resolve(__dirname, '..', 'docs', 'text')
const CHUNK_SIZE      = 1500
const CHUNK_OVERLAP   = 200
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_BATCH = 20
const UPSERT_BATCH    = 50

// ─── Env ───────────────────────────────────────────────────────────────────────

function requireEnv (key) {
  const val = process.env[key]
  if (!val) { console.error(`❌  Missing env var: ${key}`); process.exit(1) }
  return val
}

// ─── API helpers (native fetch — Node 18+) ────────────────────────────────────

async function embedBatch (texts, apiKey) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err}`)
  }
  const json = await res.json()
  return json.data  // [{embedding: [...], index: N}]
}

async function supabaseInsert (rows, url, key) {
  const res = await fetch(`${url}/rest/v1/knowledge_base`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase ${res.status}: ${err}`)
  }
}

// ─── Chunking ──────────────────────────────────────────────────────────────────

function inferScenarioType (name) {
  const l = name.toLowerCase()
  if (/hurricane/.test(l))                 return 'HURRICANE'
  if (/earthquake/.test(l))                return 'EARTHQUAKE'
  if (/fallout|nuclear|radiation/.test(l)) return 'FALLOUT'
  if (/pandemic|cdc|covid|virus/.test(l))  return 'PANDEMIC'
  if (/fire/.test(l))                      return 'FIRE'
  if (/flood/.test(l))                     return 'FLOOD'
  return 'GENERAL'
}

function chunkText (text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean.length) return []
  const chunks = []
  let start = 0
  while (start < clean.length) {
    const end     = Math.min(start + CHUNK_SIZE, clean.length)
    let   breakAt = end
    if (end < clean.length) {
      const idx = clean.lastIndexOf('. ', end)
      if (idx > Math.max(start, end - 200)) breakAt = idx + 1
    }
    const chunk = clean.slice(start, breakAt).trim()
    if (chunk.length > 50) chunks.push(chunk)
    if (breakAt >= clean.length) break       // reached end — stop
    const nextStart = breakAt - CHUNK_OVERLAP
    if (nextStart <= start) break            // no progress — stop
    start = nextStart
  }
  return chunks
}

// ─── Process one file ──────────────────────────────────────────────────────────

async function processFile (filePath, openaiKey, supabaseUrl, supabaseKey) {
  const filename     = basename(filePath)
  const sourceLabel  = filename.replace(/\.txt$/i, '')
  const scenarioType = inferScenarioType(sourceLabel)

  const rawText = readFileSync(filePath, 'utf-8')
  if (!rawText.trim()) { console.warn('   ⚠️  Empty — skipping.'); return { inserted: 0, chunks: 0 } }

  const chunks = chunkText(rawText)
  console.log(`   ✂️  ${chunks.length} chunks  [${scenarioType}]`)

  let inserted = 0

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH)
    const to    = Math.min(i + EMBEDDING_BATCH, chunks.length)
    process.stdout.write(`   🔢  ${i + 1}–${to} / ${chunks.length} ...`)

    let embData
    try {
      embData = await embedBatch(batch, openaiKey)
    } catch (err) {
      console.error(`\n   ❌  Embedding failed: ${err.message}`)
      continue
    }

    const rows = embData.map((item, idx) => ({
      content:       batch[idx],
      embedding:     item.embedding,
      source:        sourceLabel,
      scenario_type: scenarioType,
      chunk_index:   i + idx,
    }))

    for (let j = 0; j < rows.length; j += UPSERT_BATCH) {
      try {
        await supabaseInsert(rows.slice(j, j + UPSERT_BATCH), supabaseUrl, supabaseKey)
        inserted += Math.min(UPSERT_BATCH, rows.length - j)
      } catch (err) {
        console.error(`\n   ❌  Supabase: ${err.message}`)
      }
    }

    console.log(' ✅')
  }

  return { inserted, chunks: chunks.length }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main () {
  const openaiKey    = requireEnv('OPENAI_API_KEY')
  const supabaseUrl  = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseKey  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!existsSync(TEXT_DIR)) {
    console.error('\n❌  docs/text/ not found. Run:  python3 scripts/pdf_to_text.py\n')
    process.exit(1)
  }

  const files = readdirSync(TEXT_DIR)
    .filter(f => f.toLowerCase().endsWith('.txt'))
    .sort()
    .map(f => join(TEXT_DIR, f))

  if (!files.length) {
    console.warn('\n⚠️  No .txt files in docs/text/. Run:  python3 scripts/pdf_to_text.py\n')
    return
  }

  console.log(`\n📚  Found ${files.length} text file(s) to ingest:`)
  files.forEach(f => {
    const kb = (statSync(f).size / 1024).toFixed(0)
    console.log(`   • ${basename(f).padEnd(54)} ${kb.padStart(6)} KB`)
  })
  console.log()

  let totalInserted = 0
  let totalChunks   = 0
  const failed      = []

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const label    = basename(filePath)
    console.log(`\n─── [${i + 1}/${files.length}] ${label}`)

    try {
      const { inserted, chunks } = await processFile(filePath, openaiKey, supabaseUrl, supabaseKey)
      totalInserted += inserted
      totalChunks   += chunks
      console.log(`   ✅  ${inserted} / ${chunks} chunks stored.`)
    } catch (err) {
      console.error(`   ❌  FAILED: ${err.message}`)
      failed.push(label)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅  Ingestion complete.`)
  console.log(`    ${totalInserted} chunks stored across ${files.length - failed.length} file(s).`)
  if (failed.length) {
    console.log(`\n⚠️  Failed (${failed.length}):`)
    failed.forEach(f => console.log(`   • ${f}`))
  }
  console.log('═'.repeat(60) + '\n')
}

main().catch(err => { console.error('\n❌  Crash:', err); process.exit(1) })
