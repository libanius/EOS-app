import { redirect } from 'next/navigation'

/**
 * `/settings` virou `/mais` (NAV-T06 / D-180).
 *
 * Era o último item atrás do ☰ — um ícone sem rótulo no canto superior direito,
 * disputando espaço com o orbe do Pilot e com os controles do mapa. Com a barra
 * global encolhendo para cinco (`docs/35` §RECOMMENDED), sobrou slot para ele
 * virar destino com NOME escrito, e o menu deixou de existir.
 *
 * O endereço antigo continua valendo: ele está em links internos, em histórico
 * de navegador e — o que importa mais — é para onde o app manda quem precisa
 * assinar. Redirecionar custa nada; um 404 no caminho do pagamento custa caro.
 */
export default function Page() {
  redirect('/mais')
}
