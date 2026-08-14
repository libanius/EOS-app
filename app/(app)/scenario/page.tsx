import { redirect } from 'next/navigation'

/**
 * `/scenario` virou `/mais/treino` (NAV-T08 / D-184).
 *
 * O endereço fica: convites de treino chegam por `/sim/[token]`, links antigos
 * existem no dashboard legado, e o histórico de quem já usou aponta para cá.
 */
export default function Page() {
  redirect('/mais/treino')
}
