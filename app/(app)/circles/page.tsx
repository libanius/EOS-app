'use client'

import { useCallback, useEffect, useState } from 'react'

interface CircleRow {
  id: string
  name: string
  invite_code: string
  leader_id: string
  is_leader: boolean
  role: 'LEADER' | 'MEMBER'
  share_inventory: boolean
  pooled: {
    water_liters: number
    food_days: number
    medical_kit_count: number
    communication_device_count: number
    member_count: number
  } | null
  score: {
    total: number
    band: 'FRAGILE' | 'BASIC' | 'SOLID' | 'RESILIENT'
    breakdown: {
      water: number
      food: number
      medical: number
      comms: number
      size: number
    }
  }
}

const BAND_COLOR: Record<CircleRow['score']['band'], string> = {
  FRAGILE: '#ef4444',
  BASIC: '#f59e0b',
  SOLID: '#3b82f6',
  RESILIENT: '#22c55e',
}

export default function CirclesPage() {
  const [circles, setCircles] = useState<CircleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/circles', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Falha ao carregar')
      setCircles(j.circles ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = useCallback(async () => {
    if (!newName.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setNewName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setBusy(false)
    }
  }, [newName, load])

  const join = useCallback(async () => {
    if (joinCode.trim().length !== 6) return
    setBusy(true)
    try {
      const res = await fetch('/api/circles/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode.trim().toUpperCase() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setJoinCode('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setBusy(false)
    }
  }, [joinCode, load])

  const toggleShare = useCallback(
    async (id: string, next: boolean) => {
      setCircles((prev) =>
        prev.map((c) => (c.id === id ? { ...c, share_inventory: next } : c)),
      )
      try {
        await fetch(`/api/circles/${id}/share`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ share: next }),
        })
        await load()
      } catch {
        await load()
      }
    },
    [load],
  )

  const leave = useCallback(
    async (id: string) => {
      if (!confirm('Sair deste Circle?')) return
      setBusy(true)
      try {
        const res = await fetch(`/api/circles/${id}/leave`, {
          method: 'POST',
        })
        if (!res.ok) throw new Error((await res.json()).error)
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro')
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  return (
    <main
      style={{
        maxWidth: 920,
        margin: '0 auto',
        padding: '32px 20px',
        color: '#e6e6eb',
        fontFamily:
          'system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif',
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#8a8a99',
          }}
        >
          EOS · Social
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 600 }}>
          Circles
        </h1>
      </header>

      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      {/* Create / join */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            border: '1px solid #222231',
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, color: '#8a8a99', marginBottom: 8 }}>
            CRIAR CIRCLE
          </div>
          <input
            placeholder="Ex: Família Libânio"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#0f0f17',
              color: '#e6e6eb',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
              marginBottom: 8,
            }}
          />
          <button
            onClick={create}
            disabled={busy || !newName.trim()}
            style={{
              padding: '8px 14px',
              background: busy ? '#2a2a3a' : '#22c55e',
              color: '#0a0a0f',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Criar
          </button>
        </div>

        <div
          style={{
            border: '1px solid #222231',
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, color: '#8a8a99', marginBottom: 8 }}>
            ENTRAR COM CÓDIGO
          </div>
          <input
            placeholder="ABCDEF"
            value={joinCode}
            onChange={(e) =>
              setJoinCode(e.target.value.toUpperCase().slice(0, 6))
            }
            maxLength={6}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#0f0f17',
              color: '#e6e6eb',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
              marginBottom: 8,
              fontFamily: 'ui-monospace, Menlo, monospace',
              letterSpacing: 4,
              textTransform: 'uppercase',
            }}
          />
          <button
            onClick={join}
            disabled={busy || joinCode.length !== 6}
            style={{
              padding: '8px 14px',
              background: busy || joinCode.length !== 6 ? '#2a2a3a' : '#3b82f6',
              color: busy || joinCode.length !== 6 ? '#8a8a99' : '#0a0a0f',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: busy || joinCode.length !== 6 ? 'default' : 'pointer',
            }}
          >
            Entrar
          </button>
        </div>
      </section>

      {/* Circles list */}
      {loading ? (
        <div style={{ color: '#8a8a99' }}>carregando…</div>
      ) : circles.length === 0 ? (
        <div
          style={{
            color: '#8a8a99',
            textAlign: 'center',
            padding: 40,
            border: '1px dashed #222231',
            borderRadius: 10,
          }}
        >
          Você ainda não faz parte de nenhum Circle.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {circles.map((c) => (
            <article
              key={c.id}
              style={{
                border: '1px solid #222231',
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: '#8a8a99',
                    }}
                  >
                    {c.role}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontSize: 13,
                      color: '#8a8a99',
                      marginTop: 4,
                      letterSpacing: 2,
                    }}
                  >
                    invite · {c.invite_code}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 2,
                      color: BAND_COLOR[c.score.band],
                      fontWeight: 700,
                    }}
                  >
                    {c.score.band}
                  </div>
                  <div
                    style={{
                      fontSize: 34,
                      fontWeight: 700,
                      color: BAND_COLOR[c.score.band],
                      lineHeight: 1,
                      marginTop: 2,
                      fontFamily: 'ui-monospace, Menlo, monospace',
                    }}
                  >
                    {c.score.total}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#4a4a5a',
                      marginTop: 2,
                    }}
                  >
                    / 100
                  </div>
                </div>
              </div>

              {/* Score breakdown */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 8,
                  marginTop: 14,
                }}
              >
                {Object.entries(c.score.breakdown).map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      padding: 8,
                      border: '1px solid #1a1a24',
                      borderRadius: 6,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: '#8a8a99',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      {key}
                    </div>
                    <div
                      style={{
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pooled inventory */}
              {c.pooled && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    background: '#0f0f17',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#a5a5b5',
                    fontFamily: 'ui-monospace, Menlo, monospace',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 16,
                  }}
                >
                  <span>👥 {c.pooled.member_count} membros</span>
                  <span>💧 {Number(c.pooled.water_liters).toFixed(1)} L</span>
                  <span>🍲 {Number(c.pooled.food_days).toFixed(1)} dias</span>
                  <span>⛑ {c.pooled.medical_kit_count} kits</span>
                  <span>📻 {c.pooled.communication_device_count} comms</span>
                </div>
              )}

              {/* Controls */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 14,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: '#a5a5b5',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={c.share_inventory}
                    onChange={(e) => toggleShare(c.id, e.target.checked)}
                  />
                  Compartilhar meu inventário neste Circle
                </label>

                {!c.is_leader && (
                  <button
                    onClick={() => leave(c.id)}
                    disabled={busy}
                    style={{
                      padding: '6px 14px',
                      background: 'transparent',
                      color: '#ef4444',
                      border: '1px solid #ef4444',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Sair
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
