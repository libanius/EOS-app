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
/**
 * O acervo do EOS é TODO em inglês (FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL) e
 * o dono pergunta em português. A distância entre idiomas come exatamente a
 * margem de similaridade que a busca exige — medido: "Como estocar alimentos"
 * pontuava 0,598 e não passava do limiar, enquanto "how to store food" pontuava
 * 0,708 e passava. O mesmo assunto, o mesmo corpus, resposta oposta.
 *
 * Traduzir a CONSULTA (não o acervo) resolve pelo lado barato: uma chamada curta
 * antes do embedding, contra reindexar 3.887 trechos.
 *
 * Falhar aqui não pode calar a busca: se a tradução não vier, segue com o texto
 * original — pior recall é melhor que recall nenhum.
 */
async function toEnglishQuery(query: string): Promise<string> {
  // Consulta já majoritariamente ASCII sem acentos: provavelmente inglês.
  if (!/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(query) && /^[\x00-\x7F]*$/.test(query)) return query

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',   // tarefa mecânica: o modelo barato basta e é rápido
      max_tokens: 120,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Translate the user text to English. It is a search query for an emergency-preparedness library. Reply with the translation only, no quotes, no explanation.',
        },
        { role: 'user', content: query.slice(0, 500) },
      ],
    })
    const translated = completion.choices[0]?.message?.content?.trim()
    return translated || query
  } catch {
    return query
  }
}

export async function getRelevantChunks(
  query: string,
  scenarioType?: string
): Promise<string[]> {
  const englishQuery = await toEnglishQuery(query)

  // 1. Generate query embedding (text-embedding-3-small → 1536 dims)
  let queryEmbedding: number[]
  try {
    const openai = getOpenAIClient()
    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: englishQuery.slice(0, 8192), // safety truncation
    })
    queryEmbedding = embeddingRes.data[0].embedding
  } catch (err) {
    console.error('[EOS] Embedding generation failed:', err)
    return []
  }

  // 2. Vector similarity search via Supabase RPC
  try {
    const supabase = getSupabaseAdmin()

    /**
     * 0,45, e não 0,7.
     *
     * Medido no acervo real: nem "food storage stockpile" (0,658), em inglês,
     * passava de 0,7. Na prática o limiar antigo mantinha o RAG DESLIGADO para
     * quase toda pergunta, e o Pilot respondia do próprio modelo enquanto o
     * acervo do EOS ficava intocado.
     *
     * Um trecho fracamente relacionado é enviado como CONTEXTO, não como
     * verdade — o prompt manda usar e citar quando útil. O risco de um trecho a
     * mais é baixo; o de nenhum trecho é responder sem fonte nenhuma.
     */
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.45,
      match_count: 8,
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
