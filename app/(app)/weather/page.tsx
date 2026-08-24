import { redirect } from 'next/navigation'

/**
 * `/weather` virou `/dashboard/alertas` (NAV-T07 / D-182).
 *
 * Alerta é o que está acontecendo ao redor — assunto do MUNDO, não domínio
 * próprio. Enquanto foram duas telas, as duas mostravam o mesmo evento com
 * linguagens visuais diferentes, e nenhuma podia ser corrigida sem a outra
 * divergir.
 *
 * O endereço fica: está em histórico de navegador, em links internos e é o
 * caminho de quem quer saber se pode sair de casa.
 */
export default function Page() {
  redirect('/dashboard/alertas')
}
