'use client'

/**
 * Família — reconstruída no design system da v2 (D-082).
 *
 * A aba antiga era um CADASTRO: formulários, tags, upload de ficha. Todos os
 * dados certos, e nenhuma pergunta respondida. O dono disse que ela parecia
 * "sobrando", e estava certo — cadastrar não é uma função de emergência.
 *
 * Esta tela responde três perguntas, nesta ordem:
 *
 *   1. ONDE ESTÁ CADA UM, e há quanto tempo isso é verdade
 *   2. O QUE CADA UM PRECISA que muda a decisão (remédio, mobilidade, bebê)
 *   3. QUEM FAZ O QUÊ quando o plano começar
 *
 * A ideia estrutural é que **cada pessoa é UMA linha**, não três. Antes, a mesma
 * pessoa aparecia como registro no roster, como membro do círculo e como papel
 * no plano — três lugares, nenhum deles completo. Aqui os três são costurados
 * pelo `linked_user_id`, e o que falta é dito na cara: quem não tem conta não
 * aparece no mapa, e a tela explica por quê em vez de omitir a pessoa.
 *
 * O cadastro continua existindo em `/family/cadastro`. Ele não foi jogado fora
 * — só deixou de ser a primeira coisa que a família vê. (Até o D-122 ele vivia
 * em `/family-legacy` e era uma tela de outro app; agora é a mesma linguagem.)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'
import { distanceKm } from '@/lib/world/shelters'
import { formatDistance, walkingMinutes, directionsUrl } from '@/lib/world/navigation'
import { PING_PRESETS, type PingPreset } from '@/lib/family-ping'
import InviteShare from '@/components/InviteShare'
import { Card, Pill, SectionLabel } from './primitives'
import { haptic } from './motion'
import './world-v2.css'

type RosterMember = {
  id: string
  name: string
  age: number | null
  medical_conditions: string[]
  medications: string[]
  mobility_impaired: boolean
  is_infant: boolean
  linked_user_id: string | null
}

type CircleMember = {
  user_id: string
  name: string
  is_me: boolean
  location_lat: number | null
  location_lng: number | null
  location_source: 'live' | 'profile' | null
  location_at: string | null
  avatar_url: string | null
}

/** Uma pessoa, costurada das três fontes. */
type Person = {
  key: string
  name: string
  isMe: boolean
  /** Conta no EOS — sem ela não há posição nem mensagem possível. */
  userId: string | null
  lat: number | null
  lng: number | null
  source: 'live' | 'profile' | null
  at: string | null
  avatarUrl: string | null
  age: number | null
  medications: string[]
  conditions: string[]
  mobilityImpaired: boolean
  isInfant: boolean
  /** O que essa pessoa faz quando o plano começa. */
  role: string | null
}

const COPY = {
  pt: {
    eyebrow: 'Família',
    lead: 'Onde está cada um, o que cada um precisa, e quem faz o quê.',
    people: 'pessoas',
    locatable: 'localizáveis agora',
    autonomy: 'Autonomia da casa',
    days: 'dias',
    now: 'agora',
    profileOnly: 'endereço do perfil, não posição atual',
    noAccount: 'Sem conta no EOS',
    noAccountWhy: 'Não aparece no mapa e não recebe mensagem. Convide para o círculo para mudar isso.',
    noLocation: 'Não está compartilhando posição',
    noLocationWhy: 'Ela precisa ligar o compartilhamento em Círculos, no aparelho dela.',
    away: 'de você',
    onFoot: 'a pé',
    needs: 'O que muda a decisão',
    noNeeds: 'Ninguém com necessidade registrada que altere o plano.',
    medication: 'Medicação contínua',
    mobility: 'Não se desloca sozinho',
    infant: 'Bebê em casa',
    condition: 'Condição médica',
    roleTitle: 'No plano',
    noRole: 'Sem papel no plano',
    noRoleWhy: 'Um plano sem papéis não diz quem busca quem — e é isso que se executa sem discutir.',
    openPlan: 'Abrir o plano',
    route: 'Rota até',
    message: 'Mensagem',
    sent: 'Enviado',
    failed: 'Não entregou',
    noDevice: 'Ela ainda não ativou os alertas no aparelho.',
    manage: 'Editar cadastro',
    empty: 'Ninguém cadastrado ainda.',
    emptyWhy: 'O EOS calcula água, comida e rotas por PESSOA. Sem saber quem mora aqui, todas as contas ficam erradas.',
    add: 'Cadastrar a família',
    inviteCircle: 'Convidar para o círculo',
    someoneMissing: 'Alguém da sua casa está fora do EOS',
    someoneMissingWhy: 'Quem não tem conta não aparece no mapa e não recebe mensagem. Mande o link — a pessoa entra sem digitar código nenhum.',
    loadError: 'Não foi possível carregar.',
    retry: 'Tentar de novo',
  },
  en: {
    eyebrow: 'Family',
    lead: 'Where everyone is, what each person needs, and who does what.',
    people: 'people',
    locatable: 'locatable now',
    autonomy: 'Household autonomy',
    days: 'days',
    now: 'now',
    profileOnly: 'profile address, not a current position',
    noAccount: 'No EOS account',
    noAccountWhy: 'Does not appear on the map and cannot receive a message. Invite them to the circle to change that.',
    noLocation: 'Not sharing a position',
    noLocationWhy: 'They need to turn sharing on in Circles, on their own device.',
    away: 'from you',
    onFoot: 'on foot',
    needs: 'What changes the decision',
    noNeeds: 'Nobody with a recorded need that alters the plan.',
    medication: 'Ongoing medication',
    mobility: 'Cannot move unaided',
    infant: 'Infant at home',
    condition: 'Medical condition',
    roleTitle: 'In the plan',
    noRole: 'No role in the plan',
    noRoleWhy: 'A plan without roles does not say who collects whom — and that is what gets executed without debate.',
    openPlan: 'Open the plan',
    route: 'Route to',
    message: 'Message',
    sent: 'Sent',
    failed: 'Not delivered',
    noDevice: 'They have not enabled alerts on their device yet.',
    manage: 'Edit records',
    empty: 'Nobody recorded yet.',
    emptyWhy: 'EOS computes water, food and routes PER PERSON. Without knowing who lives here, every number is wrong.',
    add: 'Record the family',
    inviteCircle: 'Invite to the circle',
    someoneMissing: 'Someone in your household is outside EOS',
    someoneMissingWhy: 'Without an account they do not appear on the map and cannot receive a message. Send the link — no code to type.',
    loadError: 'Could not load.',
    retry: 'Try again',
  },
} as const

const PRESETS: PingPreset[] = ['where', 'ok', 'on_my_way', 'come_home']

function freshness(at: string | null, source: string | null, pt: boolean): string {
  if (source === 'profile') return pt ? 'perfil' : 'profile'
  if (!at) return pt ? 'agora' : 'now'
  const seconds = Math.floor((Date.now() - Date.parse(at)) / 1000)
  if (!Number.isFinite(seconds) || seconds < 75) return pt ? 'agora' : 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return pt ? `há ${minutes} min` : `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return pt ? `há ${hours} h` : `${hours} h ago`
  return pt ? `há ${Math.floor(hours / 24)} d` : `${Math.floor(hours / 24)} d ago`
}

export default function FamilyPage() {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const c = COPY[language]

  const [roster, setRoster] = useState<RosterMember[]>([])
  const [circle, setCircle] = useState<CircleMember[]>([])
  const [roles, setRoles] = useState<Array<{ member_user_id: string; responsibility: string }>>([])
  const [autonomy, setAutonomy] = useState<number | null>(null)
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null)
  /** O círculo desta casa — é dele que sai o link de convite (D-112). */
  const [circleInfo, setCircleInfo] = useState<{ id: string; name: string; inviteCode: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [sent, setSent] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fam, circles, inv] = await Promise.all([
        fetch('/api/family-members').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/circles').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/inventory').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])

      setRoster(Array.isArray(fam?.members) ? fam.members : [])

      const seen = new Map<string, CircleMember>()
      const firstCircle = circles?.circles?.[0]
      if (firstCircle?.invite_code) {
        setCircleInfo({ id: firstCircle.id, name: firstCircle.name, inviteCode: firstCircle.invite_code })
      }
      for (const circ of circles?.circles ?? []) {
        for (const m of circ.members ?? []) seen.set(m.user_id, m)
      }
      setCircle(Array.from(seen.values()))

      // Papéis vêm do plano do círculo: "quem busca quem" é decisão combinada,
      // não atributo de cadastro.
      if (firstCircle?.id) {
        const plan = await fetch(`/api/plans?circleId=${firstCircle.id}`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
        setRoles(plan?.roles ?? [])
      }

      const people = Math.max(1, (Array.isArray(fam?.members) ? fam.members.length : 0) || 1)
      const i = inv?.inventory
      setAutonomy(
        i ? Math.min(i.water_liters / (3 * people), i.food_days) : null,
      )
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      p => setMyCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
    )
  }, [])

  /**
   * Costura as três fontes numa pessoa só.
   *
   * `linked_user_id` é a junção entre o cadastro e a conta. Quem tem conta e não
   * está no cadastro entra do mesmo jeito — a família real é a união dos dois, e
   * esconder alguém porque falta um registro seria a tela mentindo por omissão.
   */
  const people: Person[] = useMemo(() => {
    const byUser = new Map(circle.map(m => [m.user_id, m]))
    const roleByUser = new Map(roles.map(r => [r.member_user_id, r.responsibility]))
    const used = new Set<string>()

    const fromRoster: Person[] = roster.map(r => {
      const account = r.linked_user_id ? byUser.get(r.linked_user_id) ?? null : null
      if (account) used.add(account.user_id)
      return {
        key: `r:${r.id}`,
        name: r.name,
        isMe: account?.is_me ?? false,
        userId: account?.user_id ?? null,
        lat: account?.location_lat ?? null,
        lng: account?.location_lng ?? null,
        source: account?.location_source ?? null,
        at: account?.location_at ?? null,
        avatarUrl: account?.avatar_url ?? null,
        age: r.age,
        medications: r.medications ?? [],
        conditions: r.medical_conditions ?? [],
        mobilityImpaired: Boolean(r.mobility_impaired),
        isInfant: Boolean(r.is_infant),
        role: account ? roleByUser.get(account.user_id) ?? null : null,
      }
    })

    const onlyAccount: Person[] = circle
      .filter(m => !used.has(m.user_id))
      .map(m => ({
        key: `c:${m.user_id}`,
        name: m.is_me ? (pt ? 'Você' : 'You') : m.name,
        isMe: m.is_me,
        userId: m.user_id,
        lat: m.location_lat,
        lng: m.location_lng,
        source: m.location_source,
        at: m.location_at,
        avatarUrl: m.avatar_url,
        age: null,
        medications: [],
        conditions: [],
        mobilityImpaired: false,
        isInfant: false,
        role: roleByUser.get(m.user_id) ?? null,
      }))

    // Quem está localizável primeiro: numa emergência é o que se procura.
    return [...fromRoster, ...onlyAccount].sort((a, b) => {
      const rank = (p: Person) => (p.source === 'live' ? 0 : p.lat !== null ? 1 : p.userId ? 2 : 3)
      return rank(a) - rank(b)
    })
  }, [roster, circle, roles, pt])

  const locatable = people.filter(p => p.lat !== null).length

  const ping = async (person: Person, preset: PingPreset) => {
    if (!person.userId) return
    haptic.impact()
    const response = await fetch('/api/family/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: person.userId, preset, pt }),
    }).then(r => r.json()).catch(() => null)

    setSent(current => ({
      ...current,
      [person.key]: response?.ok ? c.sent : response?.reason === 'no_device' ? c.noDevice : c.failed,
    }))
  }

  return (
    <main className="wv2 wv2-family-page">
      <div className="family-scroll">
        <header className="family-head">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="family-title">{c.lead}</h1>
          <div className="family-meta">
            <span className="t-foot ink-2">{people.length} {c.people}</span>
            <span className="t-foot ink-3">·</span>
            <span className="t-foot ink-2">{locatable} {c.locatable}</span>
            {autonomy !== null && (
              <>
                <span className="t-foot ink-3">·</span>
                <span className="t-foot ink-2">{c.autonomy} {autonomy.toFixed(1)} {c.days}</span>
              </>
            )}
          </div>
        </header>

        {loading ? (
          <Card><p className="t-body ink-2">…</p></Card>
        ) : failed ? (
          <Card>
            <p className="t-body">{c.loadError}</p>
            <Pill onClick={load}>{c.retry}</Pill>
          </Card>
        ) : people.length === 0 ? (
          <Card accented>
            <strong className="t-title2">{c.empty}</strong>
            <p className="t-body ink-2">{c.emptyWhy}</p>
            <Link className="wv2-pill primary" href="/family/cadastro">{c.add}</Link>
          </Card>
        ) : (
          <>
            {people.map(person => {
              const km = myCoords && person.lat !== null && person.lng !== null
                ? distanceKm(myCoords, { lat: person.lat, lng: person.lng })
                : null
              const needs = [
                person.medications.length ? c.medication : null,
                person.mobilityImpaired ? c.mobility : null,
                person.isInfant ? c.infant : null,
                person.conditions.length ? c.condition : null,
              ].filter(Boolean) as string[]

              return (
                <Card key={person.key} className="family-person">
                  <div className="who">
                    <span className="face" aria-hidden="true">
                      {person.avatarUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={person.avatarUrl} alt="" />
                        : person.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="id">
                      <strong className="t-title2">{person.name}</strong>
                      {/* Onde está — e há quanto tempo isso é verdade. Um ponto
                          velho apresentado como atual é pior que ponto nenhum. */}
                      {person.lat !== null ? (
                        <em className="t-foot ink-2">
                          {freshness(person.at, person.source, pt)}
                          {person.source === 'profile' && ` · ${c.profileOnly}`}
                          {km !== null && ` · ${formatDistance(km, pt)} ${c.away}`}
                          {km !== null && km <= 12 && ` · ~${walkingMinutes(km)} min ${c.onFoot}`}
                        </em>
                      ) : person.userId ? (
                        <em className="t-foot warn">{c.noLocation}</em>
                      ) : (
                        <em className="t-foot warn">{c.noAccount}</em>
                      )}
                    </div>
                  </div>

                  {/* O motivo de não estar no mapa, dito na cara. Omitir a pessoa
                      faria a família achar que ela está coberta. */}
                  {person.lat === null && (
                    <p className="t-foot ink-3">{person.userId ? c.noLocationWhy : c.noAccountWhy}</p>
                  )}

                  {needs.length > 0 && (
                    <div className="chips">
                      {needs.map(n => <span key={n} className="wv2-chip on">{n}</span>)}
                    </div>
                  )}

                  <p className="t-foot ink-3 role">
                    <b className="t-caps ink-3">{c.roleTitle}</b>{' '}
                    {person.role ?? c.noRole}
                  </p>

                  {(person.lat !== null || person.userId) && !person.isMe && (
                    <div className="acts">
                      {person.lat !== null && person.lng !== null && (
                        <a
                          className="wv2-pill"
                          href={directionsUrl({ lat: person.lat, lng: person.lng }, person.name)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {c.route} {person.name.split(' ')[0]}
                        </a>
                      )}
                      {person.userId && PRESETS.map(preset => (
                        <Pill key={preset} onClick={() => ping(person, preset)}>
                          {PING_PRESETS[preset][pt ? 'pt' : 'en']}
                        </Pill>
                      ))}
                    </div>
                  )}
                  {sent[person.key] && (
                    <p className={`t-foot ${sent[person.key] === c.sent ? 'ok' : 'warn'}`} role="status">
                      {sent[person.key]}
                    </p>
                  )}
                </Card>
              )
            })}

            {/*
              O convite mora aqui, e não só em Círculos, porque é NESTA tela que
              a ausência aparece: a pessoa lê "sem conta no EOS · não aparece no
              mapa" e a ação de resolver isso precisa estar do lado da frase.
            */}
            {circleInfo && people.some(p => !p.userId) && (
              <Card accented className="family-invite">
                <strong className="t-sub">{c.someoneMissing}</strong>
                <p className="t-foot ink-2">{c.someoneMissingWhy}</p>
                <InviteShare
                  circleId={circleInfo.id}
                  circleName={circleInfo.name}
                  inviteCode={circleInfo.inviteCode}
                  pt={pt}
                />
              </Card>
            )}

            {!roles.length && (
              <Card className="wv2-plan-note gaps">
                <strong className="t-sub">{c.noRole}</strong>
                <p className="t-foot ink-2">{c.noRoleWhy}</p>
                <Link className="wv2-pill" href="/plan">{c.openPlan}</Link>
              </Card>
            )}

            <SectionLabel>{c.needs}</SectionLabel>
            <Card>
              {people.some(p => p.medications.length || p.mobilityImpaired || p.isInfant || p.conditions.length) ? (
                <ul className="family-needs">
                  {people.flatMap(p => [
                    ...p.medications.map(m => (
                      <li key={`${p.key}-med-${m}`} className="t-body">
                        <b>{p.name}</b> · {m}
                      </li>
                    )),
                    p.mobilityImpaired ? <li key={`${p.key}-mob`} className="t-body"><b>{p.name}</b> · {c.mobility}</li> : null,
                    p.isInfant ? <li key={`${p.key}-inf`} className="t-body"><b>{p.name}</b> · {c.infant}</li> : null,
                  ].filter(Boolean))}
                </ul>
              ) : (
                <p className="t-foot ink-3">{c.noNeeds}</p>
              )}
            </Card>

            <div className="family-foot">
              {circleInfo && (
                <InviteShare
                  circleId={circleInfo.id}
                  circleName={circleInfo.name}
                  inviteCode={circleInfo.inviteCode}
                  pt={pt}
                />
              )}
              <Link className="wv2-pill" href="/family/cadastro">{c.manage}</Link>
              <Link className="wv2-pill" href="/circles">{c.inviteCircle}</Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
