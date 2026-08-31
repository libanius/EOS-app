import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Casca nativa do EOS — iOS e Android (D-228).
 *
 * A casca NÃO tem tela própria. Ela carrega o Next.js que já está em produção e
 * acrescenta só a borda que o navegador não alcança. Toda tela nova continua
 * nascendo no app web; se algo aqui precisar mudar para uma tela existir, a
 * arquitetura está errada, não o arquivo.
 */

/**
 * A origem que o app carrega.
 *
 * Sobrescrever com `EOS_NATIVE_ORIGIN` é o modo de apontar a casca para um
 * preview da Vercel ou para o `next dev` da máquina. Em build de loja isto tem
 * de ser a origem de produção — `npm run check` falha o build se apontar para
 * `localhost` ou para um IP de rede local.
 */
const ORIGIN = process.env.EOS_NATIVE_ORIGIN ?? 'https://eos-app-fawn.vercel.app'

const config: CapacitorConfig = {
  appId: 'app.eos.family',
  appName: 'EOS',

  /**
   * `www/` é o binário, não o app.
   *
   * Contém uma página só: o fallback que aparece quando a origem remota não
   * responde. Não é uma cópia do EOS — é o que o EOS mostra quando a torre caiu.
   */
  webDir: 'www',

  server: {
    url: ORIGIN,

    /**
     * O motivo de a casca existir para o produto, e não só para a loja.
     *
     * Sem `errorPath`, um WebView sem rede mostra a página de erro do sistema
     * ("não foi possível conectar"). Para um app de emergência isso é falha de
     * produto: a hora em que a pessoa mais precisa do plano é exatamente a hora
     * em que a rede caiu. Com `errorPath`, o app cai numa tela nossa, que lê o
     * cofre nativo e mostra ficha e plano sem tocar na rede (D-228 §5).
     */
    errorPath: 'offline.html',

    androidScheme: 'https',
    iosScheme: 'https',

    /** HTTP em claro nunca. A sessão do Supabase viaja aqui. */
    cleartext: false,
  },

  ios: {
    contentInset: 'always',
    /** O mapa (MapLibre/WebGL) engasga em WKWebView sem isto em listas longas. */
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    /**
     * `allowMixedContent: false` — o app não carrega sub-recurso em HTTP dentro
     * de uma página HTTPS. Tiles de mapa e provedores de perigo já são todos
     * HTTPS; se algum deixar de ser, é para quebrar barulhento, não silencioso.
     */
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    PushNotifications: {
      /**
       * `alert` e `sound` com o app aberto.
       *
       * O padrão da Apple é engolir a notificação quando o app está em primeiro
       * plano. Aqui não serve: um alerta de perigo que chega enquanto a pessoa
       * está lendo o plano é justamente o que ela precisa ver.
       */
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0f',
    },
  },
}

export default config
