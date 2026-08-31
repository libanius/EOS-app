/**
 * A ponte com a casca nativa (D-228).
 *
 * ── Por que aqui não há `import '@capacitor/core'` ─────────────────────────
 *
 * Este arquivo fala com o Capacitor pelo objeto global `window.Capacitor`, e
 * nunca por import. Não é preguiça — é o que mantém as duas coisas separadas:
 *
 *  · o app roda no navegador na esmagadora maioria das vezes, e um import
 *    poria o runtime do Capacitor no bundle de todo mundo, para nada;
 *  · importar obrigaria `@capacitor/core` a entrar no `package.json` da raiz, e
 *    daí no build da Vercel — exatamente o que a D-228 §2 separou ao pôr a
 *    casca em `native/` com workspace próprio.
 *
 * O preço é tipar à mão o que o global expõe. É um preço pequeno, e a fronteira
 * fica visível: tudo que o app web sabe sobre o mundo nativo passa por aqui.
 */

export type NativePlatform = 'ios' | 'android' | 'web'

/** O recorte de `window.Capacitor` que o EOS usa. Não é a API inteira. */
type CapacitorGlobal = {
  getPlatform?: () => string
  isNativePlatform?: () => boolean
  Plugins?: Record<string, unknown>
}

type Escopo = { Capacitor?: CapacitorGlobal }

function escopo(dado?: unknown): Escopo {
  if (dado) return dado as Escopo
  if (typeof globalThis === 'undefined') return {}
  return globalThis as unknown as Escopo
}

/**
 * A plataforma em que este código está rodando AGORA.
 *
 * `'web'` cobre os dois casos em que não há casca: o navegador comum e o
 * servidor. Quem chama não precisa distinguir — em ambos não há nada nativo
 * para chamar, que é a única pergunta que importa.
 */
export function nativePlatform(scope?: unknown): NativePlatform {
  const cap = escopo(scope).Capacitor
  const p = cap?.getPlatform?.()
  return p === 'ios' || p === 'android' ? p : 'web'
}

/** Estamos dentro do app de loja? */
export function isNativeShell(scope?: unknown): boolean {
  return nativePlatform(scope) !== 'web'
}

/**
 * Um plugin, ou `null`.
 *
 * Devolver `null` em vez de lançar é deliberado: um plugin ausente é o caso
 * NORMAL (o navegador), não uma exceção. Se isto lançasse, todo chamador
 * precisaria de `try` para descrever o dia a dia.
 */
export function nativePlugin<T>(nome: string, scope?: unknown): T | null {
  const cap = escopo(scope).Capacitor
  if (!cap) return null
  const plugin = cap.Plugins?.[nome]
  return plugin ? (plugin as T) : null
}

// ─── Preferences ────────────────────────────────────────────────────────────
//
// O armazenamento NATIVO, que é do aplicativo e não da origem. É a única
// memória que o app remoto (`https://…`) e a tela de fallback embutida no
// binário (origem local) conseguem compartilhar — `localStorage` e IndexedDB de
// um são invisíveis para o outro. Ver D-228 §5.

type PreferencesPlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

export function preferences(scope?: unknown): PreferencesPlugin | null {
  return nativePlugin<PreferencesPlugin>('Preferences', scope)
}

/**
 * Guarda um valor no armazenamento nativo.
 *
 * Devolve `false` quando não há casca ou quando a escrita falhou, e NUNCA
 * lança. Espelhar dado para o cofre offline é melhoria; se falhar, o app online
 * continua inteiro, e derrubar uma tela por causa disso seria trocar uma perda
 * pequena por uma grande.
 */
export async function nativeSet(key: string, value: string, scope?: unknown): Promise<boolean> {
  const prefs = preferences(scope)
  if (!prefs) return false
  try {
    await prefs.set({ key, value })
    return true
  } catch {
    return false
  }
}

/** Lê do armazenamento nativo. `null` quando não há casca, valor ou leitura. */
export async function nativeGet(key: string, scope?: unknown): Promise<string | null> {
  const prefs = preferences(scope)
  if (!prefs) return null
  try {
    const r = await prefs.get({ key })
    return r?.value ?? null
  } catch {
    return null
  }
}

/** Apaga do armazenamento nativo. Usado na saída da conta e na exclusão. */
export async function nativeRemove(key: string, scope?: unknown): Promise<boolean> {
  const prefs = preferences(scope)
  if (!prefs) return false
  try {
    await prefs.remove({ key })
    return true
  } catch {
    return false
  }
}
