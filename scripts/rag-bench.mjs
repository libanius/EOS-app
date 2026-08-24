/**
 * Banco de provas do RAG do EOS (D-083).
 *
 * O dono testou o índice com "Como estocar alimentos" e ele devolveu ZERO
 * trechos no limiar de produção. Duas causas medidas:
 *
 *  1. o acervo é TODO em inglês e ele pergunta em português — a distância entre
 *     idiomas come a margem de similaridade;
 *  2. o limiar de 0,7 era alto demais até para consultas em inglês.
 *
 * Este script mede as duas coisas com perguntas REAIS em português, comparando a
 * consulta crua com a consulta traduzida, em vários limiares. Sem isso, "ajustar
 * o limiar" seria chute — e chute em recuperação de informação normalmente troca
 * um problema por outro.
 *
 *   node scripts/rag-bench.mjs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/** Perguntas que uma família faz de verdade, no idioma em que ela fala. */
const PERGUNTAS = [
  'Como estocar alimentos',
  'Quanta água guardar por pessoa',
  'O que fazer durante um furacão',
  'Como purificar água',
  'Meu filho tem asma, o que preciso ter em casa',
  'Como montar um kit de primeiros socorros',
  'Quando devo evacuar',
  'O que fazer se a energia cair por vários dias',
]

const LIMIARES = [0.7, 0.6, 0.5, 0.45, 0.4]

async function traduzir(texto) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 120,
    temperature: 0,
    messages: [
      { role: 'system', content: 'Translate the user text to English. It is a search query for an emergency-preparedness library. Reply with the translation only.' },
      { role: 'user', content: texto },
    ],
  })
  return r.choices[0]?.message?.content?.trim() ?? texto
}

async function buscar(texto, limiar) {
  const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: texto })
  const { data } = await sb.rpc('match_documents', {
    query_embedding: emb.data[0].embedding,
    match_threshold: limiar,
    match_count: 8,
    filter_scenario_type: null,
  })
  return data ?? []
}

console.log('Pergunta                                        | limiar | cru | traduzido | melhor cru | melhor trad')
console.log('─'.repeat(104))

const resumo = { cruZero: 0, tradZero: 0, total: 0 }

for (const pergunta of PERGUNTAS) {
  const emIngles = await traduzir(pergunta)
  for (const limiar of LIMIARES) {
    const [cru, trad] = await Promise.all([buscar(pergunta, limiar), buscar(emIngles, limiar)])
    const melhorCru = cru[0]?.similarity ?? 0
    const melhorTrad = trad[0]?.similarity ?? 0
    console.log(
      `${pergunta.slice(0, 46).padEnd(46)} |  ${limiar.toFixed(2)}  | ${String(cru.length).padStart(3)} | ${String(trad.length).padStart(9)} | ${melhorCru.toFixed(3).padStart(10)} | ${melhorTrad.toFixed(3).padStart(11)}`,
    )
    // O limiar que está em produção é o que interessa para o veredito.
    if (limiar === 0.45) {
      resumo.total += 1
      if (!cru.length) resumo.cruZero += 1
      if (!trad.length) resumo.tradZero += 1
    }
  }
  console.log('─'.repeat(104))
}

console.log(
  `\nNo limiar 0,45: sem resposta em ${resumo.cruZero}/${resumo.total} perguntas cruas e ${resumo.tradZero}/${resumo.total} traduzidas.`,
)
