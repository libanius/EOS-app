/**
 * A porta do pipeline (CONTENT-001 §4.4, critérios 1, 2, 5, 7, 13).
 * O banco é simulado: aqui se testa a rota (autorização, tamanho, validação e o
 * mapa de respostas). As funções SQL têm teste próprio contra Postgres.
 */

const rpc = jest.fn()
const from = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc, from }),
}))
jest.mock('@/lib/content-store', () => ({
  ...jest.requireActual('@/lib/content-store'),
  packageState: jest.fn(async (_a: unknown, slug: string) => ({ slug, latestVersion: 1, liveVersion: null })),
  afterArchive: jest.fn(async () => 'ingested'),
}))

import { NextRequest } from 'next/server'
import { PUT, GET } from '../packages/[slug]/route'
import { fortressPackage } from '@/lib/__tests__/fixtures/content-fortress'
import { packageState, ContentStateReadError } from '@/lib/content-store'

const SECRET = 'test-secret-0123456789'
const req = (body: unknown, secret: string | null = SECRET, method = 'PUT') =>
  new NextRequest('http://localhost/api/content/packages/fortress', {
    method,
    headers: { 'content-type': 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    body: method === 'PUT' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
const ctx = { params: { slug: 'fortress' } }

beforeEach(() => {
  rpc.mockReset()
  jest.mocked(packageState).mockReset().mockImplementation(async (_a, slug) => ({ slug, latestVersion: 1, liveVersion: null } as Awaited<ReturnType<typeof packageState>>))
  process.env.CONTENT_PIPELINE_SECRET = SECRET
  delete process.env.CONTENT_PIPELINE_AGENT_SECRET
})

afterAll(() => {
  delete process.env.CONTENT_PIPELINE_SECRET
  delete process.env.CONTENT_PIPELINE_AGENT_SECRET
})

describe('Credencial de agente (D-239)', () => {
  const agent = 'agent-review-0123456789'
  beforeEach(() => { process.env.CONTENT_PIPELINE_AGENT_SECRET = agent })

  it('envia review sem a chave original e consulta o estado', async () => {
    delete process.env.CONTENT_PIPELINE_SECRET
    rpc.mockResolvedValueOnce({ data: { outcome: 'created' }, error: null })
    expect((await PUT(req(fortressPackage(), agent), ctx)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('receive_content_package', expect.objectContaining({ p_status: 'review' }))
    expect((await GET(req(null, agent, 'GET'), ctx)).status).toBe(200)
  })

  it.each(['draft', 'archived'] as const)('recusa %s antes de qualquer RPC', async status => {
    expect((await PUT(req(fortressPackage({ status }), agent), ctx)).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('não publica nem aceita chave errada', async () => {
    expect((await PUT(req({ ...fortressPackage(), status: 'published' }, agent), ctx)).status).toBe(422)
    expect((await PUT(req(fortressPackage(), 'agent-review-incorrect'), ctx)).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('mantém a chave original com o fluxo de arquivo', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'created' }, error: null })
    expect((await PUT(req(fortressPackage({ status: 'archived' })), ctx)).status).toBe(200)
  })

  it('prefere o escopo restrito quando as duas chaves coincidem', async () => {
    process.env.CONTENT_PIPELINE_AGENT_SECRET = SECRET
    expect((await PUT(req(fortressPackage({ status: 'archived' })), ctx)).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('PUT /api/content/packages/[slug]', () => {
  it('E12: sem segredo no servidor responde 503', async () => {
    delete process.env.CONTENT_PIPELINE_SECRET
    expect((await PUT(req(fortressPackage()), ctx)).status).toBe(503)
  })

  it('critério 1: segredo errado ou ausente responde 401', async () => {
    expect((await PUT(req(fortressPackage(), 'errado'), ctx)).status).toBe(401)
    expect((await PUT(req(fortressPackage(), null), ctx)).status).toBe(401)
  })

  it('E13: acima de 256 KB responde 413', async () => {
    const big = { ...fortressPackage(), pad: 'x'.repeat(260 * 1024) }
    expect((await PUT(req(big), ctx)).status).toBe(413)
  })

  it('critério 2: pauta inválida responde 422 e não chama o banco', async () => {
    const bad = fortressPackage()
    bad.signal.whatItIsNot = { pt: '', en: '' }
    const res = await PUT(req(bad), ctx)
    expect(res.status).toBe(422)
    expect((await res.json()).problems).toContain('signal.whatItIsNot vazio em um idioma')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('critério 5: status published vindo do pipeline responde 422', async () => {
    const res = await PUT(req({ ...fortressPackage(), status: 'published' }), ctx)
    expect(res.status).toBe(422)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('critério 13: URL inteira no lugar do ID do vídeo responde 422', async () => {
    const res = await PUT(req(fortressPackage({ video: { en: { youtubeId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } } })), ctx)
    expect(res.status).toBe(422)
  })

  it('slug do corpo diferente da rota responde 422', async () => {
    expect((await PUT(req(fortressPackage({ slug: 'outro' })), ctx)).status).toBe(422)
  })

  it('JSON quebrado responde 400', async () => {
    expect((await PUT(req('{nope'), ctx)).status).toBe(400)
  })

  it('pauta válida grava pela função e devolve o estado', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'created', version: 1 }, error: null })
    const res = await PUT(req(fortressPackage()), ctx)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('receive_content_package', expect.objectContaining({ p_slug: 'fortress', p_version: 1, p_status: 'review' }))
    expect((await res.json()).outcome).toBe('created')
  })

  it('critério 6 / E1: reenvio igual responde 200 "unchanged"', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'unchanged', version: 1 }, error: null })
    const res = await PUT(req(fortressPackage()), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('unchanged')
  })

  it('critério 7 / E2: mesma versão com outro conteúdo responde 409', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'conflict', version: 1 }, error: null })
    expect((await PUT(req(fortressPackage()), ctx)).status).toBe(409)
  })

  it('§5.8: versão menor que a última responde 409', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'stale', latest: 3 }, error: null })
    expect((await PUT(req(fortressPackage()), ctx)).status).toBe(409)
  })

  it('reenvio de pauta de arquivo tenta de novo o resumo histórico', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'unchanged', version: 2 }, error: null })
    const res = await PUT(req(fortressPackage({ version: 2, status: 'archived' })), ctx)
    expect((await res.json()).archiveRag).toBe('ingested')
  })

  it('pauta de arquivo dispara o resumo histórico no RAG', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'created', version: 2 }, error: null })
    const res = await PUT(req(fortressPackage({ version: 2, status: 'archived' })), ctx)
    expect((await res.json()).archiveRag).toBe('ingested')
  })
})

describe('GET /api/content/packages/[slug]', () => {
  it('falha de leitura é 503, nunca pauta não encontrada', async () => {
    jest.mocked(packageState).mockRejectedValueOnce(new ContentStateReadError('content_packages', 'PGRST205'))
    const res = await GET(req(null, SECRET, 'GET'), ctx)
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('PGRST205')
  })

  it('recebimento confirmado não é escondido quando a leitura falha', async () => {
    rpc.mockResolvedValueOnce({ data: { outcome: 'created' }, error: null })
    jest.mocked(packageState).mockRejectedValueOnce(new ContentStateReadError('content_packages', '42501'))
    const res = await PUT(req(fortressPackage()), ctx)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ received: true, outcome: 'created', version: 1, code: '42501' })
  })
  it('exige o segredo', async () => {
    expect((await GET(req(null, null, 'GET'), ctx)).status).toBe(401)
    expect((await GET(req(null, SECRET, 'GET'), ctx)).status).toBe(200)
  })
})
