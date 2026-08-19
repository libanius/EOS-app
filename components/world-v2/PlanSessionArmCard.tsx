'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/lib/i18n'
import { usePlanSession } from '@/components/PlanSessionProvider'
import { Card, Pill } from './primitives'
import type { PlanSummary } from '@/lib/family-plan'
import { haptic } from './motion'

type Member = { user_id: string; name: string; is_me: boolean }
type Dependent = { id: string; name: string; precisaDeAlguem: boolean }

type Props = {
  circleId: string | null
  plan: PlanSummary | null
  members: Member[]
  dependents: Dependent[]
  dirty: boolean
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function PlanSessionArmCard({ circleId, plan, members, dependents, dirty }: Props) {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const { session, arm } = usePlanSession()
  const me = members.find(member => member.is_me)?.user_id ?? members[0]?.user_id ?? ''
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()))
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 4 * 60 * 60_000)))
  const [presentMembers, setPresentMembers] = useState<string[]>(() => (me ? [me] : []))
  const [presentDependents, setPresentDependents] = useState<string[]>([])
  const [guardianByDependent, setGuardianByDependent] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const activeHere = session?.circleId === circleId && session.status === 'armed'
  const selectedPlan = useMemo(() => plan ? { ...plan } : null, [plan])

  const toggleMember = (id: string) => {
    setPresentMembers(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id])
  }

  const toggleDependent = (id: string) => {
    setPresentDependents(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id])
    setGuardianByDependent(current => ({ ...current, [id]: current[id] ?? presentMembers[0] ?? me }))
  }

  const submit = async () => {
    if (!circleId || !selectedPlan || dirty) return
    setBusy(true)
    setMessage(null)
    const result = await arm({
      circleId,
      planId: selectedPlan.id,
      name: selectedPlan.name,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      memberUserIds: presentMembers,
      dependents: presentDependents.map(memberId => ({
        memberId,
        guardianUserId: guardianByDependent[memberId] || presentMembers[0] || null,
      })),
    })
    setBusy(false)
    if (result.ok) {
      haptic.impact()
      setMessage(pt ? 'Sessão armada. A faixa permanente apareceu no topo.' : 'Session armed. The permanent banner is now at the top.')
    } else {
      setMessage(result.message ?? (pt ? 'Não foi possível armar.' : 'Could not arm.'))
    }
  }

  return (
    <Card className="wv2-plan-session-arm">
      <strong className="t-title2">{pt ? 'Sessão do dia' : 'Day session'}</strong>
      <p className="t-foot ink-3">
        {pt
          ? 'Arme só quando este plano é o provável agora. A sessão não muda a versão do plano.'
          : 'Arm only when this plan is likely now. The session does not change the plan version.'}
      </p>

      {activeHere ? (
        <p className="t-foot ok">{pt ? 'Este círculo já tem uma sessão armada.' : 'This circle already has an armed session.'}</p>
      ) : (
        <>
          <div className="wv2-plan-session-grid">
            <label>
              <span className="t-caps ink-3">{pt ? 'Início' : 'Start'}</span>
              <input className="wv2-input" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} />
            </label>
            <label>
              <span className="t-caps ink-3">{pt ? 'Fim' : 'End'}</span>
              <input className="wv2-input" type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} />
            </label>
          </div>

          <span className="t-caps ink-3">{pt ? 'Adultos presentes' : 'Adults present'}</span>
          <div className="wv2-plan-session-list">
            {members.map(member => (
              <label key={member.user_id} className="wv2-plan-check">
                <input
                  type="checkbox"
                  checked={presentMembers.includes(member.user_id)}
                  onChange={() => toggleMember(member.user_id)}
                />
                <span>{member.name}</span>
              </label>
            ))}
          </div>

          {dependents.length > 0 && (
            <>
              <span className="t-caps ink-3">{pt ? 'Dependentes presentes' : 'Dependents present'}</span>
              <div className="wv2-plan-session-list">
                {dependents.map(dependent => (
                  <label key={dependent.id} className="wv2-plan-check">
                    <input
                      type="checkbox"
                      checked={presentDependents.includes(dependent.id)}
                      onChange={() => toggleDependent(dependent.id)}
                    />
                    <span>{dependent.name}</span>
                    {presentDependents.includes(dependent.id) && (
                      <select
                        className="wv2-input"
                        value={guardianByDependent[dependent.id] ?? presentMembers[0] ?? ''}
                        onChange={event => setGuardianByDependent(current => ({ ...current, [dependent.id]: event.target.value }))}
                      >
                        {members.filter(member => presentMembers.includes(member.user_id)).map(member => (
                          <option key={member.user_id} value={member.user_id}>{member.name}</option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
              </div>
            </>
          )}

          {dirty && <p className="t-foot warn">{pt ? 'Salve o plano antes de armar a sessão.' : 'Save the plan before arming the session.'}</p>}
          {message && <p className={`t-foot ${message.includes('armada') || message.includes('armed') ? 'ok' : 'warn'}`} role="status">{message}</p>}
          <Pill primary wide onClick={submit} disabled={busy || dirty || !circleId || !selectedPlan || presentMembers.length === 0}>
            {busy ? (pt ? 'Armando…' : 'Arming…') : pt ? `Armar ${selectedPlan?.name ?? 'plano'}` : `Arm ${selectedPlan?.name ?? 'plan'}`}
          </Pill>
        </>
      )}
    </Card>
  )
}
