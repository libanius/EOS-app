import { NextRequest } from 'next/server'
import { POST } from '@/app/api/pilot/chat/route'
import { loadPilotCatalog } from '@/lib/pilot-content'
import { getRelevantKnowledge } from '@/lib/knowledge'
import { getOpenAIClient } from '@/lib/openai'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test' } } }) }, from: () => { throw new Error('not available') } })) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => null }))
jest.mock('@/lib/rate-limit', () => ({ enforceAiBudget: async () => null }))
jest.mock('@/lib/error-log', () => ({ logError: jest.fn() }))
jest.mock('@/lib/household', () => ({ getHousehold: async () => { throw new Error('not available') }, householdDays: () => ({ autonomy: null, water: null, food: null, power: null, fuel: null }) }))
jest.mock('@/lib/knowledge', () => ({ getRelevantKnowledge: jest.fn(async () => []) }))
jest.mock('@/lib/pilot-content', () => ({ ...jest.requireActual('@/lib/pilot-content'), loadPilotCatalog: jest.fn() }))
jest.mock('@/lib/openai', () => ({ getOpenAIClient: jest.fn(), getOpenAIModel: () => 'test-model', generationParams: () => ({}) }))

const completion = jest.fn()
const reply = { reply: 'O EOS publicou Fortress.', mode: 'learn', sources: [], tasks: [], destinations: [], memory: [] }
function request(stream = false) {
  return new NextRequest(`https://eos.test/api/pilot/chat${stream ? '?stream=1' : ''}`, {
    method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'O que é Fortress?' }], context: { pt: true, riskState: 'safe', headline: 'safe' } }),
  })
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getOpenAIClient).mockReturnValue({ chat: { completions: { create: completion } } } as never)
  jest.mocked(loadPilotCatalog).mockResolvedValue({ docs: [{ id: 'signal:fortress', title: 'Fortress', searchTitle: 'Fortress', kind: 'signal', version: 'v2', text: 'PUBLICAÇÃO ATUAL: o que é e o que não é.', href: '/sinais/fortress' }], unavailable: [] })
  jest.mocked(getRelevantKnowledge).mockResolvedValue([])
  completion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(reply) } }] })
})

it('passes current editorial context to the model and returns server-generated links in JSON', async () => {
  const response = await POST(request())
  const data = await response.json()
  expect(data.reply).toBe(reply.reply)
  expect(data.contentLinks).toEqual([{ label: 'Sinal / protocolo: Fortress', href: '/sinais/fortress' }])
  expect(completion.mock.calls[0][0].messages[0].content).toContain('PUBLICAÇÃO ATUAL')
  expect(data.guard).toBeDefined()
})
it('returns the same consulted links in SSE done without waiting for model-generated citations', async () => {
  completion.mockResolvedValue((async function* () {
    yield { choices: [{ delta: { content: JSON.stringify(reply) } }] }
  })())
  const response = await POST(request(true))
  const body = await response.text()
  expect(body).toContain('event: delta')
  const done = body.split('event: done\ndata: ')[1].split('\n')[0]
  expect(JSON.parse(done).contentLinks[0].href).toBe('/sinais/fortress')
  expect(JSON.parse(done).reply).toBe(reply.reply)
})
it('keeps direct published content available when embedding/RAG fails and tells the model about the failure', async () => {
  jest.mocked(getRelevantKnowledge).mockRejectedValue(new Error('embedding unavailable'))
  const response = await POST(request())
  expect((await response.json()).contentLinks[0].href).toBe('/sinais/fortress')
  expect(completion.mock.calls[0][0].messages[0].content).toContain('Falha ao consultar: base documental RAG')
})
