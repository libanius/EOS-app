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
  kind: WaypointKind
  name: string
  lat: number
  lng: number
  notes?: string | null
  sort_order?: number
}

export type PlanRole = { member_user_id: string; responsibility: string }
export type PlanTrigger = { condition: string; action: string; sort_order?: number }

export type PlanDocument = {
  plan: { id: string; name: string; version: number; status: string; updated_at: string } | null
  waypoints: PlanWaypoint[]
  roles: PlanRole[]
  triggers: PlanTrigger[]
  acknowledgedBy: string[]
  myAck: number | null
  triggersPending?: boolean
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

export const PLACE_KINDS: Array<{ kind: WaypointKind; pt: string; en: string }> = [
  { kind: 'home', pt: 'Casa', en: 'Home' },
  { kind: 'school', pt: 'Escola', en: 'School' },
  { kind: 'work', pt: 'Trabalho', en: 'Work' },
  { kind: 'custom', pt: 'Outro', en: 'Other' },
]

/**
 * Gatilhos sugeridos — ponto de partida, não obrigação.
 *
 * São condições OBSERVÁVEIS. "Se ficar perigoso" não é gatilho: exige que
 * alguém julgue, no pior momento possível. "Sem contato por 2 horas" é.
 */
export const TRIGGER_SUGGESTIONS: Array<{ pt: { condition: string; action: string }; en: { condition: string; action: string } }> = [
  {
    pt: { condition: 'Sem contato com alguém da família por 2 horas', action: 'Ir para o ponto de encontro do bairro' },
    en: { condition: 'No contact with a family member for 2 hours', action: 'Go to the neighbourhood meeting point' },
  },
  {
    pt: { condition: 'Ordem oficial de evacuação para a nossa área', action: 'Executar a saída para o ponto fora da região' },
    en: { condition: 'Official evacuation order for our area', action: 'Run the exit to the out-of-region point' },
  },
  {
    pt: { condition: 'Celular e internet fora do ar por mais de 1 hora', action: 'Ninguém espera mensagem: seguir o plano' },
    en: { condition: 'Phone and internet down for over an hour', action: 'Nobody waits for a message: follow the plan' },
  },
  {
    pt: { condition: 'Água entrando na rua', action: 'Subir para o ponto alto combinado antes de dirigir' },
    en: { condition: 'Water rising in the street', action: 'Move to the agreed high ground before driving' },
  },
]

export const isRendezvous = (kind: WaypointKind) => kind.startsWith('rendezvous_')

/**
 * Um plano precisa de ponto de encontro E de papéis (doc 18 §3).
 *
 * Sem os dois não é plano, é mapa — e a UI trata os dois como obrigatórios em
 * vez de deixar salvar algo que não se executa.
 */
export function planGaps(doc: { waypoints: PlanWaypoint[]; roles: PlanRole[] }, pt: boolean): string[] {
  const gaps: string[] = []
  if (!doc.waypoints.some(w => w.kind === 'rendezvous_1')) {
    gaps.push(pt ? 'Falta o ponto de encontro na porta de casa' : 'Missing the doorstep meeting point')
  }
  if (!doc.roles.length) {
    gaps.push(pt ? 'Falta pelo menos um papel: quem busca quem' : 'Missing at least one role: who fetches whom')
  }
  return gaps
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
