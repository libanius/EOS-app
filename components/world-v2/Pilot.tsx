'use client'

/**
 * Pilot — the EOS decision copilot, always one tap away.
 *
 * Two ideas drive the interaction:
 *
 *  1. THE ANSWER IS ALREADY THERE. Opening the Pilot never shows a spinner,
 *     because the answer is computed locally and synchronously from EOS data
 *     (see pilot-engine.ts). When things get bad the network is the first thing
 *     to fail, so a copilot that has to phone home is a copilot that is absent
 *     exactly when it is needed.
 *
 *  2. IT IS A SURFACE, NOT A PAGE. The console materialises from the orb —
 *     scale and blur animate together so it reads as glass arriving rather than
 *     a rectangle fading in — and dismisses back along the same path, into the
 *     same corner it came from.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FADE, SPRING, haptic } from './motion'
import {
  PILOT_INTENTS,
  askPilot,
  type PilotContext,
  type PilotIntentId,
  type PilotVerdict,
} from './pilot-engine'

const VERDICT_LABEL: Record<PilotVerdict, { pt: string; en: string }> = {
  ready: { pt: 'Tudo certo', en: 'All clear' },
  watch: { pt: 'Atenção', en: 'Watch' },
  hold: { pt: 'Prepare', en: 'Prepare' },
  act: { pt: 'Aja agora', en: 'Act now' },
}

export default function Pilot({ ctx }: { ctx: PilotContext }) {
  const { pt } = ctx
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [intent, setIntent] = useState<PilotIntentId>('now')
  const consoleRef = useRef<HTMLDivElement>(null)

  // Pure and cheap: recomputing on every data tick is what keeps the answer
  // honest as conditions change while the console is open.
  const answer = useMemo(() => askPilot(intent, ctx), [intent, ctx])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    consoleRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggle = () => {
    haptic.impact()
    // Every opening starts from "what do I do now" — the question that matters.
    if (!open) setIntent('now')
    setOpen(value => !value)
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            className="wv2-pilot-scrim"
            aria-label={pt ? 'Fechar o Pilot' : 'Close the Pilot'}
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={consoleRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Pilot"
            className="wv2-pilot-console wv2-fume"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: 'blur(16px)', y: 12 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, filter: 'blur(12px)', y: 10 }}
            transition={reduceMotion ? { duration: 0.12 } : SPRING.pop}
          >
            <div className="pilot-head">
              <span className="t-caps">Pilot</span>
              <span className="t-foot ink-3">
                {ctx.online
                  ? pt
                    ? 'pronto'
                    : 'ready'
                  : pt
                    ? 'offline · resposta local'
                    : 'offline · local answer'}
              </span>
            </div>

            <div className="pilot-body">
              {/* Keyed on the intent: a new question renders instantly and settles
                  in, instead of waiting for the previous answer to leave. */}
              <motion.div
                key={answer.intent}
                className="pilot-answer"
                data-verdict={answer.verdict}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : SPRING.quick}
              >
                <span className="pilot-verdict t-caps">
                  {VERDICT_LABEL[answer.verdict][pt ? 'pt' : 'en']}
                </span>
                <h2 className="t-title1 pilot-headline">{answer.headline}</h2>
                <p className="t-body ink-2">{answer.body}</p>

                {answer.factors.length > 0 && (
                  <div className="pilot-factors">
                    {answer.factors.map(factor => (
                      <div key={`${factor.label}-${factor.value}`} className="pilot-factor">
                        <span className="t-caps ink-3">{factor.label}</span>
                        <strong className="t-sub">{factor.value}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {answer.caveat && <p className="pilot-caveat t-foot">{answer.caveat}</p>}

                {answer.actions.length > 0 && (
                  <div className="pilot-actions">
                    {answer.actions.map(action => (
                      <Link
                        key={action.href + action.label}
                        href={action.href}
                        className={`wv2-pill${action.primary ? ' primary' : ''}`}
                        onClick={() => haptic.impact()}
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>

            <div className="pilot-intents" role="group" aria-label={pt ? 'Perguntas' : 'Questions'}>
              {PILOT_INTENTS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`pilot-chip${item.id === intent ? ' on' : ''}`}
                  aria-pressed={item.id === intent}
                  onClick={() => {
                    haptic.selection()
                    setIntent(item.id)
                  }}
                >
                  {pt ? item.pt : item.en}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className="wv2-pilot-orb wv2-fume"
        data-open={open}
        aria-expanded={open}
        aria-label={pt ? 'Abrir o Pilot, seu copiloto EOS' : 'Open the Pilot, your EOS copilot'}
        onClick={toggle}
      >
        {open ? <CloseIcon /> : <SparkIcon />}
      </button>
    </>
  )
}

function SparkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5C10.1 8 11.5 6.6 12 3Z"
        fill="currentColor"
      />
      <path
        d="M17.8 14.5c.28 2 1.05 2.77 3.05 3.05-2 .28-2.77 1.05-3.05 3.05-.28-2-1.05-2.77-3.05-3.05 2-.28 2.77-1.05 3.05-3.05Z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
