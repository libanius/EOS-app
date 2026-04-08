'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenarioType =
  | 'hurricane'
  | 'earthquake'
  | 'fallout'
  | 'pandemic'
  | 'fire'
  | 'flood'
  | 'general'

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
type Mode = 'CONNECTED' | 'LOCAL AI' | 'SURVIVAL'
type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

interface IntelligenceResponse {
  mode: 'CONNECTED' | 'LOCAL_AI' | 'SURVIVAL'
  priority: Priority
  risks: string[]
  immediate_actions: string[]
  short_term_actions: string[]
  mid_term_actions: string[]
  rulesApplied: string[]
  knowledgeSources: string[]
  raw_text?: string
  action_plan_id?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCENARIO_TYPES: { id: ScenarioType; label: string }[] = [
  { id: 'hurricane', label: 'Hurricane' },
  { id: 'earthquake', label: 'Earthquake' },
  { id: 'fallout', label: 'Fallout' },
  { id: 'pandemic', label: 'Pandemic' },
  { id: 'fire', label: 'Fire' },
  { id: 'flood', label: 'Flood' },
  { id: 'general', label: 'General' },
]

const LOADING_DOTS = [
  'Scanning threat vectors...',
  'Profiling family context...',
  'Cross-referencing protocols...',
  'Building action plan...',
]

const MODE_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  CONNECTED: {
    bg: 'rgba(0,229,160,0.12)',
    text: '#00e5a0',
    label: 'CONNECTED',
  },
  LOCAL_AI: {
    bg: 'rgba(255,185,60,0.12)',
    text: '#FFB347',
    label: 'LOCAL AI',
  },
  SURVIVAL: {
    bg: 'rgba(255,107,107,0.12)',
    text: '#ff6b6b',
    label: 'SURVIVAL',
  },
}

const PRIORITY_STYLES: Record<Priority, { color: string }> = {
  CRITICAL: { color: '#ff6b6b' },
  HIGH: { color: '#FFB347' },
  MEDIUM: { color: '#7c6bff' },
  LOW: { color: '#00e5a0' },
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useTypewriter(
  targetText: string,
  active: boolean,
  intervalMs = 12
): { displayed: string; done: boolean } {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) {
      setDisplayed('')
      setDone(false)
      indexRef.current = 0
      return
    }

    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      if (indexRef.current >= targetText.length) {
        clearInterval(timerRef.current!)
        setDone(true)
        return
      }
      const next = indexRef.current + 1
      setDisplayed(targetText.slice(0, next))
      indexRef.current = next
    }, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [targetText, active, intervalMs])

  return { displayed, done }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '32px 0' }}>
      {LOADING_DOTS.map((label, i) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: 0,
            animation: `eos-fade-in 0.3s ease forwards`,
            animationDelay: `${i * 0.3}s`,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--ac, #00e5a0)',
              flexShrink: 0,
              animation: `eos-blink 1.4s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
          <span
            style={{
              fontSize: 13,
              color: 'var(--mu, #6b6b8a)',
              fontFamily: 'inherit',
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

function StreamOutput({
  streamBuffer,
  response,
  status,
}: {
  streamBuffer: string
  response: IntelligenceResponse | null
  status: Status
}) {
  const displayText =
    status === 'done' && response
      ? formatResponse(response)
      : streamBuffer

  const { displayed, done: twDone } = useTypewriter(
    displayText,
    status === 'streaming' || status === 'done'
  )

  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    if (twDone) {
      const t = setTimeout(() => setShowCursor(false), 800)
      return () => clearTimeout(t)
    }
    setShowCursor(true)
  }, [twDone])

  return (
    <div
      style={{
        fontFamily:
          "ui-monospace, 'SF Mono', 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 1.7,
        color: 'var(--tx, #f0f0f8)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: 200,
      }}
    >
      {displayed}
      {showCursor && !twDone && (
        <span
          style={{
            color: 'var(--ac, #00e5a0)',
            animation: 'eos-cursor 1s step-end infinite',
          }}
        >
          ▋
        </span>
      )}
    </div>
  )
}

function formatResponse(r: IntelligenceResponse): string {
  const lines: string[] = []

  lines.push(`PRIORITY: ${r.priority}`)
  lines.push('')

  if (r.risks.length > 0) {
    lines.push('RISKS:')
    r.risks.forEach((risk) => lines.push(`· ${risk}`))
    lines.push('')
  }

  if (r.immediate_actions.length > 0) {
    lines.push('IMMEDIATE ACTIONS (15 min):')
    r.immediate_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
    lines.push('')
  }

  if (r.short_term_actions.length > 0) {
    lines.push('SHORT TERM (1 hour):')
    r.short_term_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
    lines.push('')
  }

  if (r.mid_term_actions.length > 0) {
    lines.push('MID TERM (3 hours):')
    r.mid_term_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
  }

  return lines.join('\n')
}

function ModeBadge({ mode }: { mode: string }) {
  const style = MODE_STYLES[mode] || MODE_STYLES.SURVIVAL
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: style.bg,
        color: style.text,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '1.2px',
        padding: '4px 10px',
        borderRadius: 20,
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: style.text,
          animation: 'eos-blink 1.4s ease-in-out infinite',
        }}
      />
      {style.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const { color } = PRIORITY_STYLES[priority] || PRIORITY_STYLES.LOW
  return (
    <span
      style={{
        display: 'inline-block',
        background: `${color}20`,
        color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '1.2px',
        padding: '4px 10px',
        borderRadius: 20,
        textTransform: 'uppercase',
        border: `1px solid ${color}40`,
      }}
    >
      {priority}
    </span>
  )
}

function CollapsibleRules({ rules }: { rules: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--mu, #6b6b8a)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.5px',
          padding: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            fontSize: 10,
          }}
        >
          ▶
        </span>
        Rules Applied ({rules.length})
      </button>

      {open && (
        <ul
          style={{
            listStyle: 'none',
            margin: '8px 0 0',
            padding: '0 0 0 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {rules.map((rule) => (
            <li
              key={rule}
              style={{
                fontSize: 11,
                color: 'var(--mu, #6b6b8a)',
                fontFamily: "ui-monospace, 'SF Mono', monospace",
              }}
            >
              · {rule}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ScenarioPage() {
  const [selectedType, setSelectedType] = useState<ScenarioType>('general')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [streamBuffer, setStreamBuffer] = useState('')
  const [response, setResponse] = useState<IntelligenceResponse | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleGenerate = useCallback(async () => {
    if (!description.trim() || status === 'loading' || status === 'streaming')
      return

    // Abort any previous request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setStatus('loading')
    setStreamBuffer('')
    setResponse(null)

    try {
      const authToken = typeof window !== 'undefined'
        ? localStorage.getItem('supabase_token') ?? ''
        : ''

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          scenario: description,
          scenarioType: selectedType,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream reader')

      const decoder = new TextDecoder()
      let buffer = ''

      setStatus('streaming')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)

          try {
            const parsed = JSON.parse(jsonStr)

            if (parsed.token !== undefined) {
              setStreamBuffer((prev) => prev + parsed.token)
            }

            if (parsed.done && parsed.response) {
              setResponse(parsed.response)
              setStatus('done')
            }
          } catch {
            // Partial JSON — continue
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return

      console.error('[EOS] Stream error:', err)
      showToast('Falha na conexão. Usando modo offline.')
      setStatus('error')

      // Show survival mode fallback
      setResponse({
        mode: 'SURVIVAL',
        priority: 'MEDIUM',
        risks: ['Conexão com servidor perdida'],
        immediate_actions: [
          'Avaliar recursos disponíveis localmente',
          'Manter comunicação com família',
        ],
        short_term_actions: [],
        mid_term_actions: [],
        rulesApplied: ['NETWORK_ERROR: fallback_to_survival'],
        knowledgeSources: ['Rules Engine (offline)'],
      })
    }
  }, [description, selectedType, status])

  const isLoading = status === 'loading'
  const isStreaming = status === 'streaming'
  const isActive = isLoading || isStreaming
  const hasResult = status === 'done' || status === 'error'
  const canSubmit = description.trim().length > 0 && !isActive

  return (
    <>
      {/* Global animation styles */}
      <style>{`
        @keyframes eos-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes eos-cursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes eos-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .eos-chip {
          padding: 7px 13px;
          border-radius: 20px;
          border: 1px solid var(--bd, #2a2a38);
          background: var(--sf2, #1c1c27);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          color: var(--tx, #f0f0f8);
          transition: all 0.15s;
          white-space: nowrap;
        }
        .eos-chip.on {
          background: var(--ac, #00e5a0);
          color: #0a0a0f;
          border-color: var(--ac, #00e5a0);
        }
        .eos-chip:active { opacity: 0.75; }
        .eos-textarea {
          width: 100%;
          background: var(--sf2, #1c1c27);
          border: 1px solid var(--bd, #2a2a38);
          border-radius: 10px;
          color: var(--tx, #f0f0f8);
          font-size: 14px;
          line-height: 1.6;
          padding: 12px;
          resize: vertical;
          min-height: 120px;
          font-family: inherit;
          transition: border-color 0.15s;
          outline: none;
          box-sizing: border-box;
        }
        .eos-textarea:focus {
          border-color: var(--ac, #00e5a0);
          box-shadow: 0 0 0 1px var(--ac, #00e5a0);
        }
        .eos-textarea::placeholder {
          color: var(--mu, #6b6b8a);
        }
        .btn {
          padding: 13px 18px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: opacity 0.15s;
          font-family: inherit;
        }
        .btn:active { opacity: 0.75; }
        .bp {
          background: var(--ac, #00e5a0);
          color: #0a0a0f;
        }
        .bp:disabled {
          background: var(--bd, #2a2a38);
          color: var(--mu, #6b6b8a);
          cursor: not-allowed;
          opacity: 1;
        }
        .bfull { width: 100%; display: block; }
        .card {
          background: var(--sf, #13131a);
          border: 1px solid var(--bd, #2a2a38);
          border-radius: 16px;
          padding: 16px;
        }
        .ct {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          color: var(--mu, #6b6b8a);
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        /* Toast */
        .eos-toast {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255,107,107,0.95);
          color: #fff;
          padding: 12px 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          z-index: 999;
          pointer-events: none;
          animation: eos-fade-in 0.3s ease;
          white-space: nowrap;
        }

        @media (max-width: 767px) {
          .eos-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Toast */}
      {toast && <div className="eos-toast">{toast}</div>}

      {/* Page */}
      <div
        style={{
          padding: '20px 16px 100px',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1.2px',
              color: 'var(--mu, #6b6b8a)',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Decision Engine
          </p>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--tx, #f0f0f8)',
              margin: 0,
            }}
          >
            Generate Action Plan
          </h1>
        </div>

        {/* Main Grid */}
        <div
          className="eos-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '380px 1fr',
            gap: 24,
            alignItems: 'start',
          }}
        >
          {/* ── LEFT: Configuration ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Scenario Type */}
            <div className="card">
              <div className="ct">Scenario Type</div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {SCENARIO_TYPES.map(({ id, label }) => (
                  <button
                    key={id}
                    className={`eos-chip${selectedType === id ? ' on' : ''}`}
                    onClick={() => setSelectedType(id)}
                    disabled={isActive}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scenario Description */}
            <div className="card">
              <div className="ct">Situation Description</div>
              <textarea
                className="eos-textarea"
                placeholder="Descreva sua situação atual — localização, ameaças imediatas, condições da família..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isActive}
              />
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--mu, #6b6b8a)',
                  margin: '8px 0 0',
                }}
              >
                {description.length}/2000 characters
              </p>
            </div>

            {/* Submit */}
            <button
              className="btn bp bfull"
              onClick={handleGenerate}
              disabled={!canSubmit}
            >
              {isLoading
                ? 'Analyzing...'
                : isStreaming
                ? 'Generating...'
                : 'Generate Action Plan'}
            </button>
          </div>

          {/* ── RIGHT: Output ── */}
          <div className="card" style={{ minHeight: 400 }}>
            {status === 'idle' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 320,
                  color: 'var(--mu, #6b6b8a)',
                  fontSize: 14,
                  textAlign: 'center',
                  padding: 32,
                }}
              >
                Configure o cenário e clique em Generate
              </div>
            )}

            {isLoading && <LoadingDots />}

            {(isStreaming || hasResult) && (
              <>
                <StreamOutput
                  streamBuffer={streamBuffer}
                  response={response}
                  status={status}
                />

                {/* Footer badges — shown when done */}
                {hasResult && response && (
                  <div
                    style={{
                      marginTop: 24,
                      paddingTop: 16,
                      borderTop: '1px solid var(--bd, #2a2a38)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {/* Mode + Priority */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <ModeBadge mode={response.mode} />
                      <PriorityBadge priority={response.priority} />
                    </div>

                    {/* Rules */}
                    {response.rulesApplied.length > 0 && (
                      <CollapsibleRules rules={response.rulesApplied} />
                    )}

                    {/* Knowledge sources */}
                    {response.knowledgeSources.length > 0 && (
                      <p
                        style={{
                          fontSize: 11,
                          color: 'var(--mu, #6b6b8a)',
                          margin: 0,
                        }}
                      >
                        Sources:{' '}
                        {response.knowledgeSources.join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
