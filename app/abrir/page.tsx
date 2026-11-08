import type { Metadata } from 'next'
import AbrirRedirect from './AbrirRedirect'

/**
 * D-238 — porta de entrada do app instalado (`start_url` do manifest).
 *
 * Página ESTÁTICA: sai da CDN (e do service worker) em milissegundos, sem
 * passar pelo Supabase. Isso é o que tira a tela branca do iPhone — antes, o
 * ícone abria "/", que consultava a sessão no servidor e redirecionava para
 * /dashboard, e o aparelho ficava em branco esperando esse vai-e-volta.
 *
 * Aqui a abertura (BootSplash, no layout raiz) começa a girar na hora, e
 * enquanto isso o cliente vai para a tela certa por navegação de cliente —
 * o layout raiz continua montado, então a abertura cobre a espera inteira.
 */
export const metadata: Metadata = {
  title: 'EOS',
  robots: { index: false, follow: false },
}

export default function AbrirPage() {
  return <AbrirRedirect />
}
