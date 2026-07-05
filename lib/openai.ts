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
  return model || 'gpt-4o-mini'
}
