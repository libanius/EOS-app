'use client'

/**
 * Plano da família — the "flight plan" (D-066 / doc 18, PLAN-T02/T04/T05).
 *
 * Three structural choices, each straight out of the spec:
 *
 *  - THE LADDER IS NAMED BY THE CASE IT SOLVES, not by its level. "Secondary"
 *    means nothing to someone who is frightened; "the house is unreachable, but
 *    the area is fine" tells them which point to walk to. (§4)
 *  - THE PLAN DECLARES ITS OWN AGE AND VERSION, always, and asks for an explicit
 *    acknowledgement when it changes. Two people running different versions go
 *    to different places — that is the failure this screen exists to prevent. (§6)
 *  - IT RENDERS FROM THE DEVICE WHEN THE NETWORK IS GONE. A plan that needs the
 *    server is not a plan; it is a webpage. The cached copy is labelled as such,
 *    with the version it holds and how old it is. (§2, §13)
 *
 * Meeting points and roles are REQUIRED and the UI says so before saving:
 * without both, this is a map, not a plan (§3).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { salvarCofre } from '@/lib/native/vault'
import { distanceKm, bearing, compassPoint } from '@/lib/world/shelters'
import { formatDistance, googleMapsRouteUrlFromLineString, walkingMinutes } from '@/lib/world/navigation'
import {
  getFamilyPlan,
  getFamilyPlanList,
  saveFamilyPlan,
  saveFamilyPlanList,
  selectOfflineFamilyPlan,
} from '@/lib/offline-storage'
import { planEnvelope } from '@/lib/plan-envelope'
import { reviewPlanWithPilot, type PlanPilotProposal } from '@/lib/plan-pilot-review'
import {
  PLACE_KINDS,
  PROTOCOL_ACTION_TYPES,
  RENDEZVOUS,
  TRIGGER_SUGGESTIONS,
  ageLabel,
  defaultPlaceName,
  isRendezvous,
  planGaps,
  planWarnings,
  precisionLabel,
  type CirclePlace,
  type PlanDocument,
  type PlanRole,
  type PlanRoute,
  type PlanSummary,
  type PlanTrigger,
  type PlanWaypoint,
  type PointPrecision,
  type WaypointKind,
} from '@/lib/family-plan'
import MapPointPicker from './MapPointPicker'
import PlanChart from './PlanChart'
import RouteDraw, { routeSummary } from './RouteDraw'
import { Card, Pill, SectionLabel } from './primitives'
import PreparednessNav from './PreparednessNav'
import PlanSessionArmCard from './PlanSessionArmCard'
import { FADE, SPRING, haptic } from './motion'
import './world-v2.css'

type Member = { user_id: string; name: string; is_me: boolean }
type Circle = { id: string; name: string; role: string; members?: Member[] }

const COPY = {
  pt: {
    eyebrow: 'Plano da família',
    subtitle: 'Combinado agora, seguido sem discussão depois.',
    version: 'Versão',
    planName: 'Nome do plano',
    planNamePlaceholder: 'Ex.: Sem celular na escola',
    newPlan: 'Novo plano',
    choosePlan: 'Planos deste círculo',
    synced: 'sincronizado',
    noCircle: 'Você ainda não tem um círculo.',
    noCircleHint: 'O plano pertence ao círculo — é o que faz todo mundo enxergar a mesma coisa. Crie um círculo e convide sua família.',
    goCircles: 'Ir para Círculos',
    chart: 'A carta do plano',
    chartNote: 'Desenhada a partir das coordenadas guardadas no aparelho. Não depende de rede, de mapa nem de GPS — é o que fica na tela quando nada mais funciona. Não tem ruas: tem norte, escala e as distâncias reais.',
    homeTitle: 'Endereço de casa',
    homeWhy: 'Toda distância desta tela é medida daqui: quanto falta até cada ponto de encontro, e quantos minutos a pé.',
    homeNone: 'Ainda não definido — por isso as distâncias não aparecem.',
    homeSet: 'Selecionar ponto no mapa',
    homeFromProfile: 'Selecionar Casa',
    homeProfileWarn: 'Use a Casa salva no perfil ou marque o ponto exato no mapa.',
    homeNeeded: 'Defina o endereço de casa para ver distância e tempo a pé.',
    rendezvous: 'Pontos de encontro',
    places: 'Lugares importantes',
    placesHint: 'Escola, trabalho, casa de parente. É de onde alguém pode estar quando o plano começar.',
    placeCatalog: 'Catálogo do círculo',
    chooseExistingPlace: 'Usar lugar salvo',
    deletePlace: 'Apagar lugar',
    placeInUse: 'Este lugar está em uso por pelo menos um plano ativo. Remova-o dos planos antes de apagar.',
    unconfirmedPlace: 'Ponto não confirmado',
    confirmOnMap: 'Confirmar no mapa',
    precisionConfidence: 'Confiança da coordenada',
    confirmNeedsPoint: 'Escolha um ponto no mapa, use sua posição ou busque um endereço para confirmar.',
    precisionGps: 'Estou no local / GPS',
    precisionAddress: 'Endereço buscado',
    precisionCity: 'Centro da cidade',
    roles: 'Quem busca quem',
    fetches: 'busca',
    warnings: 'Alguém pode ficar para trás',
    warningsWhy: 'Dá para salvar assim. Mas quem não sai sozinho precisa de um nome ao lado — no dia, ninguém decide isso na hora.',
    nobodyInParticular: 'ninguém em particular',
    pilotReview: 'Revisão do Pilot',
    pilotReviewBody: 'O Pilot revisa o rascunho e propõe mudanças pequenas. Nada é gravado sozinho: aplique um item por vez e salve o plano depois.',
    pilotApply: 'Aplicar ao rascunho',
    pilotAllClear: 'Sem novas propostas para este rascunho.',
    pilotTrigger: 'Gatilho',
    pilotRole: 'Papel',
    triggers: 'Quando executar',
    routes: 'Rotas',
    routesHint: 'Nenhuma rota desenhada. A rota da família carrega o que roteador nenhum sabe: qual ponte alaga, qual portão fica aberto.',
    openGoogleRoute: 'Google Maps',
    openGoogleRouteLabel: 'Abrir esta rota com paradas no Google Maps',
    drawRoute: 'Desenhar rota',
    needTwoPlaces: 'Defina pelo menos dois lugares antes de desenhar uma rota.',
    byCar: 'Carro',
    onFootShort: 'A pé',
    define: 'Marcar este ponto',
    change: 'Trocar',
    remove: 'Remover',
    add: 'Adicionar',
    save: 'Salvar plano',
    saving: 'Salvando…',
    saved: 'Plano salvo',
    from: 'de casa',
    onFoot: 'a pé',
    missing: 'Falta para o plano ficar executável',
    ackTitle: 'O plano mudou',
    ackBody: (v: number) => `A versão ${v} foi salva por outra pessoa do círculo. Leia e confirme que você viu — é assim que a família sabe que todos estão no mesmo plano.`,
    ackButton: 'Vi a mudança',
    acked: 'Você está na versão atual',
    seenBy: 'Já reconheceram',
    waitingOn: 'Ainda não viram',
    offline: 'Cópia deste aparelho',
    offlineBody: 'Sem rede agora. Este é o plano que estava guardado aqui — pode não ser o mais novo.',
    triggersPending: 'A seção de gatilhos espera uma migração no banco. O resto do plano funciona normalmente.',
    pickTitle: 'Onde fica?',
    useMyPosition: 'Usar minha posição',
    locating: 'Procurando você…',
    pickOnMap: 'Escolher no mapa',
    gotPoint: 'Ponto marcado',
    roughFix: 'sinal fraco; confira no mapa',
    geoDenied: 'O navegador bloqueou a localização. Libere o acesso nas permissões do site e tente de novo — ou escolha no mapa.',
    geoTimeout: 'Não consegui a posição a tempo. Dentro de casa o GPS costuma falhar — escolher no mapa resolve na hora e é mais preciso para o seu caso.',
    geoFailed: 'Não consegui a posição agora. Escolha no mapa.',
    geoUnsupported: 'Este navegador não dá acesso ao GPS. Escolha no mapa.',
    positionHint: 'O jeito mais preciso — se você estiver no local agora. Buscar o endereço funciona de qualquer lugar.',
    searchPlaceholder: 'Buscar endereço ou lugar',
    search: 'Buscar',
    searching: 'Buscando…',
    noResults: 'Nada encontrado. Tente com a cidade junto.',
    nameLabel: 'Como a família chama esse lugar',
    namePlaceholder: 'Ex.: praça da esquina',
    notesLabel: 'Observação (opcional)',
    notesPlaceholder: 'Ex.: entrar pelo portão de trás',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    deletePlan: 'Excluir plano',
    deletePlanAsk: (name: string) => `Excluir "${name}"?`,
    deletePlanWhat: 'O plano sai do seletor e da lista da família. Se ele já foi executado alguma vez, esse registro é preservado.',
    deletePlanLast: 'É o último plano do círculo. A família fica sem nenhum plano até você criar outro.',
    deletePlanGo: 'Excluir',
    deletingPlan: 'Excluindo…',
    deletePlanError: 'Não foi possível excluir o plano.',
    planDeleted: 'Plano excluído',
    who: 'Quem',
    responsibility: 'Faz o quê',
    responsibilityPlaceholder: 'Ex.: pega a Isadora na escola',
    condition: 'Se acontecer',
    action: 'Instrução',
    actionType: 'Tipo de ação',
    destination: 'Destino',
    noDestination: 'Sem destino específico',
    routeOptional: 'Rota',
    noRoute: 'Sem rota específica',
    escalation: 'Sugerir escalonamento',
    escalationMinutes: 'min',
    notifyCircle: 'Alertar círculo ao executar',
    suggestions: 'Sugestões prontas',
    customTrigger: 'Escrever o meu',
    cannotSave: 'Falta para poder salvar',
    noChanges: 'Nada mudou desde o último salvamento.',
    loadError: 'Não foi possível carregar o plano.',
    retry: 'Tentar de novo',
    saveError: 'Não foi possível salvar. Verifique a conexão.',
    noPointYet: 'Sem ponto definido',
    reachCheck: 'Confira se dá para chegar a pé',
    empty: 'Nada aqui ainda.',
  },
  en: {
    eyebrow: 'Family plan',
    subtitle: 'Agreed now, followed without debate later.',
    version: 'Version',
    planName: 'Plan name',
    planNamePlaceholder: 'e.g. No cell service at school',
    newPlan: 'New plan',
    choosePlan: 'Plans in this circle',
    synced: 'synced',
    noCircle: 'You do not have a circle yet.',
    noCircleHint: 'The plan belongs to the circle — that is what makes everyone see the same thing. Create a circle and invite your family.',
    goCircles: 'Go to Circles',
    chart: 'The plan chart',
    chartNote: 'Drawn from the coordinates stored on this device. It needs no network, no map service and no GPS — it is what stays on screen when nothing else works. It has no streets: it has north, a scale bar and the real distances.',
    homeTitle: 'Home address',
    homeWhy: 'Every distance on this screen is measured from here: how far each meeting point is, and how many minutes on foot.',
    homeNone: 'Not set yet — that is why distances are missing.',
    homeSet: 'Pick point on map',
    homeFromProfile: 'Select Home',
    homeProfileWarn: 'Use the Home saved on your profile or mark the exact point on the map.',
    homeNeeded: 'Set the home address to see distance and time on foot.',
    rendezvous: 'Meeting points',
    places: 'Important places',
    placesHint: 'School, work, a relative’s house. It is where someone might be when the plan starts.',
    placeCatalog: 'Circle catalog',
    chooseExistingPlace: 'Use saved place',
    deletePlace: 'Delete place',
    placeInUse: 'This place is used by at least one active plan. Remove it from plans before deleting it.',
    unconfirmedPlace: 'Unconfirmed point',
    confirmOnMap: 'Confirm on map',
    precisionConfidence: 'Coordinate confidence',
    confirmNeedsPoint: 'Pick a point on the map, use your position, or search an address to confirm.',
    precisionGps: 'I am on site / GPS',
    precisionAddress: 'Searched address',
    precisionCity: 'City centre',
    roles: 'Who fetches whom',
    fetches: 'fetches',
    warnings: 'Someone could be left behind',
    warningsWhy: 'You can save as is. But whoever cannot leave alone needs a name beside them — on the day, nobody decides this on the spot.',
    nobodyInParticular: 'nobody in particular',
    pilotReview: 'Pilot review',
    pilotReviewBody: 'Pilot reviews the draft and proposes small changes. Nothing is saved automatically: apply one item at a time and save the plan afterwards.',
    pilotApply: 'Apply to draft',
    pilotAllClear: 'No new proposals for this draft.',
    pilotTrigger: 'Trigger',
    pilotRole: 'Role',
    triggers: 'When to execute',
    routes: 'Routes',
    routesHint: 'No route drawn yet. A family route carries what no routing engine knows: which bridge floods, which gate stays open.',
    openGoogleRoute: 'Google Maps',
    openGoogleRouteLabel: 'Open this route with stops in Google Maps',
    drawRoute: 'Draw route',
    needTwoPlaces: 'Set at least two places before drawing a route.',
    byCar: 'Car',
    onFootShort: 'On foot',
    define: 'Mark this point',
    change: 'Change',
    remove: 'Remove',
    add: 'Add',
    save: 'Save plan',
    saving: 'Saving…',
    saved: 'Plan saved',
    from: 'from home',
    onFoot: 'on foot',
    missing: 'Missing before this plan is executable',
    ackTitle: 'The plan changed',
    ackBody: (v: number) => `Version ${v} was saved by someone in the circle. Read it and confirm you have seen it — that is how the family knows everyone is on the same plan.`,
    ackButton: 'I have seen it',
    acked: 'You are on the current version',
    seenBy: 'Acknowledged',
    waitingOn: 'Have not seen it',
    offline: 'Copy on this device',
    offlineBody: 'No network right now. This is the plan stored here — it may not be the newest.',
    triggersPending: 'The triggers section is waiting on a database migration. The rest of the plan works normally.',
    pickTitle: 'Where is it?',
    useMyPosition: 'Use my position',
    locating: 'Finding you…',
    pickOnMap: 'Pick on the map',
    gotPoint: 'Point marked',
    roughFix: 'weak signal; check it on the map',
    geoDenied: 'The browser blocked location. Allow it in the site permissions and try again — or pick on the map.',
    geoTimeout: 'Could not get a position in time. Indoors, GPS often fails — picking on the map is instant and more precise for your case.',
    geoFailed: 'Could not get a position right now. Pick on the map.',
    geoUnsupported: 'This browser gives no GPS access. Pick on the map.',
    positionHint: 'The most precise way — if you are there right now. Searching the address works from anywhere.',
    searchPlaceholder: 'Search an address or place',
    search: 'Search',
    searching: 'Searching…',
    noResults: 'Nothing found. Try adding the city.',
    nameLabel: 'What the family calls this place',
    namePlaceholder: 'e.g. the corner square',
    notesLabel: 'Note (optional)',
    notesPlaceholder: 'e.g. use the back gate',
    confirm: 'Confirm',
    cancel: 'Cancel',
    deletePlan: 'Delete plan',
    deletePlanAsk: (name: string) => `Delete "${name}"?`,
    deletePlanWhat: 'The plan leaves the switcher and the family list. If it was ever executed, that record is kept.',
    deletePlanLast: 'This is the circle\u2019s last plan. The family will have no plan until you create another one.',
    deletePlanGo: 'Delete',
    deletingPlan: 'Deleting\u2026',
    deletePlanError: 'Could not delete the plan.',
    planDeleted: 'Plan deleted',
    who: 'Who',
    responsibility: 'Does what',
    responsibilityPlaceholder: 'e.g. picks up Isadora at school',
    condition: 'If this happens',
    action: 'Instruction',
    actionType: 'Action type',
    destination: 'Destination',
    noDestination: 'No specific destination',
    routeOptional: 'Route',
    noRoute: 'No specific route',
    escalation: 'Suggest escalation',
    escalationMinutes: 'min',
    notifyCircle: 'Alert circle when running',
    suggestions: 'Ready-made suggestions',
    customTrigger: 'Write my own',
    cannotSave: 'Missing before you can save',
    noChanges: 'Nothing changed since the last save.',
    loadError: 'Could not load the plan.',
    retry: 'Try again',
    saveError: 'Could not save. Check your connection.',
    noPointYet: 'No point set',
    reachCheck: 'Check it is walkable',
    empty: 'Nothing here yet.',
  },
} as const

type PickerTarget = { kind: WaypointKind; index: number | null }

/** Por quanto tempo o GPS de alta precisão continua tentando melhorar o ponto. */
const REFINE_MS = 15000

export default function PlanPage() {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const c = COPY[language]
  const reduceMotion = useReducedMotion()

  const [circles, setCircles] = useState<Circle[]>([])
  const [circleId, setCircleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [fromCache, setFromCache] = useState<string | null>(null)

  const [planId, setPlanId] = useState<string | null>(null)
  const [planName, setPlanName] = useState('')
  const [planSummaries, setPlanSummaries] = useState<PlanSummary[]>([])
  const [version, setVersion] = useState<number>(0)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [myAck, setMyAck] = useState<number | null>(null)
  const [ackedBy, setAckedBy] = useState<string[]>([])
  const [triggersPending, setTriggersPending] = useState(false)

  const [waypoints, setWaypoints] = useState<PlanWaypoint[]>([])
  const [routes, setRoutes] = useState<PlanRoute[]>([])
  const [roles, setRoles] = useState<PlanRole[]>([])
  const [triggers, setTriggers] = useState<PlanTrigger[]>([])
  const [circlePlaces, setCirclePlaces] = useState<CirclePlace[]>([])

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [placeMessage, setPlaceMessage] = useState<string | null>(null)
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [drawing, setDrawing] = useState<{ index: number | null } | null>(null)
  const [profilePlace, setProfilePlace] = useState<{ label: string; lat: number; lng: number } | null>(null)

  const circle = useMemo(() => circles.find(x => x.id === circleId) ?? null, [circleId, circles])
  const members = useMemo(() => circle?.members ?? [], [circle])

  /**
   * Quem é buscado (D-135 fase 3).
   *
   * A seção se chama "Quem busca quem" e só sabia dizer QUEM BUSCA: a lista era
   * de contas do círculo. Quem é buscado normalmente não tem conta — é a
   * criança, é a avó, é justamente quem não sai sozinho.
   *
   * A família contornava escrevendo "buscar a Avó Ana" no texto livre. Funciona
   * para um humano lendo e falha para todo o resto: o Pilot não raciocina sobre
   * um nome dentro de uma frase, e a verificação de lacunas não sabia se alguém
   * tinha ficado sem responsável.
   */
  const [dependentes, setDependentes] = useState<Array<{ id: string; name: string; precisaDeAlguem: boolean }>>([])

  useEffect(() => {
    let cancelado = false
    fetch('/api/family-members')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelado || !Array.isArray(d?.members)) return
        setDependentes(
          d.members.map((m: {
            id: string; name: string; age: number | null
            is_infant?: boolean | null; mobility_impaired?: boolean | null
          }) => ({
            id: m.id,
            name: m.name,
            // Não sai sozinho. Doze anos é onde o produto já corta em outros
            // lugares; um adolescente cadastrado como dependente não vira
            // pendência, senão toda casa grande vira uma lista que ninguém fecha.
            precisaDeAlguem: Boolean(m.is_infant) || Boolean(m.mobility_impaired) || (typeof m.age === 'number' && m.age < 12),
          })),
        )
      })
      .catch(() => {})
    return () => { cancelado = true }
  }, [])
  // O endereço do perfil serve de ponto de PARTIDA para a casa — nunca é adotado
  // sozinho, porque é o centroide da cidade e a tela precisa dizer isso.
  useEffect(() => {
    let cancelled = false
    fetch('/api/profile/ficha')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const p = data?.profile
        if (cancelled || !p?.location || !Number.isFinite(p.location_lat)) return
        setProfilePlace({ label: p.location, lat: p.location_lat, lng: p.location_lng })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // ── circles ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/circles')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { circles?: Circle[] } | null) => {
        if (cancelled) return
        const list = data?.circles ?? []
        setCircles(list)
        let stored: string | null = null
        try { stored = localStorage.getItem('eos-plan-circle') } catch { /* private mode */ }
        setCircleId(list.find(x => x.id === stored)?.id ?? list[0]?.id ?? null)
        if (!list.length) setLoading(false)
      })
      .catch(() => { if (!cancelled) { setFailed(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const applyDocument = useCallback((doc: PlanDocument & { plans?: PlanSummary[] }) => {
    // `plans` é a lista que o servidor passou a devolver (D-080). Mantém o nome
    // que o componente já usava para não existirem dois vocabulários.
    if (doc.plans) setPlanSummaries(doc.plans)
    if (doc.places) setCirclePlaces(doc.places)
    setPlanId(doc.plan?.id ?? null)
    setPlanName(doc.plan?.name ?? '')
    setPlanName(doc.plan?.name ?? '')
    setVersion(doc.plan?.version ?? 0)
    setUpdatedAt(doc.plan?.updated_at ?? null)
    setWaypoints(doc.waypoints ?? [])
    setRoutes(doc.routes ?? [])
    setRoles(doc.roles ?? [])
    setTriggers(doc.triggers ?? [])
    setAckedBy(doc.acknowledgedBy ?? [])
    setMyAck(doc.myAck ?? null)
    setTriggersPending(Boolean(doc.triggersPending))
    setDirty(false)
  }, [])

  const clearDocument = useCallback((name: string) => {
    setPlanId(null)
    setPlanName(name)
    setVersion(0)
    setUpdatedAt(null)
    setWaypoints([])
    setRoutes([])
    setRoles([])
    setTriggers([])
    setAckedBy([])
    setMyAck(null)
    setTriggersPending(false)
    setDirty(true)
    setFromCache(null)
  }, [])

  const loadPlanList = useCallback(async (id: string) => {
    const response = await fetch(`/api/plans?circleId=${id}&all=1`, { cache: 'no-store' }).catch(() => null)
    const data = response?.ok ? ((await response.json().catch(() => null)) as { plans?: PlanSummary[] } | null) : null
    if (data?.plans) {
      setPlanSummaries(data.plans)
      void saveFamilyPlanList({
        circleId: id,
        plans: data.plans,
        syncedAt: new Date().toISOString(),
      })
      return data.plans
    }

    const cached = await getFamilyPlanList(id).catch(() => null)
    setPlanSummaries(cached?.plans ?? [])
    return cached?.plans ?? []
  }, [])

  // ── the plan, network first, device second ─────────────────────────────────
  const load = useCallback(async (id: string, targetPlanId?: string | null) => {
    setLoading(true)
    setFailed(false)
    try {
      const plans = await loadPlanList(id)
      const selected = targetPlanId ?? plans[0]?.id ?? null
      const response = await fetch(`/api/plans?circleId=${id}${selected ? `&planId=${selected}` : ''}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('load')
      const doc = (await response.json()) as PlanDocument
      applyDocument(doc)
      setFromCache(null)
      const serverPlans = (doc as PlanDocument & { plans?: PlanSummary[] }).plans
      if (serverPlans) {
        void saveFamilyPlanList({
          circleId: id,
          plans: serverPlans,
          syncedAt: new Date().toISOString(),
        })
      }
      // PLAN-T05: every successful read refreshes the copy that has to work
      // when this fetch is the thing that fails.
      if (doc.plan?.id) {
        void saveFamilyPlan({
          circleId: id,
          planId: doc.plan.id,
          document: doc,
          version: doc.plan.version ?? 0,
          syncedAt: new Date().toISOString(),
        })
        /*
         * E no cofre NATIVO, ao lado do IndexedDB (D-228 §5).
         *
         * Não é a mesma cópia com outro nome. O IndexedDB pertence à origem
         * `https://…`; a tela que aparece quando a rede cai vive na origem
         * LOCAL do binário e não enxerga nada dele. O armazenamento nativo é do
         * aplicativo, não da origem, e é a única ponte entre os dois.
         *
         * No navegador não faz nada e devolve `false` — o caso normal.
         */
        void salvarCofre({ plan: doc, lang: language })
      }
    } catch {
      const cachedList = await getFamilyPlanList(id).catch(() => null)
      const plans = cachedList?.plans ?? []
      const selection = selectOfflineFamilyPlan(plans, [], targetPlanId)
      const selectedPlanId = selection.planId ?? plans[0]?.id ?? null
      const cached = selectedPlanId ? await getFamilyPlan(id, selectedPlanId).catch(() => null) : null
      setPlanSummaries(selection.plans)
      if (cached?.document) {
        applyDocument(cached.document)
        setFromCache(cached.syncedAt)
      } else {
        setFailed(true)
      }
    } finally {
      setLoading(false)
    }
  }, [applyDocument, loadPlanList, language])

  useEffect(() => {
    if (!circleId) return
    try { localStorage.setItem('eos-plan-circle', circleId) } catch { /* private mode */ }
    void load(circleId)
  }, [circleId, load])

  // ── geometry: is the third point actually walkable? (§4) ───────────────────
  const home = waypoints.find(w => w.kind === 'home') ?? null
  const reach = useCallback(
    (w: PlanWaypoint) => {
      if (!home || w.kind === 'home') return null
      const km = distanceKm(home, w)
      return {
        distance: formatDistance(km, pt),
        minutes: walkingMinutes(km),
        course: compassPoint(bearing(home, w), pt),
        far: km > 8,
      }
    },
    [home, pt],
  )

  const gaps = useMemo(() => planGaps({ waypoints, roles }, pt), [waypoints, roles, pt])
  /*
   * Avisos que NÃO travam o save (D-135 fase 3).
   *
   * "Ninguém ficou encarregado da Avó Ana" é importante e não é estrutural. Se
   * travasse, uma família que abriu o plano para corrigir uma rota não
   * conseguiria salvar até resolver outra coisa — e o resultado provável não é
   * que ela resolva, é que ela feche a tela e perca a correção que veio fazer.
   */
  const avisos = useMemo(() => planWarnings({ roles, dependents: dependentes }, pt), [roles, dependentes, pt])
  const envelope = useMemo(() => planEnvelope(waypoints, routes), [waypoints, routes])
  const pilotProposals = useMemo(
    () => reviewPlanWithPilot({ pt, members, waypoints, roles, triggers }),
    [members, pt, roles, triggers, waypoints],
  )
  // A casa tem cartão próprio no topo; repeti-la aqui faria parecer que são
  // dois endereços diferentes.
  const places = waypoints.filter(w => !isRendezvous(w.kind) && w.kind !== 'home')
  const needsAck = Boolean(planId) && version > 0 && myAck !== version && !dirty
  const currentPlanSummary = useMemo<PlanSummary | null>(
    () => planId
      ? planSummaries.find(plan => plan.id === planId) ?? {
          id: planId,
          name: planName || c.eyebrow,
          version,
          status: 'active',
          updated_at: updatedAt ?? new Date().toISOString(),
        }
      : null,
    [c.eyebrow, planId, planName, planSummaries, updatedAt, version],
  )

  // ── mutations ──────────────────────────────────────────────────────────────
  /**
   * `home` e os três pontos de encontro são ÚNICOS: existe uma casa e existe um
   * ponto por degrau. Tratá-los como lista deixava "Trocar" adicionar um segundo
   * endereço em vez de substituir o primeiro — e duas casas no plano é a mesma
   * ambiguidade que o versionamento existe para eliminar.
   */
  const setWaypoint = (kind: WaypointKind, index: number | null, patch: PlanWaypoint | null) => {
    setDirty(true)
    setWaypoints(current => {
      if (isRendezvous(kind) || kind === 'home') {
        const rest = current.filter(w => w.kind !== kind)
        return patch ? [...rest, patch] : rest
      }
      if (index === null) return patch ? [...current, patch] : current
      // O índice vem da lista VISÍVEL de lugares, que não inclui a casa nem os
      // pontos de encontro. Filtrar igual aqui é o que mantém os dois alinhados.
      const target = current.filter(w => !isRendezvous(w.kind) && w.kind !== 'home')[index]
      const at = target ? current.indexOf(target) : -1
      if (at < 0) return current
      const next = [...current]
      if (patch) next[at] = patch
      else next.splice(at, 1)
      return next
    })
  }

  const selectProfileHome = () => {
    if (!profilePlace) return
    setWaypoint('home', null, {
      kind: 'home',
      name: defaultPlaceName('home', pt),
      lat: profilePlace.lat,
      lng: profilePlace.lng,
      precision: 'city',
      notes: pt
        ? 'Endereço da Casa salvo no perfil — ajuste no mapa se precisar ser mais preciso'
        : 'Home address from the profile — refine on the map if it needs to be more precise',
    })
  }

  const save = async () => {
    if (!circleId || gaps.length) return
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circleId,
          planId,
          createNew: !planId,
          name: planName.trim() || c.eyebrow,
          waypoints,
          routes,
          roles,
          triggers,
          status: 'active',
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error ?? 'save')
      haptic.impact()
      setMessage(c.saved)
      await load(circleId, data?.planId ?? planId)
    } catch {
      setMessage(c.saveError)
    } finally {
      setSaving(false)
    }
  }

  const confirmCirclePlace = async (point: PlanWaypoint) => {
    if (!circleId || !point.place_id) return false
    setPlaceMessage(null)
    try {
      const response = await fetch(`/api/circle-places/${point.place_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: point.name,
          lat: point.lat,
          lng: point.lng,
          precision: point.precision,
          notes: point.notes ?? null,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.message ?? data?.error ?? 'place')
      haptic.impact()
      setPicker(null)
      await load(circleId, planId)
      return true
    } catch (error) {
      setPlaceMessage(error instanceof Error ? error.message : c.saveError)
      return false
    }
  }

  /*
   * Excluir o plano inteiro. Faltava a saída: dava para criar e nunca desfazer,
   * então plano de teste e plano duplicado ficavam para sempre no seletor
   * disputando espaço com o plano de verdade.
   *
   * Dois toques, de propósito. O primeiro abre a confirmação que DIZ o que se
   * perde; só o segundo executa. É o oposto do `×` do catálogo logo acima, que
   * apaga um lugar de todos os planos sem perguntar nada — comportamento que
   * não vou copiar para uma ação maior ainda.
   */
  const deletePlan = async () => {
    if (!planId || !circleId) return
    setDeleting(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/plans/${planId}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error ?? c.deletePlanError)
      haptic.impact()
      setConfirmingDelete(false)

      /*
       * Ficar sem nenhum plano é um estado legítimo, não um erro: é o que
       * acontece quando a família apaga o único plano que tinha. A tela volta
       * para o rascunho em branco em vez de tentar carregar um plano que não
       * existe mais.
       */
      const remaining = await loadPlanList(circleId)
      if (remaining.length) await load(circleId, remaining[0].id)
      else clearDocument(pt ? 'Novo plano' : 'New plan')
      setMessage(c.planDeleted)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : c.deletePlanError)
    } finally {
      setDeleting(false)
    }
  }

  const deleteCirclePlace = async (place: CirclePlace) => {
    setPlaceMessage(null)
    try {
      const response = await fetch(`/api/circle-places/${place.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.message ?? c.placeInUse)
      haptic.impact()
      if (circleId) await load(circleId, planId)
    } catch (error) {
      setPlaceMessage(error instanceof Error ? error.message : c.placeInUse)
    }
  }

  const confirmWaypoint = async (point: PlanWaypoint) => {
    if (!picker) return
    const existingPoint = waypoints.find(w => w.kind === picker.kind)
    if (existingPoint?.place_id && point.place_id === existingPoint.place_id) {
      await confirmCirclePlace(point)
      return
    }
    setWaypoint(picker.kind, picker.index, point)
    setPicker(null)
  }

  const applyPilotProposal = (proposal: PlanPilotProposal) => {
    setDirty(true)
    if (proposal.kind === 'trigger') {
      setTriggers(list => {
        const exists = list.some(trigger => trigger.condition.trim().toLowerCase() === proposal.trigger.condition.trim().toLowerCase())
        return exists ? list : [...list, proposal.trigger]
      })
      return
    }
    setRoles(list => {
      const exists = list.some(role =>
        role.member_user_id === proposal.role.member_user_id &&
        role.responsibility.trim().toLowerCase() === proposal.role.responsibility.trim().toLowerCase(),
      )
      return exists ? list : [...list, proposal.role]
    })
  }

  const acknowledge = async () => {
    if (!planId) return
    const response = await fetch(`/api/plans/${planId}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    }).then(r => r.json()).catch(() => null)
    if (response?.ok) {
      haptic.impact()
      setMyAck(version)
      setAckedBy(list => (list.includes('me') ? list : list))
      if (circleId) void load(circleId)
    } else if (response?.currentVersion) {
      // Someone saved again while this screen was open. Reload rather than
      // record agreement to a version nobody is running.
      if (circleId) void load(circleId)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (!loading && !circles.length) {
    return (
      <main className="wv2 wv2-plan-page">
        <div className="plan-scroll">
        <header className="plan-head">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="plan-title">{c.noCircle}</h1>
          <p className="t-body ink-2">{c.noCircleHint}</p>
        </header>

        {/*
          A faixa vai NOS DOIS caminhos.
          Um teste pegou isto: sem círculo, o Plano renderiza este ramo curto, e
          eu tinha posto a navegação só no principal. A pessoa sem círculo
          chegaria numa tela sem saída dentro da Preparação — justamente quem
          mais precisa de um caminho de volta.
        */}
        <PreparednessNav />

        <Card>
          <a className="wv2-pill primary" href="/family/circulos">{c.goCircles}</a>
        </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="wv2 wv2-plan-page">
      <div className="plan-scroll">
      <header className="plan-head">
        <p className="t-caps ink-3">{c.eyebrow}</p>
        <h1 className="plan-title">{circle?.name ?? '—'}</h1>
        <p className="t-body ink-2">{c.subtitle}</p>

        {/* NAV-T04: o Plano virou subtópico da Preparação. Mesma ordem das
            outras telas — título primeiro, seções depois (D-164). */}
        <PreparednessNav />

        <div className="wv2-plan-meta">
          {version > 0 && (
            <span className="wv2-plan-version">
              {c.version} {version}
            </span>
          )}
          <span className="t-foot ink-3">
            {fromCache
              ? `${c.offline} · ${ageLabel(fromCache, pt)}`
              : `${c.synced} ${ageLabel(updatedAt, pt)}`}
          </span>
        </div>

        {circles.length > 1 && (
          <div className="wv2-plan-circles">
            {circles.map(x => (
              <button
                key={x.id}
                type="button"
                className={`wv2-chip${x.id === circleId ? ' on' : ''}`}
                onClick={() => { haptic.selection(); setCircleId(x.id) }}
              >
                {x.name}
              </button>
            ))}
          </div>
        )}

        <div className="wv2-plan-switcher" aria-label={c.choosePlan}>
          {planSummaries.map(plan => (
            <button
              key={plan.id}
              type="button"
              className={`wv2-chip${plan.id === planId ? ' on' : ''}`}
              onClick={() => {
                if (!circleId) return
                haptic.selection()
                void load(circleId, plan.id)
              }}
            >
              {plan.name}
            </button>
          ))}
          <button
            type="button"
            className="wv2-chip"
            onClick={() => clearDocument(pt ? 'Novo plano' : 'New plan')}
          >
            + {c.newPlan}
          </button>
        </div>
      </header>

      {fromCache && (
        <Card className="wv2-plan-note warn">
          <strong className="t-sub">{c.offline}</strong>
          <p className="t-foot ink-2">{c.offlineBody}</p>
        </Card>
      )}

      <AnimatePresence>
        {needsAck && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0.12 } : SPRING.pop}
          >
            <Card accented className="wv2-plan-ack">
              <strong className="t-title2">{c.ackTitle}</strong>
              <p className="t-body ink-2">{c.ackBody(version)}</p>
              <Pill primary onClick={acknowledge}>{c.ackButton}</Pill>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <Card><p className="t-body ink-2">…</p></Card>
      ) : failed ? (
        <Card>
          <p className="t-body">{c.loadError}</p>
          <Pill onClick={() => circleId && load(circleId)}>{c.retry}</Pill>
        </Card>
      ) : (
        <>
          <SectionLabel>{c.planName}</SectionLabel>
          <Card>
            <input
              className="wv2-input"
              value={planName}
              placeholder={c.planNamePlaceholder}
              onChange={event => {
                setPlanName(event.target.value)
                setDirty(true)
              }}
            />
          </Card>

          {planId && (
            <>
              <SectionLabel>{pt ? 'Armar sessão' : 'Arm session'}</SectionLabel>
              <PlanSessionArmCard
                circleId={circleId}
                plan={currentPlanSummary}
                members={members}
                dependents={dependentes}
                dirty={dirty}
              />
            </>
          )}

          {avisos.length > 0 && (
            <Card className="wv2-plan-note gaps">
              <strong className="t-sub">{c.warnings}</strong>
              <ul>
                {avisos.map(a => <li key={a} className="t-foot ink-2">{a}</li>)}
              </ul>
              <p className="t-foot ink-3">{c.warningsWhy}</p>
            </Card>
          )}

          {gaps.length > 0 && (
            <Card className="wv2-plan-note gaps">
              <strong className="t-sub">{c.missing}</strong>
              <ul>
                {gaps.map(g => <li key={g} className="t-foot ink-2">{g}</li>)}
              </ul>
            </Card>
          )}

          <SectionLabel trailing={pilotProposals.length ? String(pilotProposals.length) : undefined}>
            {c.pilotReview}
          </SectionLabel>
          <Card className="wv2-plan-pilot">
            <p className="t-foot ink-3">{c.pilotReviewBody}</p>
            {pilotProposals.length === 0 ? (
              <p className="t-foot ok">{c.pilotAllClear}</p>
            ) : (
              <div className="wv2-plan-pilot-list">
                {pilotProposals.map(proposal => (
                  <div key={proposal.id} className="wv2-plan-pilot-item">
                    <span className="t-caps ink-3">{proposal.kind === 'trigger' ? c.pilotTrigger : c.pilotRole}</span>
                    <strong className="t-sub">{proposal.title}</strong>
                    <p className="t-foot ink-2">{proposal.reason}</p>
                    {proposal.kind === 'trigger' ? (
                      <p className="t-foot ink-3">{proposal.trigger.condition} → {proposal.trigger.action}</p>
                    ) : (
                      <p className="t-foot ink-3">
                        {members.find(member => member.user_id === proposal.role.member_user_id)?.name ?? c.who}: {proposal.role.responsibility}
                      </p>
                    )}
                    <Pill onClick={() => applyPilotProposal(proposal)}>{c.pilotApply}</Pill>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── the chart: the plan drawn from its own coordinates ─────── */}
          {waypoints.length > 0 && (
            <>
              <SectionLabel trailing={envelope ? `${envelope.spanKm.toFixed(1)} km` : undefined}>
                {c.chart}
              </SectionLabel>
              <Card>
                <PlanChart waypoints={waypoints} routes={routes} pt={pt} />
                <p className="t-foot ink-3 chart-note">{c.chartNote}</p>
              </Card>
            </>
          )}

          {/* ── home: the origin of every distance on this screen ──────── */}
          <SectionLabel>{c.homeTitle}</SectionLabel>
          <Card accented={!home} className="wv2-plan-step wv2-plan-home">
            <p className="t-foot ink-3">{c.homeWhy}</p>
            {home ? (
              <>
                <p className="t-body point">{home.name}</p>
                {home.notes && <p className="t-foot ink-2">{home.notes}</p>}
                <p className="t-foot ink-3">{home.lat.toFixed(5)}, {home.lng.toFixed(5)}</p>
                {home.precision && (
                  <p className={`t-foot ${home.precision === 'unknown' ? 'warn' : 'ink-3'}`}>
                    {precisionLabel(home.precision, pt)}
                  </p>
                )}
                <div className="acts">
                  {profilePlace && <Pill onClick={selectProfileHome}>{c.homeFromProfile}</Pill>}
                  <Pill onClick={() => setPicker({ kind: 'home', index: null })}>{c.homeSet}</Pill>
                  {home.precision === 'unknown' && (
                    <Pill onClick={() => setPicker({ kind: 'home', index: null })}>{c.confirmOnMap}</Pill>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="t-foot warn">{c.homeNone}</p>
                <div className="acts">
                  {profilePlace && <Pill primary onClick={selectProfileHome}>{c.homeFromProfile}</Pill>}
                  <Pill primary={!profilePlace} onClick={() => setPicker({ kind: 'home', index: null })}>{c.homeSet}</Pill>
                </div>
                {profilePlace && <p className="t-foot ink-3">{c.homeProfileWarn}</p>}
              </>
            )}
          </Card>

          {/* ── meeting points ─────────────────────────────────────────── */}
          <SectionLabel>{c.rendezvous}</SectionLabel>
          {RENDEZVOUS.map((step, i) => {
            const point = waypoints.find(w => w.kind === step.kind) ?? null
            const info = point ? reach(point) : null
            const label = step[pt ? 'pt' : 'en']
            return (
              <Card key={step.kind} className="wv2-plan-step">
                <div className="head">
                  <span className="rung t-caps">{i + 1}</span>
                  <div>
                    <strong className="t-title2">{label.title}</strong>
                    <p className="t-foot ink-3">{label.solves}</p>
                  </div>
                </div>

                {point ? (
                  <>
                    <p className="t-body point">{point.name}</p>
                    {point.notes && <p className="t-foot ink-2">{point.notes}</p>}
                    {point.precision && (
                      <p className={`t-foot ${point.precision === 'unknown' ? 'warn' : 'ink-3'}`}>
                        {precisionLabel(point.precision, pt)}
                      </p>
                    )}
                    {info ? (
                      <p className={`t-foot ${info.far ? 'warn' : 'ink-3'}`}>
                        {info.distance} {c.from} · {info.course} · ~{info.minutes} min {c.onFoot}
                        {info.far && ` — ${c.reachCheck}`}
                      </p>
                    ) : (
                      // Antes, sem casa definida, esta linha simplesmente não
                      // existia — e a ausência de um número parece "está tudo
                      // bem". Dizer por que falta é a correção.
                      <p className="t-foot ink-3">{c.homeNeeded}</p>
                    )}
                    <div className="acts">
                      <Pill onClick={() => setPicker({ kind: step.kind, index: null })}>{c.change}</Pill>
                      {point.precision === 'unknown' && (
                        <Pill onClick={() => setPicker({ kind: step.kind, index: null })}>{c.confirmOnMap}</Pill>
                      )}
                      <Pill onClick={() => setWaypoint(step.kind, null, null)}>{c.remove}</Pill>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="t-foot ink-3">{label.hint}</p>
                    <Pill primary onClick={() => setPicker({ kind: step.kind, index: null })}>{c.define}</Pill>
                  </>
                )}
              </Card>
            )
          })}

          {/* ── known places ───────────────────────────────────────────── */}
          <SectionLabel trailing={places.length ? String(places.length) : undefined}>{c.places}</SectionLabel>
          <Card>
            <p className="t-foot ink-3">{c.placesHint}</p>
            {placeMessage && <p className="t-foot warn" role="status">{placeMessage}</p>}
            {places.map((place, index) => {
              const kindLabel = PLACE_KINDS.find(k => k.kind === place.kind)?.[pt ? 'pt' : 'en'] ?? place.kind
              return (
                <div key={`${place.kind}-${index}`} className="wv2-plan-row">
                  <span className="t-caps ink-3">{kindLabel}</span>
                  <span className="t-body">
                    {place.name}
                    {place.precision === 'unknown' && <em className="t-foot warn route-meta">{c.unconfirmedPlace}</em>}
                  </span>
                  <button type="button" className="wv2-plan-x" onClick={() => setWaypoint(place.kind, index, null)} aria-label={c.remove}>×</button>
                </div>
              )
            })}
            {circlePlaces.length > 0 && (
              <>
                <p className="t-caps ink-3 sugg-label">{c.placeCatalog}</p>
                {circlePlaces.map(place => (
                  <div key={place.id} className="wv2-plan-row">
                    <span className="t-caps ink-3">{precisionLabel(place.precision, pt)}</span>
                    <span className="t-body">{place.name}</span>
                    <button type="button" className="wv2-plan-x" onClick={() => { void deleteCirclePlace(place) }} aria-label={c.deletePlace}>×</button>
                  </div>
                ))}
              </>
            )}
            <div className="wv2-plan-addrow">
              {PLACE_KINDS.map(k => (
                <Pill key={k.kind} onClick={() => setPicker({ kind: k.kind, index: null })}>
                  + {k[pt ? 'pt' : 'en']}
                </Pill>
              ))}
            </div>
          </Card>

          {/* ── routes: author-drawn, never routed (§5) ────────────────── */}
          <SectionLabel trailing={routes.length ? String(routes.length) : undefined}>{c.routes}</SectionLabel>
          <Card>
            {routes.length === 0 && <p className="t-foot ink-3">{c.routesHint}</p>}
            {routes.map((route, index) => {
              const googleRoute = googleMapsRouteUrlFromLineString(route.geometry, route.mode)
              return (
                <div key={index} className="wv2-plan-row">
                  <span className="t-caps ink-3">{route.mode === 'car' ? c.byCar : c.onFootShort}</span>
                  <span className="t-body">
                    {route.label}
                    <em className="t-foot ink-3 route-meta">{routeSummary(route, pt)}</em>
                    {route.notes && <em className="t-foot ink-2 route-meta">{route.notes}</em>}
                  </span>
                  <span className="route-acts">
                    {googleRoute && (
                      <a
                        className="wv2-route-nav"
                        href={googleRoute}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={c.openGoogleRouteLabel}
                      >
                        {c.openGoogleRoute}
                      </a>
                    )}
                    <button type="button" className="wv2-plan-x" onClick={() => setDrawing({ index })} aria-label={c.change}>✎</button>
                    <button type="button" className="wv2-plan-x" onClick={() => { setDirty(true); setRoutes(list => list.filter((_, i) => i !== index)) }} aria-label={c.remove}>×</button>
                  </span>
                </div>
              )
            })}
            <div className="wv2-plan-addrow">
              <Pill onClick={() => setDrawing({ index: null })} disabled={waypoints.length < 2}>
                + {c.drawRoute}
              </Pill>
            </div>
            {waypoints.length < 2 && <p className="t-foot ink-3">{c.needTwoPlaces}</p>}
          </Card>

          {/* ── roles ──────────────────────────────────────────────────── */}
          <SectionLabel>{c.roles}</SectionLabel>
          <Card>
            {roles.length === 0 && <p className="t-foot ink-3">{c.empty}</p>}
            {roles.map((role, index) => (
              <div key={index} className="wv2-plan-role">
                <select
                  className="wv2-input"
                  value={role.member_user_id}
                  onChange={e => {
                    setDirty(true)
                    setRoles(list => list.map((r, i) => (i === index ? { ...r, member_user_id: e.target.value } : r)))
                  }}
                >
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                </select>
                {/*
                  A outra metade de "quem busca quem" (D-135 fase 3).

                  Fica ao lado de quem age, não escondido: a família lê a linha
                  como uma frase — "Paulo busca Avó Ana". "Ninguém em
                  particular" é o padrão porque a maioria dos papéis não é sobre
                  uma pessoa ("levar o rádio", "fechar o gás"), e exigir um alvo
                  transformaria cada um deles numa pergunta sem resposta.
                */}
                {dependentes.length > 0 && (
                  <>
                    <span className="wv2-plan-role-verb t-foot ink-3">{c.fetches}</span>
                    <select
                      className="wv2-input"
                      value={role.for_member_id ?? ''}
                      aria-label={c.roles}
                      onChange={e => {
                        setDirty(true)
                        setRoles(list => list.map((r, i) => (i === index ? { ...r, for_member_id: e.target.value || null } : r)))
                      }}
                    >
                      <option value="">{c.nobodyInParticular}</option>
                      {dependentes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </>
                )}
                <input
                  className="wv2-input"
                  value={role.responsibility}
                  placeholder={c.responsibilityPlaceholder}
                  onChange={e => {
                    setDirty(true)
                    setRoles(list => list.map((r, i) => (i === index ? { ...r, responsibility: e.target.value } : r)))
                  }}
                />
                <button type="button" className="wv2-plan-x" onClick={() => { setDirty(true); setRoles(list => list.filter((_, i) => i !== index)) }} aria-label={c.remove}>×</button>
              </div>
            ))}
            <Pill
              onClick={() => {
                setDirty(true)
                setRoles(list => [...list, { member_user_id: members[0]?.user_id ?? '', for_member_id: null, responsibility: '' }])
              }}
              disabled={!members.length}
            >
              + {c.add}
            </Pill>
          </Card>

          {/* ── triggers ───────────────────────────────────────────────── */}
          <SectionLabel>{c.triggers}</SectionLabel>
          <Card>
            {triggersPending && <p className="t-foot warn">{c.triggersPending}</p>}
            {!triggersPending && triggers.length === 0 && <p className="t-foot ink-3">{c.empty}</p>}
            {triggers.map((trigger, index) => (
              <div key={index} className="wv2-plan-trigger">
                <input
                  className="wv2-input"
                  value={trigger.condition}
                  placeholder={c.condition}
                  onChange={e => {
                    setDirty(true)
                    setTriggers(list => list.map((t, i) => (i === index ? { ...t, condition: e.target.value } : t)))
                  }}
                />
                <select
                  className="wv2-input"
                  value={trigger.action_type ?? 'custom'}
                  aria-label={c.actionType}
                  onChange={e => {
                    setDirty(true)
                    setTriggers(list => list.map((t, i) => (i === index ? { ...t, action_type: e.target.value as PlanTrigger['action_type'] } : t)))
                  }}
                >
                  {PROTOCOL_ACTION_TYPES.map(option => (
                    <option key={option.value} value={option.value}>{option[pt ? 'pt' : 'en']}</option>
                  ))}
                </select>
                <input
                  className="wv2-input"
                  value={trigger.action}
                  placeholder={c.action}
                  onChange={e => {
                    setDirty(true)
                    setTriggers(list => list.map((t, i) => (i === index ? { ...t, action: e.target.value } : t)))
                  }}
                />
                <select
                  className="wv2-input"
                  value={trigger.destination_kind ?? ''}
                  aria-label={c.destination}
                  onChange={e => {
                    setDirty(true)
                    setTriggers(list => list.map((t, i) => (i === index ? { ...t, destination_kind: (e.target.value || null) as PlanTrigger['destination_kind'] } : t)))
                  }}
                >
                  <option value="">{c.noDestination}</option>
                  {waypoints.map(point => (
                    <option key={`${point.kind}:${point.name}`} value={point.kind}>{point.name}</option>
                  ))}
                </select>
                <select
                  className="wv2-input"
                  value={trigger.route_label ?? ''}
                  aria-label={c.routeOptional}
                  onChange={e => {
                    setDirty(true)
                    setTriggers(list => list.map((t, i) => (i === index ? { ...t, route_label: e.target.value || null } : t)))
                  }}
                >
                  <option value="">{c.noRoute}</option>
                  {routes.map(route => (
                    <option key={route.label} value={route.label}>{route.label}</option>
                  ))}
                </select>
                <label className="wv2-plan-trigger-minutes">
                  <span className="t-caps ink-3">{c.escalation}</span>
                  <input
                    className="wv2-input"
                    type="number"
                    min={5}
                    max={120}
                    step={5}
                    value={trigger.escalation_minutes ?? 15}
                    aria-label={c.escalation}
                    onChange={e => {
                      const value = Number(e.target.value)
                      setDirty(true)
                      setTriggers(list => list.map((t, i) => (i === index
                        ? { ...t, escalation_minutes: Number.isFinite(value) ? Math.max(5, Math.min(120, Math.round(value))) : null }
                        : t)))
                    }}
                  />
                  <em className="t-foot ink-3">{c.escalationMinutes}</em>
                </label>
                <label className="wv2-plan-check">
                  <input
                    type="checkbox"
                    checked={trigger.notify_circle !== false}
                    onChange={e => {
                      setDirty(true)
                      setTriggers(list => list.map((t, i) => (i === index ? { ...t, notify_circle: e.target.checked } : t)))
                    }}
                  />
                  <span>{c.notifyCircle}</span>
                </label>
                <button type="button" className="wv2-plan-x" onClick={() => { setDirty(true); setTriggers(list => list.filter((_, i) => i !== index)) }} aria-label={c.remove}>×</button>
              </div>
            ))}
            {!triggersPending && (
              <>
                <Pill
                  onClick={() => {
                    setDirty(true)
                    setTriggers(list => [...list, { condition: '', action: '', action_type: 'custom', notify_circle: true, escalation_minutes: 15 }])
                  }}
                >
                  + {c.customTrigger}
                </Pill>

                <p className="t-caps ink-3 sugg-label">{c.suggestions}</p>
                {/*
                  Sugestões são FRASES INTEIRAS, não etiquetas. Numa pill elas
                  estouravam a largura do telefone. Viraram uma lista de opções
                  em bloco, que é o que uma frase pede.
                */}
                <div className="wv2-plan-suggestions">
                  {TRIGGER_SUGGESTIONS.map((s, i) => {
                    const item = s[pt ? 'pt' : 'en']
                    const already = triggers.some(t => t.condition === item.condition)
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={already}
                        onClick={() => {
                          setDirty(true)
                          setTriggers(list => [...list, { ...item, escalation_minutes: item.escalation_minutes ?? 15 }])
                        }}
                      >
                        <strong className="t-sub">{already ? '✓ ' : '+ '}{item.condition}</strong>
                        <span className="t-foot ink-3">{item.action}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </Card>

          {/* ── who has seen it (§6.4) ─────────────────────────────────── */}
          {planId && members.length > 1 && (
            <>
              <SectionLabel>{`${c.seenBy} · v${version}`}</SectionLabel>
              <Card>
                <div className="wv2-plan-acks">
                  {members.map(m => {
                    const seen = ackedBy.includes(m.user_id)
                    return (
                      <span key={m.user_id} className={`wv2-chip${seen ? ' on' : ''}`}>
                        {seen ? '✓ ' : '· '}{m.name}
                      </span>
                    )
                  })}
                </div>
                <p className="t-foot ink-3">
                  {ackedBy.length === members.length
                    ? pt ? 'Todo mundo está na versão atual.' : 'Everyone is on the current version.'
                    : `${c.waitingOn}: ${members.filter(m => !ackedBy.includes(m.user_id)).map(m => m.name).join(', ')}`}
                </p>
              </Card>
            </>
          )}

          {/*
            O botão ficava desabilitado sem dizer por quê, e o aviso do que
            faltava estava lá no TOPO da página — longe demais para se conectar
            ao botão. Quem chegava aqui achava que o salvar estava quebrado.
            O motivo agora fica colado no botão, que é onde a pergunta nasce.
          */}
          <div className="wv2-plan-save">
            {message && <p className={`t-foot ${message === c.saved ? 'ok' : 'warn'}`} role="status">{message}</p>}
            {gaps.length > 0 ? (
              <p className="t-foot warn">{c.cannotSave}: {gaps.join(' · ')}</p>
            ) : !dirty && !saving ? (
              <p className="t-foot ink-3">{c.noChanges}</p>
            ) : null}
            <Pill primary wide onClick={save} disabled={saving || gaps.length > 0 || !dirty}>
              {saving ? c.saving : c.save}
            </Pill>
          </div>

          {/*
            A saída fica DEPOIS do salvar e separada por uma linha, porque não
            compete com ele: quem chega aqui quase sempre veio salvar. Nunca é
            um `×` — a ação que apaga o plano inteiro não pode parecer a ação
            que tira uma linha de uma lista.
          */}
          {planId && (
            <div className="wv2-plan-danger">
              {confirmingDelete ? (
                <>
                  <strong className="t-sub">{c.deletePlanAsk(planName || c.eyebrow)}</strong>
                  <p className="t-foot ink-2">{c.deletePlanWhat}</p>
                  {planSummaries.length <= 1 && (
                    <p className="t-foot warn">{c.deletePlanLast}</p>
                  )}
                  <div className="acts">
                    <Pill onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                      {c.cancel}
                    </Pill>
                    <button
                      type="button"
                      className="wv2-plan-danger-go"
                      onClick={() => { void deletePlan() }}
                      disabled={deleting}
                    >
                      {deleting ? c.deletingPlan : c.deletePlanGo}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="wv2-plan-danger-open"
                  onClick={() => setConfirmingDelete(true)}
                >
                  {c.deletePlan}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <RouteDraw
        open={Boolean(drawing)}
        pt={pt}
        waypoints={waypoints}
        existing={drawing?.index != null ? routes[drawing.index] ?? null : null}
        onClose={() => setDrawing(null)}
        onSave={route => {
          setDirty(true)
          setRoutes(list =>
            drawing?.index != null ? list.map((r, i) => (i === drawing.index ? route : r)) : [...list, route],
          )
          setDrawing(null)
        }}
      />

      <PointPicker
        target={picker}
        pt={pt}
        copy={c}
        places={circlePlaces}
        fallback={home ? { lat: home.lat, lng: home.lng } : profilePlace}
        existing={picker ? waypoints.find(w => w.kind === picker.kind) ?? null : null}
        onClose={() => setPicker(null)}
        onConfirm={point => { void confirmWaypoint(point) }}
      />
      </div>
    </main>
  )
}

/**
 * PointPicker — a place becomes a coordinate.
 *
 * Search is SUBMIT-DRIVEN, never on keystroke: `/api/geocode/search` proxies
 * Nominatim, whose usage policy forbids typeahead and would block the whole app.
 */
function PointPicker({
  target,
  pt,
  copy,
  places,
  existing,
  fallback,
  onClose,
  onConfirm,
}: {
  target: PickerTarget | null
  pt: boolean
  copy: typeof COPY['pt'] | typeof COPY['en']
  places: CirclePlace[]
  existing: PlanWaypoint | null
  /** Onde enquadrar o mapa quando ainda não há ponto: casa, ou perfil. */
  fallback: { lat: number; lng: number } | null
  onClose: () => void
  onConfirm: (point: PlanWaypoint) => void
}) {
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; label: string; lat: number; lng: number }>>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [precision, setPrecision] = useState<PointPrecision>('unknown')
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [onMap, setOnMap] = useState(false)

  useEffect(() => {
    if (!target) return
    setQuery('')
    setResults([])
    setSearched(false)
    setPoint(existing ? { lat: existing.lat, lng: existing.lng } : null)
    setName(existing?.name ?? defaultPlaceName(target.kind, pt))
    setNotes(existing?.notes ?? '')
    setPrecision(existing?.precision ?? 'unknown')
    setGeoBusy(false)
    setGeoError(null)
    setAccuracy(null)
  }, [target, existing, pt])

  /**
   * O nome deixa de bloquear a confirmação.
   *
   * Marcar no mapa é a parte PRECISA do fluxo; digitar um endereço é a
   * imprecisa. Exigir a segunda para liberar a primeira era ter o obstáculo no
   * lugar errado. O nome vem preenchido pelo tipo do lugar e pode ser trocado.
   */
  const nameIfEmpty = () => {
    if (!target) return
    setName(current => (current.trim() ? current : defaultPlaceName(target.kind, pt)))
  }

  const finalName = target ? (name.trim() || defaultPlaceName(target.kind, pt)) : ''

  const runSearch = async () => {
    if (query.trim().length < 2) return
    setSearching(true)
    try {
      const data = await fetch(`/api/geocode/search?q=${encodeURIComponent(query.trim())}`)
        .then(r => (r.ok ? r.json() : null))
      setResults(data?.results ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  /**
   * "Usar minha posição", em DOIS ESTÁGIOS.
   *
   * A primeira versão pedia `enableHighAccuracy: true` com `maximumAge: 0` — a
   * combinação mais dura que existe: recusa qualquer posição que o aparelho já
   * tenha e exige uma trava de GPS nova. Dentro de casa, ou num laptop sem GPS,
   * isso simplesmente expira. O dono viu exatamente isso.
   *
   * O `RiskProvider`, que sempre funcionou, já mostrava o caminho: baixa
   * precisão e aceita um fix de até dois minutos.
   *
   *   Estágio 1 — rápido. Aceita fix recente, sem exigir alta precisão. É o que
   *     coloca um ponto na tela em segundos.
   *   Estágio 2 — refino. `watchPosition` de alta precisão por alguns segundos,
   *     substituindo o ponto só quando a leitura MELHORA. Silencioso: quem já
   *     tem o que queria não precisa saber que houve refino.
   *
   * Só reporta falha se os dois falharem — e o erro sempre aponta o mapa como
   * saída, porque escolher o pino não depende de GPS nenhum.
   */
  const useMyPosition = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(copy.geoUnsupported)
      return
    }
    setGeoBusy(true)
    setGeoError(null)

    let settled = false
    let bestAccuracy = Infinity

    const accept = (position: GeolocationPosition) => {
      const acc = position.coords.accuracy ?? Infinity
      // O refino só substitui o que já está na tela se for de fato melhor.
      if (acc > bestAccuracy) return
      bestAccuracy = acc
      if (!settled) {
        settled = true
        haptic.selection()
        setGeoBusy(false)
      }
      setPoint({ lat: position.coords.latitude, lng: position.coords.longitude })
      setAccuracy(Number.isFinite(acc) ? acc : null)
      setPrecision('gps')
      nameIfEmpty()
    }

    const fail = (error: GeolocationPositionError) => {
      if (settled) return
      settled = true
      setGeoBusy(false)
      setAccuracy(null)
      setGeoError(
        error.code === error.PERMISSION_DENIED
          ? copy.geoDenied
          : error.code === error.TIMEOUT
            ? copy.geoTimeout
            : copy.geoFailed,
      )
    }

    // Estágio 2 começa junto: num aparelho com GPS ele costuma chegar primeiro,
    // e num sem GPS o estágio 1 já resolveu.
    const watch = navigator.geolocation.watchPosition(accept, () => {}, {
      enableHighAccuracy: true,
      timeout: REFINE_MS,
      maximumAge: 0,
    })
    window.setTimeout(() => navigator.geolocation.clearWatch(watch), REFINE_MS)

    navigator.geolocation.getCurrentPosition(accept, fail, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 120000,
    })
  }

  return (
    <AnimatePresence>
      {target && (
        <>
          <motion.button
            type="button"
            className="wv2-picker-scrim"
            aria-label={copy.cancel}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          />
          <motion.section
            className="wv2-picker wv2-fume"
            role="dialog"
            aria-label={copy.pickTitle}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30 }}
            transition={reduceMotion ? { duration: 0.12 } : SPRING.sheet}
          >
            <strong className="t-title2">{copy.pickTitle}</strong>

            <div className="wv2-picker-ways">
              <Pill onClick={useMyPosition} disabled={geoBusy}>
                {geoBusy ? copy.locating : copy.useMyPosition}
              </Pill>
              <Pill onClick={() => setOnMap(true)}>{copy.pickOnMap}</Pill>
            </div>
            <p className="t-foot ink-3">{copy.positionHint}</p>
            {geoError && <p className="t-foot warn" role="status">{geoError}</p>}

            {places.length > 0 && (
              <div className="wv2-plan-suggestions">
                <p className="t-caps ink-3 sugg-label">{copy.chooseExistingPlace}</p>
                {places.map(place => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => {
                      haptic.selection()
                      onConfirm({
                        place_id: place.id,
                        kind: target.kind,
                        name: place.name,
                        lat: place.lat,
                        lng: place.lng,
                        precision: place.precision,
                        notes: place.notes,
                      })
                    }}
                  >
                    <strong className="t-sub">{place.name}</strong>
                    <span className={`t-foot ${place.precision === 'unknown' ? 'warn' : 'ink-3'}`}>
                      {precisionLabel(place.precision, pt)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <form
              className="wv2-picker-search"
              onSubmit={e => { e.preventDefault(); void runSearch() }}
            >
              <input
                className="wv2-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={copy.searchPlaceholder}
                enterKeyHint="search"
              />
              <Pill type="submit" disabled={searching}>{searching ? copy.searching : copy.search}</Pill>
            </form>

            {results.length > 0 && (
              <ul className="wv2-picker-results">
                {results.map(r => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        haptic.selection()
                        setPoint({ lat: r.lat, lng: r.lng })
                        setPrecision('address')
                        if (!name) setName(r.name)
                      }}
                    >
                      <strong className="t-sub">{r.name}</strong>
                      <span className="t-foot ink-3">{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searched && !results.length && !searching && (
              <p className="t-foot ink-3">{copy.noResults}</p>
            )}

            {point && (
              <p className="t-foot ok" role="status">
                {copy.gotPoint} · {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                {accuracy !== null && ` · ±${Math.round(accuracy)} m`}
                {accuracy !== null && accuracy > 40 && ` — ${copy.roughFix}`}
              </p>
            )}

            <label className="wv2-field">
              <span className="t-caps ink-3">{copy.nameLabel}</span>
              <input className="wv2-input" value={name} onChange={e => setName(e.target.value)} placeholder={copy.namePlaceholder} />
            </label>

            <label className="wv2-field">
              <span className="t-caps ink-3">{copy.notesLabel}</span>
              <input className="wv2-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={copy.notesPlaceholder} />
            </label>

            <label className="wv2-field">
              <span className="t-caps ink-3">{copy.precisionConfidence}</span>
              <select
                className="wv2-input"
                value={precision}
                onChange={event => setPrecision(event.target.value as PointPrecision)}
              >
                <option value="unknown">{copy.unconfirmedPlace}</option>
                <option value="gps">{copy.precisionGps}</option>
                <option value="address">{copy.precisionAddress}</option>
                <option value="city">{copy.precisionCity}</option>
              </select>
            </label>

            {/*
              AUTHOR-T02 / regra 18: precisão NUNCA bloqueia a confirmação de
              uma coordenada que existe. O portão antigo (`precision ===
              'unknown'`) desabilitava Confirmar em silêncio — e como a migração
              da EXEC-T01 marcou todo ponto legado como `unknown`, o acervo
              inteiro do usuário caía no caminho que a própria tela indicava com
              `Confirmar no mapa`. O único motivo legítimo para o botão estar
              cinza é não haver coordenada, e agora ele diz isso.
            */}
            {!point && (
              <p className="t-foot ink-2" id="wv2-picker-why">{copy.confirmNeedsPoint}</p>
            )}
            <div className="wv2-picker-acts">
              <Pill onClick={onClose}>{copy.cancel}</Pill>
              <Pill
                primary
                aria-describedby={!point ? 'wv2-picker-why' : undefined}
                disabled={!point || !target}
                onClick={() => {
                  if (!point || !target) return
                  onConfirm({
                    place_id: existing?.place_id ?? null,
                    kind: target.kind,
                    name: finalName,
                    lat: point.lat,
                    lng: point.lng,
                    precision,
                    notes: notes.trim() || null,
                  })
                }}
              >
                {copy.confirm}
              </Pill>
            </div>
          </motion.section>

          <MapPointPicker
            open={onMap}
            pt={pt}
            start={point}
            fallback={fallback}
            onClose={() => setOnMap(false)}
            onPick={picked => {
              setPoint(picked)
              setAccuracy(null)
              setGeoError(null)
              /*
               * AUTHOR-T02: marcar no mapa declara a procedência, e declara a
               * VERDADEIRA. `address` — "endereço buscado" — e nunca `gps`, que
               * o `precisionLabel` renderiza como "marcado no local": quem
               * solta um pino do sofá não estava no local, e a carta do ponto
               * de encontro não pode afirmar que estava. É a mesma recusa da
               * §5.2 do spec, que existe para a família não concluir que dá
               * para ir a pé até onde não dá.
               */
              setPrecision('address')
              nameIfEmpty()
              setOnMap(false)
            }}
          />
        </>
      )}
    </AnimatePresence>
  )
}
