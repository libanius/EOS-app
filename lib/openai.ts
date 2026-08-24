import OpenAI from 'openai'

let client: OpenAI | null = null

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

export function getOpenAIModel() {
  // Trim defensively: a stray quote/newline in the env var (e.g. "gpt-5\n")
  // would otherwise be sent as an invalid model id. Empty → safe default.
  const model = (process.env.OPENAI_MODEL || '').trim()
  // `gpt-4o-mini` era o padrão e é o modelo mais fraco da casa. Para um copiloto
  // que instrui uma família numa emergência, a diferença de raciocínio importa
  // mais que a diferença de centavos por chamada.
  return model || 'gpt-4.1'
}

/**
 * Parâmetros de geração corretos para CADA família de modelo.
 *
 * Os modelos de raciocínio (gpt-5, o3, o4) recusam `max_tokens` — exigem
 * `max_completion_tokens` — e ignoram `temperature`. Pior: eles gastam tokens de
 * RACIOCÍNIO dentro do mesmo orçamento, então um limite pensado para a resposta
 * visível trunca o JSON no meio. Medido: 78 tokens de saída para responder
 * `{"ok":true}`, dos quais 64 foram raciocínio.
 *
 * Isto existe para que trocar `OPENAI_MODEL` seja uma decisão de produto e não
 * um bug: qualquer modelo suportado passa a funcionar sem editar chamadas.
 */
export function generationParams(model: string, opts: { maxOutputTokens: number; temperature?: number }) {
  const reasoning = /^(gpt-5|o[34])/.test(model)
  if (reasoning) {
    return {
      // Folga tripla: o orçamento é dividido com o raciocínio, e uma resposta
      // truncada aqui vira JSON quebrado na tela do usuário.
      max_completion_tokens: opts.maxOutputTokens * 3,
    }
  }
  return {
    max_tokens: opts.maxOutputTokens,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  }
}
