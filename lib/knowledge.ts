/**
 * EOS — Knowledge Base (RAG)
 *
 * getRelevantChunks:
 *   1. Generates an embedding for the query text via OpenAI text-embedding-3-small
 *   2. Calls match_documents RPC on Supabase (pgvector cosine similarity)
 *   3. Returns string[] of relevant content chunks
 */

import { createClient } from '@supabase/supabase-js'
import { getOpenAIClient } from './openai'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchDocumentsRow {
  content: string
  source: string
  similarity: number
}

// ─── Supabase admin client (service role — bypasses RLS) ─────────────────────

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[EOS] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Retrieve the most semantically relevant knowledge-base chunks for a query.
 *
 * @param query        - Natural-language scenario description sent by the user
 * @param scenarioType - Optional scenario type to narrow results (e.g. "hurricane")
 * @returns            - Array of content strings, highest similarity first
 */
export async function getRelevantChunks(
  query: string,
  scenarioType?: string
): Promise<string[]> {
  // 1. Generate query embedding (text-embedding-3-small → 1536 dims)
  let queryEmbedding: number[]
  try {
    const openai = getOpenAIClient()
    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query.slice(0, 8192), // safety truncation
    })
    queryEmbedding = embeddingRes.data[0].embedding
  } catch (err) {
    console.error('[EOS] Embedding generation failed:', err)
    return []
  }

  // 2. Vector similarity search via Supabase RPC
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5,
      filter_scenario_type: scenarioType ?? null,
    })

    if (error) {
      console.error('[EOS] match_documents RPC error:', error)
      return []
    }

    // 3. Return only the content strings
    return (data as MatchDocumentsRow[]).map((row) => row.content)
  } catch (err) {
    console.error('[EOS] Supabase RPC call failed:', err)
    return []
  }
}
