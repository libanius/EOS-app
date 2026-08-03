'use client'

import { useLanguage } from '@/lib/i18n'
import { Card, PillLink, SectionLabel } from '@/components/world-v2/primitives'
import '@/components/world-v2/world-v2.css'

const COPY = {
  pt: {
    eyebrow: 'EOS · Comms',
    title: 'Comunicações',
    status: 'Nenhum canal ativo',
    statusBody: 'Use telefone, SMS ou rádio real conforme o plano da família. O EOS não afirma entrega quando nenhum canal está configurado.',
    family: 'Abrir família',
    plan: 'Plano da família',
    chat: 'Chat do círculo',
    chatBody: 'Não configurado',
    radio: 'Rádio amador',
    radioBody: 'Frequências locais não configuradas',
    mesh: 'Rede mesh',
    meshBody: 'Hardware não conectado',
    guardrail: 'Hardware LoRa/Mesh continua bloqueado por G-05.',
  },
  en: {
    eyebrow: 'EOS · Comms',
    title: 'Communications',
    status: 'No active channel',
    statusBody: 'Use phone, SMS, or real radio according to the family plan. EOS does not claim delivery when no channel is configured.',
    family: 'Open family',
    plan: 'Family plan',
    chat: 'Circle chat',
    chatBody: 'Not configured',
    radio: 'Amateur radio',
    radioBody: 'Local frequencies not configured',
    mesh: 'Mesh network',
    meshBody: 'Hardware not connected',
    guardrail: 'LoRa/Mesh hardware remains blocked by G-05.',
  },
} as const

export default function CommsPage() {
  const { language } = useLanguage()
  const c = COPY[language]

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="list-title">{c.title}</h1>
        </header>

        <Card accented>
          <SectionLabel>{c.status}</SectionLabel>
          <p className="t-body ink-2" style={{ margin: '0.75rem 0 1rem' }}>
            {c.statusBody}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <PillLink href="/family" primary>{c.family}</PillLink>
            <PillLink href="/plan">{c.plan}</PillLink>
          </div>
        </Card>

        <Card>
          <SectionLabel>01</SectionLabel>
          <h2 className="t-title2" style={{ margin: '0.5rem 0' }}>{c.chat}</h2>
          <p className="t-body ink-2" style={{ margin: 0 }}>{c.chatBody}</p>
        </Card>

        <Card>
          <SectionLabel>02</SectionLabel>
          <h2 className="t-title2" style={{ margin: '0.5rem 0' }}>{c.radio}</h2>
          <p className="t-body ink-2" style={{ margin: 0 }}>{c.radioBody}</p>
        </Card>

        <Card>
          <SectionLabel>03</SectionLabel>
          <h2 className="t-title2" style={{ margin: '0.5rem 0' }}>{c.mesh}</h2>
          <p className="t-body ink-2" style={{ margin: 0 }}>{c.meshBody}</p>
        </Card>

        <Card>
          <p className="t-body ink-2" style={{ margin: 0 }}>{c.guardrail}</p>
        </Card>
      </div>
    </div>
  )
}
