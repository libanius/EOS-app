'use client'

import { useEffect, useMemo, useState } from 'react'

interface FamilyMember {
  id: string
  name: string
  age: number | null
  medical_conditions: string[]
  medical_notes: string | null
  medications: string[]
  mobility_impaired: boolean
  is_infant: boolean
}

interface Ficha {
  name: string | null
  blood_type: string | null
  allergies: string[]
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  location: string | null
}

interface Gap { severity: 'high' | 'medium'; message: string }

interface Props {
  members: FamilyMember[]
}

export default function HouseholdHealthCard({ members }: Props) {
  const [ficha, setFicha] = useState<Ficha | null>(null)

  useEffect(() => {
    fetch('/api/profile/ficha')
      .then(r => r.ok ? r.json() : null)
      .then((d: { ficha?: Ficha } | null) => { if (d?.ficha) setFicha(d.ficha) })
      .catch(() => {})
  }, [])

  const stats = useMemo(() => ({
    total: members.length + 1,
    vulnerable: members.filter(m => m.is_infant || m.mobility_impaired).length,
    withConditions: members.filter(m => m.medical_conditions.length > 0).length,
    infants: members.filter(m => m.is_infant).length,
    mobilityImpaired: members.filter(m => m.mobility_impaired).length,
  }), [members])

  const gaps = useMemo<Gap[]>(() => {
    const list: Gap[] = []
    if (!ficha) return list

    if (!ficha.blood_type) {
      list.push({ severity: 'high', message: 'Tipo sanguíneo não informado no seu perfil (crítico em emergências médicas)' })
    }
    if (!ficha.emergency_contact_name) {
      list.push({ severity: 'high', message: 'Nenhum contato de emergência cadastrado no seu perfil' })
    }
    if (!ficha.location) {
      list.push({ severity: 'medium', message: 'Localização não definida — alertas locais indisponíveis' })
    }

    const membersWithConditionsNoMeds = members.filter(m => m.medical_conditions.length > 0 && m.medications.length === 0)
    if (membersWithConditionsNoMeds.length > 0) {
      list.push({ severity: 'medium', message: `${membersWithConditionsNoMeds.map(m => m.name).join(', ')}: condição médica sem medicamentos listados` })
    }

    const infantsNoNotes = members.filter(m => m.is_infant && !m.medical_notes?.trim())
    if (infantsNoNotes.length > 0) {
      list.push({ severity: 'medium', message: `${infantsNoNotes.map(m => m.name).join(', ')}: bebê sem anotações de cuidados especiais` })
    }

    return list
  }, [ficha, members])

  const highGaps = gaps.filter(g => g.severity === 'high')
  const medGaps = gaps.filter(g => g.severity === 'medium')

  return (
    <div style={{ border: '1px solid #222231', borderRadius: 12, padding: 18, marginBottom: 20, background: '#0a0a11' }}>
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#8a8a99', marginBottom: 12 }}>
        Saúde do Household
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Membros', value: stats.total },
          { label: 'Vulneráveis', value: stats.vulnerable, color: stats.vulnerable > 0 ? '#f59e0b' : undefined },
          { label: 'C/ Condições', value: stats.withConditions, color: stats.withConditions > 0 ? '#3b82f6' : undefined },
          { label: 'Bebês', value: stats.infants, color: stats.infants > 0 ? '#a78bfa' : undefined },
        ].map(s => (
          <div key={s.label} style={{ padding: '10px 12px', background: '#0f0f17', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace', color: s.color ?? '#e6e6eb' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Critical gaps */}
      {gaps.length === 0 && ficha !== null ? (
        <div style={{ fontSize: 13, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span> Nenhuma lacuna crítica detectada
        </div>
      ) : gaps.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, color: '#8a8a99', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Lacunas detectadas
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {[...highGaps, ...medGaps].map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: g.severity === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${g.severity === 'high' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 8 }}>
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{g.severity === 'high' ? '⚠' : '○'}</span>
                <span style={{ fontSize: 13, color: g.severity === 'high' ? '#fca5a5' : '#fcd34d', lineHeight: 1.4 }}>{g.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
