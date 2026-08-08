/**
 * A mesma pessoa, escrita de dois jeitos (D-135).
 *
 * O app tem três portas para dizer quem mora na casa, e elas não se conhecem:
 * o endereço da ficha grava um convite, o cadastro grava um dependente, e o
 * círculo grava uma conta. Quando a mesma pessoa passa por duas delas, a casa
 * fica com duas linhas para uma cabeça.
 *
 * Isso está acontecendo em produção agora. Uma conta chamada "Isadora da Rosa
 * Libanio" tem um dependente chamado "Isadora": a casa conta 3 onde há 2, e a
 * autonomia dela é dividida por três pessoas em vez de duas — ela lê que está
 * 33% menos preparada do que está.
 *
 * A ASSIMETRIA DE RISCO DECIDE O DESENHO. Juntar duas pessoas por engano tira
 * uma boca da conta e faz a autonomia SUBIR: a família lê que aguenta mais do
 * que aguenta, e se prepara menos. Deixar duas linhas para a mesma pessoa faz a
 * autonomia CAIR: ela se prepara demais. Um erro machuca, o outro não.
 *
 * Por isso existem dois níveis aqui, e nenhum deles funde nada sozinho:
 *
 *   `provavel`  — basta para PERGUNTAR na tela ("é a mesma pessoa?").
 *   `forte`     — basta para fechar um CONVITE, que é reversível e não mexe em
 *                 quantas pessoas a casa tem.
 *
 * Fundir dependente com conta é sempre um toque do usuário, nunca do app.
 */

/** Sem acento, sem caixa, sem espaço sobrando. */
export function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Partes do nome que valem para comparar.
 *
 * Preposições saem: "Isadora da Rosa" e "Isadora Rosa" são a mesma pessoa
 * escrevendo com e sem o "da", e mantê-las faria duas grafias comuns do mesmo
 * nome parecerem pessoas diferentes.
 */
const LIGACOES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'del', 'la', 'van', 'von'])

export function partes(nome: string): string[] {
  return normalizar(nome)
    .split(' ')
    .filter(p => p && !LIGACOES.has(p))
}

export type Semelhanca = 'nenhuma' | 'provavel' | 'forte'

/**
 * Quão parecidos são dois nomes de pessoa.
 *
 * `forte` exige que TODAS as partes do nome mais curto apareçam no mais longo,
 * e que sejam pelo menos duas. Duas partes é o que separa "Daniela Oliveira" de
 * "Daniela" — o primeiro nome sozinho é comum demais para fechar nada, mesmo
 * dentro de uma casa.
 *
 * `provavel` é o primeiro nome igual. Chega para perguntar, não para agir.
 */
export function semelhanca(a: string, b: string): Semelhanca {
  const pa = partes(a)
  const pb = partes(b)
  if (!pa.length || !pb.length) return 'nenhuma'

  if (pa.join(' ') === pb.join(' ')) return 'forte'

  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa]
  const contido = curto.every(p => longo.includes(p))

  if (contido && curto.length >= 2) return 'forte'

  /*
   * Perguntar é barato; concluir não é.
   *
   * Vale perguntar quando um nome cabe inteiro dentro do outro ("Ana" dentro de
   * "Avó Ana"), ou quando o primeiro nome bate. As duas coisas juntas cobrem as
   * grafias que uma família usa de verdade — o apelido, o nome sem sobrenome, o
   * nome completo — sem alcançar o caso que arruinaria tudo: dois irmãos, que
   * dividem o sobrenome e não o primeiro nome.
   */
  if (contido) return 'provavel'
  if (pa[0] === pb[0]) return 'provavel'
  return 'nenhuma'
}

/** Vale perguntar na tela? */
export const podePerguntar = (a: string, b: string) => semelhanca(a, b) !== 'nenhuma'

/** Vale fechar um convite sozinho? */
export const podeFecharConvite = (a: string, b: string) => semelhanca(a, b) === 'forte'
