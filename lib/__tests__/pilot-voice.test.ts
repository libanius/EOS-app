import {
  crisisCard,
  detectCrisis,
  detectDistress,
  normalizeMode,
  normalizeSources,
  PILOT_HISTORY,
  toneLine,
  voiceBlock,
} from '../pilot-voice'

describe('PILOT-VOICE-001 · regra 9 — detecção de crise', () => {
  it.each([
    'eu quero me matar',
    'Não quero mais viver',
    'nao aguento mais viver assim',
    'estou pensando em suicídio',
    'seria melhor se eu não existisse',
    'I want to kill myself',
    "I don't want to live anymore",
    'thinking about ending it, I want to die',
    'better off dead',
  ])('detecta: %s', text => {
    expect(detectCrisis(text)).toBe(true)
  })

  it.each([
    'como purificar água de piscina?',
    'posso sair de barco hoje?',
    'a bateria do gerador morreu',
    'o celular vai morrer, como economizar bateria?',
    'my phone is dying, how do I save battery?',
    'quero matar o mosquito da dengue no quintal',
  ])('não detecta: %s', text => {
    expect(detectCrisis(text)).toBe(false)
  })

  it('o cartão traz 988 e 911 nos dois idiomas, sem depender de modelo', () => {
    for (const pt of [true, false]) {
      const card = crisisCard(pt)
      expect(card.reply).toContain('988')
      expect(card.reply).toContain('911')
      expect(card.sources[0].kind).toBe('official')
    }
  })
})

describe('§3.2.1 — tristeza e desânimo', () => {
  it.each(['estou muito triste', 'nem sei mais pra que me preparar', 'perdi minha casa no furacão', 'I feel hopeless'])(
    'detecta: %s',
    text => expect(detectDistress(text)).toBe(true),
  )
  it('pergunta técnica não é sofrimento', () => {
    expect(detectDistress('qual gerador comprar para 3 pessoas?')).toBe(false)
  })
  it('fragilizado desliga o humor e o oferecimento religioso não pedido', () => {
    const line = toneLine('safe', true, true)
    expect(line).toMatch(/humor DESLIGADO/)
    expect(line).toMatch(/Não ofereça apoio religioso/)
  })
})

describe('§3.1 — tom por risco', () => {
  it('dia calmo libera o tamanho e a leveza', () => {
    const line = toneLine('safe', true, false)
    expect(line).not.toMatch(/3 a 5 frases/)
    expect(line).toMatch(/humor/)
  })
  it('crítico proíbe humor', () => {
    expect(toneLine('critical', true, false)).toMatch(/Zero humor/)
  })
  it('valor desconhecido de risco não quebra (cai em watch)', () => {
    expect(toneLine('stable', false, false)).toMatch(/alert/)
  })
})

describe('§3.2 — persona e regras de voz', () => {
  it('a frase antiga "não conversa fiado" não existe mais', () => {
    expect(voiceBlock(true)).not.toMatch(/conversa fiado/)
  })
  it('apoio espiritual só quando pedido e só cristão', () => {
    const v = voiceBlock(true)
    expect(v).toMatch(/quando a pessoa PEDIR/)
    expect(v).toMatch(/cristã/)
    expect(v).toMatch(/NUNCA invente versículo/)
  })
  it('fora do tema: cordial e volta (D1)', () => {
    expect(voiceBlock(true)).toMatch(/ponte natural de volta/)
  })
})

describe('§4.1 — contrato de resposta', () => {
  it('mode inválido vira chat', () => {
    expect(normalizeMode('learn')).toBe('learn')
    expect(normalizeMode('crisis')).toBe('chat')
    expect(normalizeMode(undefined)).toBe('chat')
  })
  it('sources: filtra lixo, deduplica e limita a 4', () => {
    const s = normalizeSources([
      { kind: 'official', label: 'Cruz Vermelha' },
      { kind: 'official', label: 'cruz vermelha' },
      { kind: 'bogus', label: 'x' },
      { kind: 'eos_data', label: '' },
      { kind: 'general_practice', label: 'Prática de preppers' },
      { kind: 'eos_data', label: 'Leitura 14:00' },
      { kind: 'official', label: 'FEMA' },
      { kind: 'official', label: 'CDC' },
    ])
    expect(s).toHaveLength(4)
    expect(s[0]).toEqual({ kind: 'official', label: 'Cruz Vermelha' })
  })
  it('histórico de 20 mensagens', () => {
    expect(PILOT_HISTORY).toBe(20)
  })
})
