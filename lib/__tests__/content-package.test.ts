import {
  eduVideoFor,
  isYoutubeId,
  lessonToEdu,
  packageHash,
  packageProblems,
  previewSignal,
  rowToSignal,
  signalVideoFor,
  type ContentPackage,
  type SignalRow,
} from '@/lib/content-package'
import { signalBySlug } from '@/lib/signals-content'
import { fortressPackage } from './fixtures/content-fortress'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

describe('packageProblems — contrato da pauta (CONTENT-001 §4.1, §5)', () => {
  it('a pauta do FORTRESS é válida', () => {
    expect(packageProblems(fortressPackage())).toEqual([])
  })

  it('não quebra com lixo: devolve problemas', () => {
    expect(packageProblems(null)).toEqual(['pauta não é um objeto'])
    expect(packageProblems({}).length).toBeGreaterThan(3)
    expect(packageProblems({ schema: 'eos.content/1', signal: { sources: [1], protocol: { degrees: ['D3'], items: [null] } } }).length).toBeGreaterThan(3)
  })

  it('E5: o pipeline não publica', () => {
    const p = { ...fortressPackage(), status: 'published' }
    expect(packageProblems(p).join()).toMatch(/publicar é no EOS/)
  })

  it('E3: "o que não é" vazio em um idioma é rejeitado', () => {
    const p = clone(fortressPackage())
    p.signal.whatItIsNot.en = '  '
    expect(packageProblems(p)).toContain('signal.whatItIsNot vazio em um idioma')
  })

  it('§5.3: resumo e linha de fonte também exigem os dois idiomas', () => {
    const p = clone(fortressPackage())
    p.signal.summary.pt = ''
    p.signal.sourceLine.en = ''
    const problems = packageProblems(p)
    expect(problems).toContain('signal.summary vazio em um idioma')
    expect(problems).toContain('signal.sourceLine vazio em um idioma')
  })

  it('E4: AGIR sem alerta oficial é rejeitado', () => {
    const p = clone(fortressPackage())
    p.signal.level = 'AGIR'
    expect(packageProblems(p)).toContain('AGIR sem alerta oficial')
  })

  it('sem fonte é rejeitado', () => {
    const p = clone(fortressPackage())
    p.signal.sources = []
    expect(packageProblems(p)).toContain('sem fonte')
  })

  it('§5.5: lição curta demais em um idioma é rejeitada', () => {
    const p = clone(fortressPackage())
    p.lesson.body.en = 'Store water.'
    expect(packageProblems(p).join()).toMatch(/lesson\.body\.en com menos de 160/)
  })

  it('§5.7: vídeo só com ID de 11 caracteres', () => {
    expect(packageProblems(fortressPackage({ video: { pt: { youtubeId: 'dQw4w9WgXcQ' } } }))).toEqual([])
    expect(packageProblems(fortressPackage({ video: { pt: { youtubeId: 'https://youtu.be/dQw4w9WgXcQ' } } })).join()).toMatch(/youtubeId inválido/)
    expect(packageProblems({ ...fortressPackage(), video: { es: { youtubeId: 'dQw4w9WgXcQ' } } }).join()).toMatch(/idioma desconhecido/)
  })

  it('slug e versão inválidos', () => {
    expect(packageProblems(fortressPackage({ slug: 'Fortress 90' }))).toContain('slug inválido')
    expect(packageProblems(fortressPackage({ version: 0 }))).toContain('version deve ser inteiro ≥ 1')
  })
})

describe('packageHash — idempotência (E1/E2)', () => {
  it('ordem de chaves e espaços nas pontas não mudam o hash', () => {
    const a = fortressPackage()
    const b = clone(a)
    b.lesson.summary.pt = `  ${b.lesson.summary.pt}  `
    const reordered = Object.fromEntries(Object.entries(b).reverse())
    expect(packageHash(reordered)).toBe(packageHash(a))
  })

  it('conteúdo diferente muda o hash', () => {
    const b = clone(fortressPackage())
    b.signal.curatorNote.pt += ' Sem pânico.'
    expect(packageHash(b)).not.toBe(packageHash(fortressPackage()))
  })
})

describe('saídas da pauta', () => {
  it('a prévia é o mesmo Sinal que as telas já mostram', () => {
    const current = signalBySlug('fortress')!
    const preview = previewSignal(fortressPackage(), current.publishedOn)
    expect({ ...preview, reviewedByCurator: false }).toEqual(current)
  })

  it('rowToSignal devolve a linha do banco no tipo das telas', () => {
    const pkg = fortressPackage()
    const s = pkg.signal
    const row: SignalRow = {
      slug: pkg.slug, status: 'published', version: 2, level: s.level, occurred_on: s.occurredOn,
      published_on: '2026-11-06', region: { scope: 'national' }, official_alert: s.officialAlert,
      reviewed_by_curator: true,
      content: { title: s.title, summary: s.summary, whatItIs: s.whatItIs, whatItIsNot: s.whatItIsNot, curatorNote: s.curatorNote, sourceLine: s.sourceLine },
      sources: s.sources, protocol: s.protocol, video: null,
    }
    expect(rowToSignal(row)).toEqual(previewSignal(pkg, '2026-11-06'))
  })

  it('lessonToEdu: colunas antigas em PT, transcript com os dois idiomas, origem no Sinal', () => {
    const edu = lessonToEdu(fortressPackage({ video: { en: { youtubeId: 'a1B2c3D4e5F' } } }))
    const pkg = fortressPackage()
    expect(edu.title).toBe(pkg.lesson.title.pt)
    expect(edu.transcript).toContain(pkg.lesson.body.pt)
    expect(edu.transcript).toContain(pkg.lesson.body.en)
    expect(edu.source_type).toBe('youtube')
    expect(edu.source_url).toBe('/sinais/fortress')
    expect(edu.content_slug).toBe('fortress')
    expect(lessonToEdu(pkg).source_type).toBe('manual')
    expect(lessonToEdu(pkg).video).toBeNull()
  })
})

describe('vídeo por idioma (D-P5)', () => {
  const both = { pt: { youtubeId: 'dQw4w9WgXcQ' }, en: { youtubeId: 'a1B2c3D4e5F' } }

  it('cada idioma vê o seu vídeo', () => {
    expect(signalVideoFor(both, 'pt')).toBe('dQw4w9WgXcQ')
    expect(signalVideoFor(both, 'en')).toBe('a1B2c3D4e5F')
  })

  it('E8: sem vídeo no idioma da pessoa, nenhum vídeo', () => {
    expect(signalVideoFor({ pt: both.pt }, 'en')).toBeNull()
    expect(signalVideoFor(null, 'pt')).toBeNull()
  })

  it('EDU: item da pauta escolhe pelo idioma; item antigo segue com source_url', () => {
    expect(eduVideoFor({ video: { pt: both.pt }, source_type: 'youtube', source_url: '/sinais/x' }, 'en')).toBeNull()
    expect(eduVideoFor({ video: both, source_type: 'youtube', source_url: '/sinais/x' }, 'en')).toEqual({ kind: 'id', youtubeId: 'a1B2c3D4e5F' })
    expect(eduVideoFor({ video: null, source_type: 'youtube', source_url: 'https://youtu.be/dQw4w9WgXcQ' }, 'en')).toEqual({ kind: 'legacy', url: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(eduVideoFor({ source_type: 'manual', source_url: null }, 'pt')).toBeNull()
  })

  it('isYoutubeId', () => {
    expect(isYoutubeId('dQw4w9WgXcQ')).toBe(true)
    expect(isYoutubeId('dQw4w9WgXc')).toBe(false)
    expect(isYoutubeId('dQw4w9WgXc!')).toBe(false)
  })
})

// O tipo da fixture tem que continuar compatível com o contrato.
const _typecheck: ContentPackage = fortressPackage()
void _typecheck
