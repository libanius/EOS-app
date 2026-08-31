/**
 * Push nativo, lado do aparelho (D-228 §3).
 *
 * ── Por que isto precisa existir ───────────────────────────────────────────
 *
 * Dentro da casca, o Web Push simplesmente NÃO existe. O WKWebView do iOS não
 * implementa `PushManager`, e o WebView do Android também não. Ou seja: o
 * caminho que `/mais` usa hoje não degrada dentro do app de loja — ele some.
 *
 * Sem este módulo, o app publicado nas lojas seria o único lugar onde o EOS
 * não avisa de perigo. Que é a função do produto.
 *
 * O token vai para `POST /api/push/device`; o envio sai de `lib/push-native.ts`,
 * por trás do mesmo `sendPush()` que a D-119 estabeleceu como porta única.
 */

import {
  isNativeShell,
  nativeGet,
  nativePlatform,
  nativePlugin,
  nativeRemove,
  nativeSet,
} from '@/lib/native/bridge'

/**
 * Onde o token fica guardado NO APARELHO.
 *
 * Não é cache do servidor — é a resposta para "este aparelho está ligado?".
 * A APNs e o FCM não têm como responder isso: `register()` sempre devolve um
 * token, esteja ele registrado no EOS ou não. Sem esta chave, a tela de ajustes
 * teria de adivinhar, e mostraria "desativado" a quem acabou de ativar.
 */
const CHAVE_TOKEN = 'eos.push.token'

type PermissionState = 'prompt' | 'prompt-with-rationale' | 'denied' | 'granted'

type PushPlugin = {
  checkPermissions(): Promise<{ receive: PermissionState }>
  requestPermissions(): Promise<{ receive: PermissionState }>
  register(): Promise<void>
  unregister?(): Promise<void>
  removeAllListeners?(): Promise<void>
  addListener(
    event: 'registration' | 'registrationError' | 'pushNotificationReceived' | 'pushNotificationActionPerformed',
    cb: (data: unknown) => void,
  ): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> }
}

export type NativePushResult =
  | { status: 'not_native' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'registered'; token: string; platform: 'ios' | 'android' }

/** Quanto esperamos o token chegar antes de desistir e dizer isso à pessoa. */
const ESPERA_MS = 15000

function extrairToken(data: unknown): string | null {
  const v = (data as { value?: unknown } | null)?.value
  return typeof v === 'string' && v.length > 0 ? v : null
}

function extrairErro(data: unknown): string {
  const e = (data as { error?: unknown } | null)?.error
  return typeof e === 'string' && e ? e : 'registration failed'
}

/**
 * Pede permissão, registra na APNs/FCM e grava o token no servidor.
 *
 * Toda saída é um estado nomeado, nunca uma exceção. Quem chama é uma tela de
 * ajustes, e "não deu" precisa virar frase para a pessoa ler — não um `catch`
 * genérico que vira "algo deu errado".
 */
export async function registrarPushNativo(scope?: unknown): Promise<NativePushResult> {
  if (!isNativeShell(scope)) return { status: 'not_native' }

  const plataforma = nativePlatform(scope)
  if (plataforma === 'web') return { status: 'not_native' }

  const push = nativePlugin<PushPlugin>('PushNotifications', scope)
  if (!push) return { status: 'unavailable' }

  try {
    let permissao = await push.checkPermissions()
    if (permissao.receive !== 'granted') {
      permissao = await push.requestPermissions()
    }
    if (permissao.receive !== 'granted') return { status: 'denied' }

    /*
     * O token chega por EVENTO, não pelo retorno de `register()`.
     *
     * `register()` resolve assim que o pedido sai para o sistema operacional; o
     * token vem depois, quando a APNs ou o FCM responde. Tratar o retorno de
     * `register()` como sucesso é o erro que faz a tela dizer "ativado" e o
     * aparelho nunca aparecer em `push_devices`.
     */
    const token = await new Promise<string | null>(resolve => {
      let pronto = false
      const encerra = (v: string | null) => {
        if (pronto) return
        pronto = true
        resolve(v)
      }
      const timer = setTimeout(() => encerra(null), ESPERA_MS)

      void Promise.resolve(push.addListener('registration', d => {
        clearTimeout(timer)
        encerra(extrairToken(d))
      }))
      void Promise.resolve(push.addListener('registrationError', d => {
        clearTimeout(timer)
        console.error('[EOS] registro de push nativo falhou:', extrairErro(d))
        encerra(null)
      }))

      void push.register().catch(() => {
        clearTimeout(timer)
        encerra(null)
      })
    })

    if (!token) return { status: 'error', message: 'timeout' }

    const res = await fetch('/api/push/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: plataforma }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return { status: 'error', message: (d as { error?: string }).error ?? `HTTP ${res.status}` }
    }

    await nativeSet(CHAVE_TOKEN, token, scope)
    return { status: 'registered', token, platform: plataforma }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'erro desconhecido' }
  }
}

/**
 * Desliga o push neste aparelho.
 *
 * Apaga a linha do servidor ANTES de cancelar no sistema. Na ordem inversa, uma
 * falha de rede deixaria o aparelho sem receber e o servidor achando que
 * recebe — e a D-119 existe justamente para que o servidor nunca minta sobre
 * isso.
 */
export async function desativarPushNativo(token: string, scope?: unknown): Promise<boolean> {
  try {
    const res = await fetch('/api/push/device', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) return false
  } catch {
    return false
  }
  await nativeRemove(CHAVE_TOKEN, scope)

  const push = nativePlugin<PushPlugin>('PushNotifications', scope)
  try {
    await push?.unregister?.()
  } catch {
    /* O aparelho já não está no servidor; falhar aqui não desfaz aquilo. */
  }
  return true
}

/**
 * Liga o toque na notificação à navegação.
 *
 * O payload leva `url` (o mesmo campo do Web Push, em `lib/push.ts`). Sem este
 * ouvinte, tocar num alerta de perigo abre o app na última tela aberta — e a
 * notificação que dizia "furacão a 40 km" não leva a lugar nenhum.
 *
 * Devolve uma função que remove o ouvinte.
 */
export function ouvirToqueEmNotificacao(
  navegar: (url: string) => void,
  scope?: unknown,
): () => void {
  const push = nativePlugin<PushPlugin>('PushNotifications', scope)
  if (!push) return () => {}

  let remover: (() => Promise<void>) | null = null
  void Promise.resolve(
    push.addListener('pushNotificationActionPerformed', d => {
      const dados = (d as { notification?: { data?: Record<string, unknown> } } | null)?.notification?.data
      const url = dados?.url
      if (typeof url === 'string' && url.startsWith('/')) navegar(url)
    }),
  ).then(h => {
    remover = h.remove
  })

  return () => {
    void remover?.()
  }
}

/**
 * O token que este aparelho registrou, ou `null`.
 *
 * É como a tela de ajustes sabe se deve mostrar "Ativado" sem perguntar ao
 * servidor — que também não saberia dizer *este* aparelho entre os vários da
 * mesma conta.
 */
export async function tokenNativoSalvo(scope?: unknown): Promise<string | null> {
  return nativeGet(CHAVE_TOKEN, scope)
}
