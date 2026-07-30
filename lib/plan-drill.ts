/**
 * O simulador cobra o plano da família (SIM-T06 / doc 19, doc 18 §9.2).
 *
 * Até aqui o debrief respondia "o que teria acabado" — água, comida, energia.
 * Isso mede o estoque. Não mede a **decisão**: para onde a família ia, quem
 * buscava quem, e se o caminho combinado era possível naquele cenário.
 *
 * É a diferença entre um inventário e um ensaio.
 *
 * REGRA DESTE MÓDULO: só checagem **computável**. Nada aqui tenta adivinhar se
 * um gatilho escrito em português "combina" com o cenário — casar texto livre
 * com condição simulada produz falso positivo, e um alarme falso num app de
 * emergência custa mais do que o silêncio. O que se verifica é geometria,
 * contagem e versão: distância a pé real, existência de rota, quem reconheceu
 * qual versão.
 */

import type { SimulationConfig } from './simulation'
import type { PlanRoute, PlanTrigger, PlanWaypoint } from './family-plan'
import { distanceKm } from './world/shelters'
import { formatDistance, walkingMinutes } from './world/navigation'

export type PlanDrillGap = {
  id: string
  title: string
  detail: string
  severity: 'critical' | 'important' | 'advisory'
}

export type PlanDrillInput = {
  config: SimulationConfig
  waypoints: PlanWaypoint[]
  routes: PlanRoute[]
  triggers: PlanTrigger[]
  /** Quantas pessoas do círculo ainda não confirmaram a versão em vigor. */
  membersPending: number
  planVersion: number
  /** Falso quando não existe plano nenhum. */
  hasPlan: boolean
  /** Alguém da casa não se desloca sozinho, por perfil ou por cenário. */
  mobilityImpaired: boolean
  pt: boolean
}

/**
 * Quanto o cenário penaliza um deslocamento a pé.
 *
 * `walkingMinutes` já usa 4,5 km/h, deliberadamente pessimista. Com mobilidade
 * reduzida, criança pequena ou via alagada, dobrar é a estimativa honesta — e
 * subestimar um trajeto de fuga é exatamente o erro que mata.
 */
const HARD_GOING_FACTOR = 2

/** Acima disso, "ir a pé" deixa de ser plano e vira esperança. */
const WALK_LIMIT_MIN = 180

export function drillPlan(input: PlanDrillInput): PlanDrillGap[] {
  const { config, waypoints, routes, triggers, pt } = input
  const gaps: PlanDrillGap[] = []

  // Só faz sentido cobrar deslocamento quando o cenário mexe com deslocamento.
  const mustMove = config.roadsBlocked || config.severity >= 4 || config.threat === 'wildfire'
  const cannotDrive = config.roadsBlocked

  if (!input.hasPlan) {
    gaps.push({
      id: 'plan-missing',
      severity: mustMove ? 'critical' : 'important',
      title: pt ? 'Não existe plano da família' : 'There is no family plan',
      detail: pt
        ? 'O treino cobriu o estoque, mas não a decisão. Sem ponto de encontro combinado, cada um decide sozinho no pior momento — e vão para lugares diferentes.'
        : 'The drill covered supplies, not the decision. With no agreed meeting point, everyone decides alone at the worst moment — and they end up in different places.',
    })
    return gaps
  }

  const home = waypoints.find(w => w.kind === 'home') ?? null
  const rendezvous = waypoints.filter(w => w.kind.startsWith('rendezvous_'))

  // ── 1. o ponto combinado dá para alcançar NESTE cenário? ──────────────────
  // Esta é a checagem que só um ensaio produz: a distância é a mesma sempre, o
  // que muda é o cenário. Com as vias bloqueadas, "fica a 14 km" deixa de ser
  // um detalhe e vira o plano inteiro.
  if (home && cannotDrive) {
    for (const point of rendezvous) {
      const km = distanceKm(home, point)
      const base = walkingMinutes(km)
      const minutes = input.mobilityImpaired || config.mobilityLimited ? base * HARD_GOING_FACTOR : base
      if (minutes > WALK_LIMIT_MIN) {
        const hours = (minutes / 60).toFixed(1)
        gaps.push({
          id: `reach-${point.kind}`,
          severity: 'important',
          title: pt
            ? `"${point.name}" fica longe demais a pé`
            : `"${point.name}" is too far on foot`,
          detail: pt
            ? `São ${formatDistance(km, true)} desde casa — cerca de ${hours} h caminhando${
                input.mobilityImpaired || config.mobilityLimited ? ', já contando com alguém que não anda no ritmo normal' : ''
              }. Neste cenário as vias estavam bloqueadas, então dirigir não era opção.`
            : `That is ${formatDistance(km, false)} from home — about ${hours} h walking${
                input.mobilityImpaired || config.mobilityLimited ? ', already accounting for someone who cannot keep a normal pace' : ''
              }. In this scenario the roads were blocked, so driving was not an option.`,
        })
      }
    }
  }

  // ── 2. havia rota desenhada para andar? ───────────────────────────────────
  if (cannotDrive && !routes.some(r => r.mode === 'foot')) {
    gaps.push({
      id: 'no-foot-route',
      severity: 'important',
      title: pt ? 'Nenhuma rota a pé desenhada' : 'No walking route drawn',
      detail: pt
        ? 'As vias estavam bloqueadas e o plano só tem caminho de carro (ou nenhum). O caminho a pé é o que precisa estar combinado antes: qual rua alaga, qual atalho existe, onde atravessar.'
        : 'The roads were blocked and the plan only has a driving route (or none). The walking route is the one that has to be agreed in advance: which street floods, which shortcut exists, where to cross.',
    })
  }

  // ── 3. o plano diz QUANDO executar? ───────────────────────────────────────
  if (!triggers.length) {
    gaps.push({
      id: 'no-triggers',
      severity: mustMove ? 'important' : 'advisory',
      title: pt ? 'O plano não diz quando executar' : 'The plan does not say when to execute',
      detail: pt
        ? 'Sem gatilho combinado, alguém precisa julgar no meio do evento se "já é hora". Uma condição observável — sem contato por 2 horas, ordem de evacuação no rádio — tira essa decisão do calor do momento.'
        : 'With no agreed trigger, somebody has to judge mid-event whether "it is time". An observable condition — no contact for 2 hours, an evacuation order on the radio — takes that decision out of the heat of the moment.',
    })
  }

  // ── 4. a família está executando a MESMA versão? ──────────────────────────
  // Num treino isso é constrangedor; num evento é a falha do doc 18 §6.
  if (input.membersPending > 0) {
    gaps.push({
      id: 'unacknowledged',
      severity: 'critical',
      title: pt
        ? `${input.membersPending} pessoa(s) não confirmaram a v${input.planVersion}`
        : `${input.membersPending} person(s) have not confirmed v${input.planVersion}`,
      detail: pt
        ? 'Quem não viu a versão atual executaria a anterior. Duas versões do plano em campo significam a família em dois lugares diferentes — que é exatamente a falha que o plano existe para evitar.'
        : 'Anyone who has not seen the current version would run the previous one. Two versions in the field means the family in two different places — the exact failure the plan exists to prevent.',
    })
  }

  // ── 5. o cenário derrubou a rede e o plano depende de combinar na hora ────
  if (config.networkDown && !rendezvous.length) {
    gaps.push({
      id: 'no-rendezvous-offline',
      severity: 'critical',
      title: pt ? 'Sem rede e sem ponto de encontro' : 'No network and no meeting point',
      detail: pt
        ? 'O celular ficou mudo neste cenário. Sem um lugar combinado, não havia como a família se reencontrar — nenhuma mensagem ia sair.'
        : 'The phone went silent in this scenario. With no agreed place, the family had no way to regroup — no message was going out.',
    })
  }

  return gaps
}
