/**
 * O plano de voo da família — tipos e regras compartilhados (D-066 / doc 18).
 *
 * Vive fora dos componentes porque a mesma forma é usada pelo editor, pelo
 * cache offline e (em PLAN-T07) pelo Pilot. Um plano é um documento inteiro:
 * ponto de encontro sem o papel que diz quem vai até lá não é meio plano, é um
 * plano errado.
 */

export type WaypointKind =
  | 'rendezvous_1'
  | 'rendezvous_2'
  | 'rendezvous_3'
  | 'home'
  | 'school'
  | 'work'
  | 'custom'

export type PlanWaypoint = {
  id?: string
  place_id?: string | null
  kind: WaypointKind
  name: string
  lat: number
  lng: number
  precision?: PointPrecision | null
  notes?: string | null
  sort_order?: number
}

export type PlanRole = {
  /** Quem AGE. Sempre uma conta: um dependente não executa um plano. */
  member_user_id: string
  /**
   * Quem é BUSCADO (D-135 fase 3).
   *
   * Nulo na maioria dos papéis, que não são sobre uma pessoa — "levar o rádio",
   * "fechar o gás". Preenchido quando são: a criança, a avó, justamente quem
   * não sai sozinho e por isso nunca teve conta para aparecer na lista.
   */
  for_member_id?: string | null
  responsibility: string
}

export type PlanDependentBrief = {
  id?: string
  member_id: string
  instruction: string
  updated_at?: string
}

/** Uma pessoa da casa que depende de alguém para sair. */
export type DependenteDoPlano = {
  id: string
  name: string
  /** Bebê, mobilidade reduzida ou criança: não sai sozinho. */
  precisaDeAlguem: boolean
}

/**
 * Rota autoral (doc 18 §5). `geometry` é uma LineString GeoJSON desenhada pela
 * família — nunca calculada por motor de roteamento, porque o valor está no
 * acordo e no conhecimento local, não na otimização.
 */
export type PlanRoute = {
  label: string
  geometry: unknown
  mode?: 'foot' | 'car'
  notes?: string | null
}
export type PlanProtocolActionType = 'meet' | 'evacuate' | 'shelter' | 'communicate' | 'wait' | 'custom'
export type PlanTrigger = {
  condition: string
  action: string
  action_type?: PlanProtocolActionType | null
  destination_kind?: WaypointKind | null
  route_label?: string | null
  notify_circle?: boolean | null
  sort_order?: number
}

export type PlanDocument = {
  plan: { id: string; name: string; version: number; status: string; updated_at: string } | null
  places?: CirclePlace[]
  waypoints: PlanWaypoint[]
  routes: PlanRoute[]
  roles: PlanRole[]
  dependentBriefs?: PlanDependentBrief[]
  triggers: PlanTrigger[]
  acknowledgedBy: string[]
  myAck: number | null
  triggersPending?: boolean
}

export type PlanSummary = {
  id: string
  name: string
  version: number
  status: string
  updated_at: string
}

/**
 * A escada de pontos de encontro (doc 18 §4).
 *
 * Cada degrau resolve um caso diferente, e é por isso que são três e não um. O
 * texto de cada um nomeia o caso, não o nível — "secundário" não diz nada a
 * quem está com medo; "casa inacessível, mas o bairro está bem" diz.
 */
export const RENDEZVOUS: Array<{
  kind: WaypointKind
  pt: { title: string; solves: string; hint: string }
  en: { title: string; solves: string; hint: string }
}> = [
  {
    kind: 'rendezvous_1',
    pt: {
      title: 'Na porta de casa',
      solves: 'Incêndio, vazamento de gás — sair do imóvel agora',
      hint: 'Um ponto visível na frente da casa ou na esquina. Todo mundo chega a pé em segundos.',
    },
    en: {
      title: 'At the doorstep',
      solves: 'Fire, gas leak — leave the building now',
      hint: 'A visible spot in front of the house or at the corner. Everyone gets there on foot in seconds.',
    },
  },
  {
    kind: 'rendezvous_2',
    pt: {
      title: 'No bairro, a pé',
      solves: 'A casa ficou inacessível, mas a região está bem',
      hint: 'Uma praça, escola ou comércio que a família toda reconhece pelo nome.',
    },
    en: {
      title: 'In the neighbourhood, on foot',
      solves: 'The house is unreachable, but the area is fine',
      hint: 'A square, school or shop the whole family knows by name.',
    },
  },
  {
    kind: 'rendezvous_3',
    pt: {
      title: 'Fora da região',
      solves: 'Evacuação regional — o bairro inteiro comprometido',
      hint: 'Precisa ser alcançável sem GPS e sem combustível de sobra. Casa de parente serve melhor que hotel.',
    },
    en: {
      title: 'Out of the region',
      solves: 'Regional evacuation — the whole area compromised',
      hint: 'Must be reachable without GPS and without abundant fuel. A relative’s house beats a hotel.',
    },
  },
]

/**
 * Lugares importantes, SEM a casa.
 *
 * A casa saiu desta lista de propósito. Ela não é "mais um lugar": é a origem
 * de toda distância que a tela afirma — quanto falta até o ponto de encontro,
 * quantos minutos a pé, se o terceiro ponto é alcançável sem carro. Enquanto
 * ela era um chip no fim da página, dava para montar um plano inteiro e nunca
 * ver nenhuma dessas contas, sem que a tela dissesse por quê.
 */
export const PLACE_KINDS: Array<{ kind: WaypointKind; pt: string; en: string }> = [
  { kind: 'school', pt: 'Escola', en: 'School' },
  { kind: 'work', pt: 'Trabalho', en: 'Work' },
  { kind: 'custom', pt: 'Outro', en: 'Other' },
]

/**
 * Quão preciso é um ponto.
 *
 * `profiles.location` é texto livre com placeholder "Cidade, Estado", e o
 * geocoding devolve o CENTROIDE da cidade. Para alerta meteorológico isso serve;
 * para "quanto tempo a pé até o ponto de encontro" não serve, e apresentar as
 * duas coisas com a mesma cara é como uma família conclui que consegue chegar
 * num lugar aonde não consegue.
 */
export type PointPrecision = 'gps' | 'address' | 'city' | 'unknown'

export type CirclePlace = {
  id: string
  circle_id: string
  name: string
  lat: number
  lng: number
  kind: 'home' | 'school' | 'work' | 'rendezvous' | 'custom'
  precision: PointPrecision
  notes: string | null
  created_by?: string
  created_at?: string
  updated_at?: string
  archived_at?: string | null
}

export function precisionLabel(precision: PointPrecision, pt: boolean): string {
  if (precision === 'gps') return pt ? 'marcado no local' : 'marked on site'
  if (precision === 'address') return pt ? 'endereço buscado' : 'searched address'
  if (precision === 'city') return pt ? 'centro da cidade — impreciso' : 'city centre — imprecise'
  return pt ? 'não confirmado' : 'unconfirmed'
}

/**
 * Gatilhos sugeridos — ponto de partida, não obrigação.
 *
 * São condições OBSERVÁVEIS. "Se ficar perigoso" não é gatilho: exige que
 * alguém julgue, no pior momento possível. "Sem contato por 2 horas" é.
 */
export const PROTOCOL_ACTION_TYPES: Array<{
  value: PlanProtocolActionType
  pt: string
  en: string
}> = [
  { value: 'meet', pt: 'Encontrar', en: 'Meet' },
  { value: 'evacuate', pt: 'Evacuar', en: 'Evacuate' },
  { value: 'shelter', pt: 'Abrigar', en: 'Shelter' },
  { value: 'communicate', pt: 'Comunicar', en: 'Communicate' },
  { value: 'wait', pt: 'Esperar', en: 'Wait' },
  { value: 'custom', pt: 'Personalizado', en: 'Custom' },
]

export function protocolActionTypeLabel(value: PlanProtocolActionType | null | undefined, pt: boolean): string {
  return PROTOCOL_ACTION_TYPES.find(option => option.value === value)?.[pt ? 'pt' : 'en']
    ?? PROTOCOL_ACTION_TYPES.find(option => option.value === 'custom')![pt ? 'pt' : 'en']
}

export const TRIGGER_SUGGESTIONS: Array<{ pt: PlanTrigger; en: PlanTrigger }> = [
  {
    pt: {
      condition: 'Sem contato com alguém da família por 2 horas',
      action: 'Ir para o ponto de encontro do bairro',
      action_type: 'meet',
      destination_kind: 'rendezvous_2',
      notify_circle: true,
    },
    en: {
      condition: 'No contact with a family member for 2 hours',
      action: 'Go to the neighbourhood meeting point',
      action_type: 'meet',
      destination_kind: 'rendezvous_2',
      notify_circle: true,
    },
  },
  {
    pt: {
      condition: 'Ordem oficial de evacuação para a nossa área',
      action: 'Executar a saída para o ponto fora da região',
      action_type: 'evacuate',
      destination_kind: 'rendezvous_3',
      notify_circle: true,
    },
    en: {
      condition: 'Official evacuation order for our area',
      action: 'Run the exit to the out-of-region point',
      action_type: 'evacuate',
      destination_kind: 'rendezvous_3',
      notify_circle: true,
    },
  },
  {
    pt: {
      condition: 'Celular e internet fora do ar por mais de 1 hora',
      action: 'Ninguém espera mensagem: seguir o plano',
      action_type: 'communicate',
      notify_circle: false,
    },
    en: {
      condition: 'Phone and internet down for over an hour',
      action: 'Nobody waits for a message: follow the plan',
      action_type: 'communicate',
      notify_circle: false,
    },
  },
  {
    pt: {
      condition: 'Água entrando na rua',
      action: 'Subir para o ponto alto combinado antes de dirigir',
      action_type: 'shelter',
      destination_kind: 'rendezvous_2',
      notify_circle: true,
    },
    en: {
      condition: 'Water rising in the street',
      action: 'Move to the agreed high ground before driving',
      action_type: 'shelter',
      destination_kind: 'rendezvous_2',
      notify_circle: true,
    },
  },
]

export const isRendezvous = (kind: WaypointKind) => kind.startsWith('rendezvous_')

/**
 * Nome padrão para um lugar, a partir do que ele é.
 *
 * Um ponto marcado no mapa JÁ É a informação — a coordenada é mais precisa que
 * qualquer endereço digitado, e num condomínio onde vários prédios dividem o
 * número, a coordenada é a única coisa exata. Exigir que a pessoa digitasse algo
 * para poder confirmar transformava a parte precisa do fluxo em refém da parte
 * imprecisa.
 *
 * O nome continua existindo porque a família precisa CHAMAR o lugar de alguma
 * coisa quando estiver executando o plano ("todo mundo no ponto 2"). Ele só
 * deixa de ser um obstáculo: vem preenchido e pode ser trocado.
 */
export function defaultPlaceName(kind: WaypointKind, pt: boolean): string {
  const rung = RENDEZVOUS.findIndex(r => r.kind === kind)
  if (rung >= 0) return pt ? `Ponto ${rung + 1}` : `Point ${rung + 1}`
  if (kind === 'home') return pt ? 'Casa' : 'Home'
  const place = PLACE_KINDS.find(k => k.kind === kind)
  return place ? place[pt ? 'pt' : 'en'] : pt ? 'Lugar' : 'Place'
}

/**
 * Um plano precisa de ponto de encontro E de papéis (doc 18 §3).
 *
 * Sem os dois não é plano, é mapa — e a UI trata os dois como obrigatórios em
 * vez de deixar salvar algo que não se executa.
 */
export function planGaps(
  doc: { waypoints: PlanWaypoint[]; roles: PlanRole[] },
  pt: boolean,
): string[] {
  // A casa NÃO entra aqui de propósito. Ela é a origem de toda distância e a
  // tela grita isso no primeiro cartão — mas o doc 18 §3 define como obrigatório
  // apenas ponto de encontro e papéis, e uma família que combinou os dois tem um
  // plano válido. Bloquear o save por causa da casa seria eu inventando regra.
  const gaps: string[] = []
  if (!doc.waypoints.some(w => w.kind === 'rendezvous_1')) {
    gaps.push(pt ? 'Falta o ponto de encontro na porta de casa' : 'Missing the doorstep meeting point')
  }
  if (!doc.roles.length) {
    gaps.push(pt ? 'Falta pelo menos um papel: quem busca quem' : 'Missing at least one role: who fetches whom')
  }

  return gaps
}

/**
 * Avisos que NÃO impedem salvar (D-135 fase 3).
 *
 * `planGaps` bloqueia o save, e por isso só pode conter o que o doc 18 §3
 * define como obrigatório: ponto de encontro e papéis. O comentário lá em cima
 * já dizia — "bloquear o save por causa da casa seria eu inventando regra" — e
 * a regra vale para mim também.
 *
 * "Ninguém ficou encarregado da Avó Ana" é importante e não é estrutural. Se
 * bloqueasse, uma família que abriu o plano para corrigir uma rota não
 * conseguiria salvar enquanto não resolvesse outra coisa — e o resultado
 * provável não é que ela resolva, é que ela feche a tela e perca a correção
 * que tinha vindo fazer.
 *
 * Só cobra de quem NÃO SAI SOZINHO. Se toda pessoa cadastrada exigisse um
 * responsável, uma casa de seis abriria o plano com seis avisos e a família
 * aprenderia a ignorar a seção inteira — junto com a linha da avó, que é a que
 * importa.
 */
export function planWarnings(
  doc: { roles: PlanRole[]; dependents?: DependenteDoPlano[] },
  pt: boolean,
): string[] {
  return (doc.dependents ?? [])
    .filter(d => d.precisaDeAlguem)
    .filter(d => !doc.roles.some(r => r.for_member_id === d.id))
    .map(d => (pt ? `Ninguém ficou encarregado de ${d.name}` : `Nobody is assigned to ${d.name}`))
}

/** "sincronizado há 2 dias" — a idade da cópia é parte do plano (doc 18 §6.2). */
export function ageLabel(iso: string | null | undefined, pt: boolean): string {
  if (!iso) return pt ? 'nunca sincronizado' : 'never synced'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return pt ? 'agora' : 'now'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 2) return pt ? 'agora' : 'now'
  if (minutes < 60) return pt ? `há ${minutes} min` : `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return pt ? `há ${hours} h` : `${hours} h ago`
  const days = Math.floor(hours / 24)
  return pt ? `há ${days} ${days === 1 ? 'dia' : 'dias'}` : `${days} ${days === 1 ? 'day' : 'days'} ago`
}
