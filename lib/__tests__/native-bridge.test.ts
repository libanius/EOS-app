/**
 * A ponte com a casca nativa (D-228).
 *
 * O que estes testes protegem é uma regra só, e ela é fácil de quebrar sem
 * perceber: **no navegador nada disto pode lançar**. O caso normal do EOS é
 * rodar fora da casca, e uma exceção vinda daqui derrubaria uma tela por causa
 * de uma melhoria opcional.
 */

import {
  isNativeShell,
  nativeGet,
  nativePlatform,
  nativePlugin,
  nativeRemove,
  nativeSet,
} from '@/lib/native/bridge'

const semCasca = {}

function comCasca(plataforma: string, plugins: Record<string, unknown> = {}) {
  return { Capacitor: { getPlatform: () => plataforma, Plugins: plugins } }
}

describe('nativePlatform', () => {
  it('devolve "web" quando não há Capacitor', () => {
    expect(nativePlatform(semCasca)).toBe('web')
  })

  it('reconhece ios e android', () => {
    expect(nativePlatform(comCasca('ios'))).toBe('ios')
    expect(nativePlatform(comCasca('android'))).toBe('android')
  })

  it('trata qualquer outra plataforma como web', () => {
    // O Capacitor devolve `'web'` quando roda num navegador comum, e nada
    // impede uma versão futura de devolver outra coisa. Só ios/android têm
    // capacidade nativa; o resto é a mesma resposta.
    expect(nativePlatform(comCasca('web'))).toBe('web')
    expect(nativePlatform(comCasca('electron'))).toBe('web')
  })

  it('isNativeShell só é verdade dentro do app de loja', () => {
    expect(isNativeShell(semCasca)).toBe(false)
    expect(isNativeShell(comCasca('web'))).toBe(false)
    expect(isNativeShell(comCasca('ios'))).toBe(true)
  })
})

describe('nativePlugin', () => {
  it('devolve null em vez de lançar quando o plugin não existe', () => {
    // Plugin ausente é o caso NORMAL (navegador), não uma exceção. Se isto
    // lançasse, todo chamador precisaria de try/catch para descrever o dia a dia.
    expect(nativePlugin('Preferences', semCasca)).toBeNull()
    expect(nativePlugin('Preferences', comCasca('ios'))).toBeNull()
  })

  it('devolve o plugin quando ele existe', () => {
    const prefs = { get: jest.fn() }
    expect(nativePlugin('Preferences', comCasca('ios', { Preferences: prefs }))).toBe(prefs)
  })
})

describe('armazenamento nativo', () => {
  it('degrada em silêncio no navegador', async () => {
    await expect(nativeSet('k', 'v', semCasca)).resolves.toBe(false)
    await expect(nativeGet('k', semCasca)).resolves.toBeNull()
    await expect(nativeRemove('k', semCasca)).resolves.toBe(false)
  })

  it('escreve e lê quando há casca', async () => {
    const store = new Map<string, string>()
    const scope = comCasca('android', {
      Preferences: {
        set: async ({ key, value }: { key: string; value: string }) => {
          store.set(key, value)
        },
        get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
        remove: async ({ key }: { key: string }) => {
          store.delete(key)
        },
      },
    })

    await expect(nativeSet('eos', 'valor', scope)).resolves.toBe(true)
    await expect(nativeGet('eos', scope)).resolves.toBe('valor')
    await expect(nativeRemove('eos', scope)).resolves.toBe(true)
    await expect(nativeGet('eos', scope)).resolves.toBeNull()
  })

  it('engole a falha do plugin em vez de propagá-la', async () => {
    // Um `Preferences` que rejeita não pode derrubar a tela que o chamou: o
    // espelho offline é melhoria, e perder a melhoria não pode custar a página.
    const scope = comCasca('ios', {
      Preferences: {
        set: async () => {
          throw new Error('disco cheio')
        },
        get: async () => {
          throw new Error('corrompido')
        },
        remove: async () => {
          throw new Error('bloqueado')
        },
      },
    })
    await expect(nativeSet('k', 'v', scope)).resolves.toBe(false)
    await expect(nativeGet('k', scope)).resolves.toBeNull()
    await expect(nativeRemove('k', scope)).resolves.toBe(false)
  })

  it('trata valor ausente como null, não como undefined', async () => {
    const scope = comCasca('ios', { Preferences: { get: async () => ({ value: null }) } })
    await expect(nativeGet('nunca-escrito', scope)).resolves.toBeNull()
  })
})
