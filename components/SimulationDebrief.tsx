'use client'

/**
 * SimulationDebrief — what the drill actually taught (doc 19 §8, SIM-T05).
 *
 * Shown when a drill is ENDED deliberately. Never after a real-alert abort: at
 * that moment a genuine threat owns the screen, and a training report would be
 * exactly the wrong thing to put in front of someone.
 *
 * Each gap that can be bought carries a one-tap "add to checklist". The tap is
 * required — same rule as the Pilot and D-067: nothing edits the family's plan
 * silently.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { useSimulation } from './SimulationProvider'
import { buildDebrief, type Debrief, type DebriefGap } from '@/lib/simulation-debrief'
import { simulationLabel } from '@/lib/simulation'

type Member = { age: number | null; medical_conditions: string[] | null; mobility_impaired: boolean | null; is_infant: boolean | null }

export default function SimulationDebrief() {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const reduceMotion = useReducedMotion()
  const { debriefFor, clearDebrief } = useSimulation()
  const [report, setReport] = useState<Debrief | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!debriefFor) {
      setReport(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const [inv, fam, chk] = await Promise.all([
        fetch('/api/inventory').catch(() => null),
        fetch('/api/family-members').catch(() => null),
        fetch('/api/checklist').catch(() => null),
      ])
      const inventory = inv?.ok ? (await inv.json().catch(() => null))?.inventory ?? null : null
      const roster = fam?.ok ? (await fam.json().catch(() => null))?.members : null
      const members: Member[] = Array.isArray(roster) ? roster : []
      const items: Array<{ acquired: boolean }> = chk?.ok ? (await chk.json().catch(() => null))?.items ?? [] : []
      if (cancelled) return

      setReport(
        buildDebrief({
          config: debriefFor,
          people: Math.max(1, members.length),
          hasInfants: members.some(m => m.is_infant === true || (typeof m.age === 'number' && m.age < 2)),
          hasMedicalConditions: members.some(m => Array.isArray(m.medical_conditions) && m.medical_conditions.length > 0),
          mobilityImpaired: members.filter(m => m.mobility_impaired === true).length,
          householdKnown: members.length > 0,
          checklistPct: items.length ? Math.round((items.filter(i => i.acquired).length / items.length) * 100) : 0,
          inventory,
          pt,
        }),
      )
    })()
    return () => { cancelled = true }
  }, [debriefFor, pt])

  const addTask = async (gap: DebriefGap) => {
    if (!gap.task) return
    setAdded(current => new Set(current).add(gap.id))
    await fetch('/api/checklist/save-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kitType: 'GERAL',
        items: [{ name: gap.task.name, tier: gap.task.tier, quantity: gap.task.quantity, unit: gap.task.unit }],
      }),
    }).catch(() => {
      setAdded(current => {
        const next = new Set(current)
        next.delete(gap.id)
        return next
      })
    })
  }

  const verdictCopy = {
    held: pt ? 'A casa aguentou' : 'The household held',
    tight: pt ? 'Aguentou no limite' : 'It held, barely',
    failed: pt ? 'A casa não aguentaria' : 'The household would not have held',
  }

  return (
    <AnimatePresence>
      {debriefFor && report && (
        <motion.div
          className="sim-invite-scrim"
          role="dialog"
          aria-modal="true"
          aria-label={pt ? 'Debrief do treino' : 'Drill debrief'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="sim-debrief"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 14 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', bounce: 0.2, duration: 0.4 }}
          >
            <span className="tag">{pt ? 'Debrief' : 'Debrief'}</span>
            <h2 data-verdict={report.verdict}>{verdictCopy[report.verdict]}</h2>
            <p className="scenario">{simulationLabel(debriefFor, pt)}</p>

            <div className="numbers">
              <div>
                <span>{pt ? 'O cenário exigia' : 'The scenario demanded'}</span>
                <strong>{report.requiredDays} {pt ? 'dias' : 'days'}</strong>
              </div>
              <div>
                <span>{pt ? 'Vocês tinham' : 'You had'}</span>
                <strong>{report.survivedDays.toFixed(1)} {pt ? 'dias' : 'days'}</strong>
              </div>
            </div>

            <div className="gaps">
              {report.gaps.length === 0 ? (
                <p className="none">
                  {pt ? 'Nenhuma lacuna encontrada neste cenário.' : 'No gaps found in this scenario.'}
                </p>
              ) : (
                report.gaps.map(gap => (
                  <div key={gap.id} className="gap" data-severity={gap.severity}>
                    <strong>{gap.title}</strong>
                    <p>{gap.detail}</p>
                    {gap.task && (
                      <button
                        type="button"
                        disabled={added.has(gap.id)}
                        onClick={() => addTask(gap)}
                      >
                        {added.has(gap.id)
                          ? (pt ? 'No checklist' : 'On checklist')
                          : (pt ? 'Adicionar ao checklist' : 'Add to checklist')}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <button type="button" className="close" onClick={clearDebrief}>
              {pt ? 'Fechar' : 'Close'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
