import { redirect } from 'next/navigation'

/**
 * `/family-legacy` foi para onde a aba Família mandava o usuário em
 * "Cadastrar" e "Editar cadastro" — a ação primária da tela levava a um
 * aplicativo visualmente diferente, sem caminho de volta (D-122).
 *
 * A tela foi reconstruída em `/family/cadastro`. Este redirecionamento fica
 * porque a rota antiga pode estar salva em algum lugar, e um 404 seria uma
 * segunda falha em cima da primeira. "legacy" nunca foi um endereço para se
 * mandar alguém.
 */
export default function Page() {
  redirect('/family/cadastro')
}
