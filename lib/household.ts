/**
 * Quem é a casa, e quanto ela tem (D-123).
 *
 * ESTA É A ÚNICA RESPOSTA. Antes, cada cálculo montava a sua: `analyze`,
 * `readiness`, `checklist/generate`, `pilot/chat` e duas telas liam
 * `family_members` direto — uma lista digitada à mão — e nenhum deles olhava o
 * círculo. Cinco contas reais no círculo e a conta de água dizia uma pessoa.
 *
 * O MODELO:
 *
 *   Casa = as contas que confirmaram morar juntas
 *        + os dependentes dessas contas
 *
 *   Alcançável = quem está no círculo mas NÃO mora na casa
 *
 * A distinção não é burocrática: a água do vizinho não está na sua casa. Somar
 * as duas produz um número de autonomia que parece bom e não existe — e um
 * número de autonomia errado para cima é pior que nenhum, porque leva a família
 * a não se preparar.
 *
 * POR QUE USA O CLIENTE ADMIN. Somar o inventário da casa exige ler o
 * inventário de outra pessoa, e a RLS — corretamente — impede isso. O
 * consentimento que autoriza a leitura é o `household_status = 'confirmed'`, que
 * a própria pessoa deu. Por isso o conjunto é derivado **primeiro** do vínculo
 * confirmado, e só então os inventários desse conjunto são lidos. Nunca se lê
 * inventário de quem não confirmou.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { podePerguntar, podeFecharConvite } from '@/lib/same-person'
import { logError } from '@/lib/error-log'
import { WATER_LITERS_PER_PERSON_DAY } from '@/lib/units'

export type HouseholdPerson = {
  /** Conta EOS. `null` para dependente. */
  userId: string | null
  name: string
  isMe: boolean
  age: number | null
  medicalConditions: string[]
  medications: string[]
  mobilityImpaired: boolean
  isInfant: boolean
  /** Dependente: quem cuida dele, e o que essa pessoa é para o cuidador. */
  dependsOn: string | null
  relationship: string | null
  careNotes: string | null
  /**
   * A ficha desta pessoa pode ser lida?
   *
   * Morar junto NÃO dá acesso à ficha médica de ninguém — são consentimentos
   * diferentes. Quando isto é falso, as listas acima vêm vazias **porque não
   * temos permissão**, não porque a pessoa não tem necessidade nenhuma.
   *
   * A diferença decide vidas: "ninguém na casa toma remédio contínuo" e "não
   * sabemos o que três pessoas da casa tomam" levam a checklists opostos, e um
   * deles manda a família viajar sem insulina.
   */
  medicalVisible: boolean
  /**
   * Cadastrada como dependente, mas já tem conta e ainda não confirmou morar
   * junto. Conta como PESSOA e não traz despensa — as duas coisas na direção
   * conservadora. Ver o comentário no lugar onde isto é decidido.
   */
  awaitingConfirmation: boolean
}

export type HouseholdInventory = {
  waterLiters: number
  /**
   * PESSOA-DIA, não dias.
   *
   * A unidade está no nome porque foi exatamente aqui que eu errei, e o teste
   * unitário pegou: `food_days` na tela significa "dias que a MINHA casa
   * aguenta". Somar o campo de duas contas daria oito dias onde há quatro —
   * a autonomia dobraria sem a comida dobrar.
   *
   * Convertendo para pessoa-dia (dias × pessoas cobertas por aquela conta), a
   * soma passa a ser legítima e a divisão pelo tamanho da casa devolve dias.
   * Para uma casa de uma conta o resultado é idêntico ao de antes.
   */
  foodPersonDays: number
  fuelLiters: number
  batteryPercent: number
  hasMedicalKit: boolean
  hasCommunicationDevice: boolean
  /** De quantas contas este total veio. 1 = só a sua. */
  contributors: number
}

export type ReachablePerson = {
  userId: string
  name: string
  circleName: string
  lat: number | null
  lng: number | null
  /** Só quando a pessoa marcou compartilhar; caso contrário `null`. */
  sharedInventory: { waterLiters: number; foodDays: number } | null
}

export type Household = {
  people: HouseholdPerson[]
  /** Contas + dependentes. É este o número que divide água e comida. */
  size: number
  inventory: HouseholdInventory
  reachable: ReachablePerson[]
  /** Quantas pessoas da casa têm necessidades que não podemos ler. */
  needsHidden: number
  /**
   * Gente que a pessoa declarou morar na casa e que ainda não está no EOS
   * (D-130).
   *
   * São nomes guardados no momento em que ela preencheu o endereço, esperando
   * um círculo para virarem convite. O Pilot precisa saber: uma casa de quatro
   * onde só um tem conta responde diferente de uma casa de um.
   */
  pendingNames: string[]
  /**
   * A mesma pessoa aparecendo duas vezes (D-135).
   *
   * O app tem três portas para dizer quem mora aqui — o endereço, o cadastro de
   * dependente e o círculo — e elas não se conhecem. Quando alguém entra por
   * duas, a casa fica com duas linhas para uma cabeça, e a autonomia é dividida
   * por gente demais.
   *
   * A casa NÃO junta sozinha. Juntar por engano tira uma boca da conta e faz a
   * autonomia subir — a família leria que aguenta mais do que aguenta. Aqui só
   * se aponta; fundir é um toque do usuário, na tela, olhando os dois nomes.
   */
  duplicates: Array<{
    /** A linha de `family_members` que talvez seja a mesma pessoa. */
    memberId: string
    name: string
    /** A conta com que ela se parece. */
    sameAs: string
    sameAsName: string
  }>
  /**
   * Falso quando a leitura falhou.
   *
   * Regra herdada de `simulation-debrief`: **nunca presumir uma casa de um**.
   * Uma falha de rede que vira "1 pessoa" produz uma autonomia inventada, e
   * quem lê não tem como saber que aquilo é um erro e não um fato.
   */
  known: boolean
}

const VAZIO: HouseholdInventory = {
  waterLiters: 0,
  foodPersonDays: 0,
  fuelLiters: 0,
  batteryPercent: 0,
  hasMedicalKit: false,
  hasCommunicationDevice: false,
  contributors: 0,
}

/*
 * As referências de consumo, num lugar só (D-129).
 *
 * O dono abriu três telas e viu três respostas para a mesma pergunta: o
 * dashboard dizia 0,3 dias de autonomia, Preparação dizia 2, e Círculos dizia
 * que a casa tinha 3 pessoas enquanto o motor contava 1.
 *
 * A causa da divergência de autonomia era esta: `useWorldData` calculava
 * `min(água, comida, energia, combustível)` e este arquivo calculava
 * `min(água, comida)`. As duas fórmulas eram defensáveis; o problema é que
 * existiam as duas.
 */
/**
 * D-159 / PREP-T11: a régua da água passou a ser a da FEMA — 1 galão por
 * pessoa por dia (3,785 L), no lugar dos 3 L que o EOS usava. A constante mora
 * em `lib/units.ts` e é importada; este arquivo deixou de ter uma cópia própria.
 *
 * O nome antigo (`WATER_PER_PERSON_DAY`) não dizia a unidade. O novo diz.
 */
export { WATER_LITERS_PER_PERSON_DAY }
export const BATTERY_FULL_DAYS = 3
export const LITRES_PER_FUEL_DAY = 10

/**
 * Dias que a casa aguenta — SOBREVIVÊNCIA, não conforto.
 *
 * O menor entre água e comida. Autonomia é definida pelo recurso que acaba
 * primeiro, não pela média: trinta dias de comida com um dia de água é um dia.
 *
 * ENERGIA E COMBUSTÍVEL FICAM DE FORA, e a decisão custou uma ida e volta.
 * Primeiro eu unifiquei incluindo os quatro, porque o dashboard fazia assim e
 * porque somar restrições parecia o lado conservador. O teste mostrou o
 * absurdo: com `BATTERY_FULL_DAYS = 3`, NENHUMA casa poderia ter mais de três
 * dias de autonomia, e uma bateria em 10% passaria a afirmar que a família
 * sobrevive 0,3 dias.
 *
 * Não sobrevive — ela fica sem luz. Bateria e combustível são CAPACIDADE:
 * mudam o que dá para fazer, não quanto tempo se fica vivo. Continuam
 * aparecendo como barras próprias, que é onde a informação é verdadeira.
 *
 * Ser conservador é bom; inventar uma restrição de sobrevivência que não
 * existe é outra coisa. Um número alarmante e falso gasta a confiança que o
 * número alarmante e verdadeiro vai precisar.
 */
export function autonomyDays(inv: HouseholdInventory, size: number): number {
  if (size <= 0) return 0
  const water = inv.waterLiters / (WATER_LITERS_PER_PERSON_DAY * size)
  const food = inv.foodPersonDays / size
  return Math.max(0, Math.min(water, food))
}

type MemberRow = {
  circle_id: string
  user_id: string
  household_status: string | null
  share_inventory: boolean | null
  /** Consentimento SEPARADO do de morar junto: ver a ficha médica. */
  family_access_status: string | null
}

/**
 * Monta a casa de quem está perguntando.
 *
 * `client` é usado só para saber quem é o usuário quando a chamada vem de uma
 * rota autenticada; toda a leitura cruzada usa o admin, pelo motivo explicado no
 * topo do arquivo.
 */
export async function getHousehold(userId: string): Promise<Household> {
  const admin = createAdminClient()
  if (!admin) return { people: [], size: 0, inventory: VAZIO, reachable: [], needsHidden: 0, pendingNames: [], duplicates: [], known: false }

  try {
    // 1. Em quais círculos eu estou, e qual é a minha situação de casa.
    const { data: minhas, error: e1 } = await admin
      .from('circle_members')
      .select('circle_id, user_id, household_status, share_inventory, family_access_status')
      .eq('user_id', userId)
    if (e1) throw e1

    const meusCirculos = (minhas ?? []) as MemberRow[]
    // A casa é um subconjunto de UM círculo — a pessoa mora em um lugar só, e o
    // banco tem um índice único garantindo isso.
    const circuloDaCasa = meusCirculos.find(m => m.household_status === 'confirmed')?.circle_id ?? null

    // 2. Todos os membros dos meus círculos, para separar casa de alcançável.
    const ids = meusCirculos.map(m => m.circle_id)
    const { data: todos, error: e2 } = ids.length
      ? await admin
          .from('circle_members')
          .select('circle_id, user_id, household_status, share_inventory, family_access_status')
          .in('circle_id', ids)
      : { data: [], error: null }
    if (e2) throw e2

    const membros = (todos ?? []) as MemberRow[]

    /*
     * Quem mora comigo. Sempre inclui a mim: mesmo sem círculo nenhum, uma casa
     * de uma pessoa é uma casa — o que não pode acontecer é o contrário, uma
     * casa de cinco ser lida como de uma.
     */
    const contasDaCasa = new Set<string>([userId])
    if (circuloDaCasa) {
      for (const m of membros) {
        if (m.circle_id === circuloDaCasa && m.household_status === 'confirmed') {
          contasDaCasa.add(m.user_id)
        }
      }
    }

    const idsCasa = Array.from(contasDaCasa)

    // 3. Perfis, inventários e dependentes — só de quem está na casa.
    const [perfisRes, invRes, depsRes, circulosRes] = await Promise.all([
      admin
        .from('profiles')
        .select('id, name, location_lat, location_lng, medical_notes, medications, allergies')
        .in('id', idsCasa),
      admin
        .from('resource_inventory')
        .select('profile_id, water_liters, food_days, fuel_liters, battery_percent, has_medical_kit, has_communication_device')
        .in('profile_id', idsCasa),
      admin
        .from('family_members')
        .select('id, profile_id, name, age, medical_conditions, medications, mobility_impaired, is_infant, linked_user_id, relationship, care_notes')
        .in('profile_id', idsCasa),
      ids.length ? admin.from('circles').select('id, name').in('id', ids) : Promise.resolve({ data: [], error: null }),
    ])

    const perfis = new Map(
      ((perfisRes.data ?? []) as Array<{ id: string; name: string | null }>).map(p => [p.id, p.name ?? 'Sem nome']),
    )

    /*
     * De quem eu posso ler a ficha.
     *
     * A minha, sempre. A de outra conta da casa, só se ELA aprovou compartilhar
     * — `family_access_status`, que é um consentimento diferente do de morar
     * junto. O EOS conta a pessoa na casa de qualquer jeito; o que ele não faz é
     * ler a ficha dela sem permissão, nem fingir que ela não tem necessidade.
     */
    const fichaLiberada = new Set<string>([userId])
    for (const m of membros) {
      if (contasDaCasa.has(m.user_id) && m.family_access_status === 'approved') fichaLiberada.add(m.user_id)
    }

    const meuPerfil = (perfisRes.data ?? []) as Array<{
      id: string
      medical_notes?: string | null
      medications?: string[] | null
      allergies?: string[] | null
    }>
    const fichaPorId = new Map(meuPerfil.map(p => [p.id, p]))

    const pessoas: HouseholdPerson[] = idsCasa.map(id => {
      const podeLer = fichaLiberada.has(id)
      const f = podeLer ? fichaPorId.get(id) : null
      return {
        userId: id,
        name: id === userId ? 'Você' : perfis.get(id) ?? 'Sem nome',
        isMe: id === userId,
        // Idade não existe em `profiles` — uma conta informa a própria ficha, não
        // a própria idade. Fica nulo em vez de virar um palpite.
        age: null,
        medicalConditions: f?.medical_notes ? [f.medical_notes] : [],
        medications: f?.medications ?? [],
        mobilityImpaired: false,
        isInfant: false,
        dependsOn: null,
        relationship: null,
        careNotes: null,
        medicalVisible: podeLer,
        awaitingConfirmation: false,
      }
    })

    /*
     * Dependentes — e o caso delicado da migração.
     *
     * Se `linked_user_id` aponta para alguém que JÁ está na casa, a linha é
     * duplicata da mesma pessoa e some daqui (a limpeza acontece na tela, com o
     * usuário olhando).
     *
     * Mas se aponta para uma conta que ainda NÃO confirmou morar junto, sumir
     * seria pior: a pessoa deixaria de ser contada e **a autonomia subiria** só
     * porque alguém vinculou um cadastro a uma conta. Autonomia que sobe sozinha
     * é exatamente o erro que faz uma família não se preparar.
     *
     * Então ela continua contando como pessoa, sem trazer despensa nenhuma:
     * mais bocas e a mesma água, que são as duas direções seguras enquanto a
     * confirmação não vem.
     */
    for (const d of (depsRes.data ?? []) as Array<Record<string, unknown>>) {
      const vinculada = d.linked_user_id as string | null
      if (vinculada && contasDaCasa.has(vinculada)) continue
      pessoas.push({
        userId: null,
        name: (d.name as string) ?? 'Sem nome',
        isMe: false,
        age: (d.age as number | null) ?? null,
        medicalConditions: (d.medical_conditions as string[]) ?? [],
        medications: (d.medications as string[]) ?? [],
        mobilityImpaired: Boolean(d.mobility_impaired),
        isInfant: Boolean(d.is_infant),
        dependsOn: (d.profile_id as string) ?? null,
        relationship: (d.relationship as string | null) ?? null,
        careNotes: (d.care_notes as string | null) ?? null,
        // O dependente é cadastrado pelo cuidador, que é quem responde por ele.
        medicalVisible: true,
        awaitingConfirmation: Boolean(vinculada),
      })
    }

    /*
     * 4. O inventário da casa é a SOMA — é isto que "morar junto" compra.
     *
     * Água é absoluta: litros somam. Comida NÃO: o campo da tela é "dias que a
     * minha casa aguenta", então antes de somar ele vira pessoa-dia,
     * multiplicado por quanta gente aquela conta cobre (ela mesma + seus
     * dependentes). Sem isso, duas pessoas com quatro dias cada leriam oito.
     */
    const cobertura = new Map<string, number>(idsCasa.map(id => [id, 1]))
    for (const p of pessoas) {
      if (p.userId === null && p.dependsOn) {
        cobertura.set(p.dependsOn, (cobertura.get(p.dependsOn) ?? 1) + 1)
      }
    }

    const inventarios = (invRes.data ?? []) as Array<Record<string, unknown>>
    const inventory: HouseholdInventory = inventarios.reduce<HouseholdInventory>(
      (acc, i) => ({
        waterLiters: acc.waterLiters + (Number(i.water_liters) || 0),
        foodPersonDays:
          acc.foodPersonDays + (Number(i.food_days) || 0) * (cobertura.get(String(i.profile_id)) ?? 1),
        fuelLiters: acc.fuelLiters + (Number(i.fuel_liters) || 0),
        batteryPercent: Math.max(acc.batteryPercent, Number(i.battery_percent) || 0),
        hasMedicalKit: acc.hasMedicalKit || Boolean(i.has_medical_kit),
        hasCommunicationDevice: acc.hasCommunicationDevice || Boolean(i.has_communication_device),
        contributors: acc.contributors + 1,
      }),
      { ...VAZIO },
    )

    // 5. Alcançável: no círculo, fora da casa. Aparece com distância, nunca
    //    somado — a água que está a dois quilômetros não está na sua casa.
    const nomeCirculo = new Map(
      ((circulosRes.data ?? []) as Array<{ id: string; name: string }>).map(c => [c.id, c.name]),
    )
    const foraDaCasa = membros.filter(m => !contasDaCasa.has(m.user_id))
    const idsFora = Array.from(new Set(foraDaCasa.map(m => m.user_id)))

    let reachable: ReachablePerson[] = []
    if (idsFora.length) {
      const [pf, inv2] = await Promise.all([
        admin.from('profiles').select('id, name, location_lat, location_lng').in('id', idsFora),
        admin.from('resource_inventory').select('profile_id, water_liters, food_days').in('profile_id', idsFora),
      ])
      const porId = new Map(
        ((pf.data ?? []) as Array<{ id: string; name: string | null; location_lat: number | null; location_lng: number | null }>)
          .map(p => [p.id, p]),
      )
      const invPorId = new Map(
        ((inv2.data ?? []) as Array<{ profile_id: string; water_liters: number; food_days: number }>)
          .map(i => [i.profile_id, i]),
      )
      const vistos = new Set<string>()
      for (const m of foraDaCasa) {
        if (vistos.has(m.user_id)) continue
        vistos.add(m.user_id)
        const p = porId.get(m.user_id)
        const i = m.share_inventory ? invPorId.get(m.user_id) : null
        reachable.push({
          userId: m.user_id,
          name: p?.name ?? 'Sem nome',
          circleName: nomeCirculo.get(m.circle_id) ?? 'Círculo',
          lat: p?.location_lat ?? null,
          lng: p?.location_lng ?? null,
          sharedInventory: i ? { waterLiters: Number(i.water_liters) || 0, foodDays: Number(i.food_days) || 0 } : null,
        })
      }
      reachable = reachable.sort((a, b) => a.name.localeCompare(b.name))
    }

    const needsHidden = pessoas.filter(p => !p.medicalVisible).length

    /*
     * Quem a pessoa disse que mora aqui e ainda não entrou (D-130).
     *
     * Falha silenciosa de propósito: a migration pode não estar aplicada, e a
     * casa continua sendo uma casa sem esta lista. Ela enriquece a resposta do
     * Pilot; não é pré-requisito dela.
     */
    let pendingNames: string[] = []
    try {
      const { data: pendentes } = await admin
        .from('household_invites')
        .select('id, name, status')
        .eq('owner_id', userId)
        .in('status', ['pending', 'sent'])
        .limit(20)

      const abertos = (pendentes ?? []) as Array<{ id: string; name: string; status: string }>

      /*
       * O convite de quem JÁ ENTROU se fecha sozinho (D-135).
       *
       * Em produção agora, a conta do dono tem dois convites — "Daniela Oliveira
       * Letteriello" e "Paola Letteriello Libanio" — marcados como enviados,
       * enquanto as duas já estão confirmadas morando com ele. O app afirmava,
       * para ele e para o Pilot, que elas "não estão no EOS". Estavam.
       *
       * Fechar é seguro de um jeito que fundir não é: não muda quantas pessoas
       * a casa tem, não mexe em ficha nenhuma, e é reversível — só para de
       * repetir uma coisa falsa. Por isso exige `forte` (duas partes do nome
       * batendo) e só olha para quem está confirmado NESTA casa.
       */
      const nomesDaCasa = pessoas
        .filter(p => p.userId !== null)
        .map(p => (p.isMe ? (perfis.get(userId) ?? '') : p.name))
        .filter(Boolean)

      const jaEntraram = abertos.filter(c => nomesDaCasa.some(n => podeFecharConvite(c.name, n)))

      /*
       * Se a gravação falhar, o convite CONTINUA aberto na resposta.
       *
       * A primeira versão escondia isto e foi o teste que pegou: o CHECK da
       * tabela ainda não conhecia `joined` (migration não aplicada), o UPDATE
       * voltava 23514, e o código seguia filtrando o nome da lista assim mesmo.
       * A tela ficava certa, o banco ficava errado, e a próxima leitura tentava
       * de novo — para sempre.
       *
       * Duas verdades diferentes sobre a mesma coisa é o defeito que este
       * conserto inteiro existe para eliminar. Não vou reintroduzi-lo aqui.
       */
      let fechados: typeof jaEntraram = []
      if (jaEntraram.length) {
        const { error: erroFechar } = await admin
          .from('household_invites')
          .update({ status: 'joined' })
          .in('id', jaEntraram.map(c => c.id))
        if (erroFechar) {
          await logError('household:fechar-convite', erroFechar, {
            userId,
            context: { quantos: jaEntraram.length, code: erroFechar.code },
          })
        } else {
          fechados = jaEntraram
        }
      }

      pendingNames = abertos.filter(c => !fechados.includes(c)).map(c => c.name)
    } catch {
      /* sem a migration, a casa segue existindo */
    }

    /*
     * A mesma pessoa em duas linhas (D-135).
     *
     * Um dependente cujo nome se parece com o de uma conta da casa é, quase
     * sempre, a mesma pessoa cadastrada duas vezes — pelo endereço e pelo
     * cadastro. Acontece agora em produção: a conta "Isadora da Rosa Libanio"
     * tem um dependente "Isadora", e a autonomia dela é dividida por três onde
     * deviam ser duas.
     *
     * Só aponta. Fundir é um toque do usuário — ver a justificativa no tipo.
     */
    const duplicates: Household['duplicates'] = []
    for (const d of (depsRes.data ?? []) as Array<Record<string, unknown>>) {
      if (d.linked_user_id) continue
      const nomeDep = String(d.name ?? '')
      for (const id of idsCasa) {
        const nomeConta = perfis.get(id) ?? ''
        if (nomeConta && podePerguntar(nomeDep, nomeConta)) {
          duplicates.push({
            memberId: String(d.id),
            name: nomeDep,
            sameAs: id,
            sameAsName: id === userId ? nomeConta : nomeConta,
          })
          break
        }
      }
    }

    return { people: pessoas, size: pessoas.length, inventory, reachable, needsHidden, pendingNames, duplicates, known: true }
  } catch {
    // Ver `known` no tipo: falhar em silêncio com "1 pessoa" produziria uma
    // autonomia inventada que ninguém teria como identificar como erro.
    return { people: [], size: 0, inventory: VAZIO, reachable: [], needsHidden: 0, pendingNames: [], duplicates: [], known: false }
  }
}

/**
 * Versão que aceita o cliente autenticado e descobre o usuário sozinha.
 * Conveniência para rotas que já têm o `supabase` em mãos.
 */
export async function getHouseholdFor(client: SupabaseClient): Promise<Household> {
  const { data } = await client.auth.getUser()
  if (!data.user) return { people: [], size: 0, inventory: VAZIO, reachable: [], needsHidden: 0, pendingNames: [], duplicates: [], known: false }
  return getHousehold(data.user.id)
}
