import { publicSignalSharePath, shareLanguage, signalSharePath, signalShareText } from '../signal-sharing'
import { SIGNALS } from '../signals-content'

describe('public Signal sharing', () => {
  it('opens only the public editorial leaf and its OG asset', () => {
    expect(publicSignalSharePath('/sinais/fortress/compartilhar')).toBe(true)
    expect(publicSignalSharePath('/sinais/fortress/compartilhar/capa')).toBe(true)
    for (const path of ['/sinais', '/sinais/fortress', '/sinais/fortress/compartilhar/private', '/api/signals/house-state', '/mais']) expect(publicSignalSharePath(path)).toBe(false)
  })
  it('shares exactly one EOS link without household quantities or news links', () => {
    for (const lang of ['pt', 'en'] as const) {
      const url = `https://eos.test${signalSharePath('fortress', lang)}`
      for (const full of [false, true]) {
        const text = signalShareText(SIGNALS[0], lang, url, full)
        expect(text.startsWith(url)).toBe(true)
        expect(text.match(/https:\/\//g)).toHaveLength(1)
        expect(text).not.toMatch(/34 L|27 meals|159 L|126 refeições/)
      }
    }
  })
  it('keeps the selected language and rejects unrecognized values', () => {
    expect(shareLanguage('pt')).toBe('pt')
    expect(shareLanguage('unexpected')).toBe('en')
    expect(signalSharePath('fortress', 'pt')).toBe('/sinais/fortress/compartilhar?lang=pt')
  })
})
