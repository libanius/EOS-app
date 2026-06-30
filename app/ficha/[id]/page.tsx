import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'

type Props = { params: Promise<{ id: string }> }

async function getFicha(id: string) {
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await service
    .from('profiles')
    .select('id, name, blood_type, allergies, emergency_contact_name, emergency_contact_phone, medical_notes, medications')
    .eq('id', id)
    .single()
  return data
}

export default async function FichaPublicaPage({ params }: Props) {
  const { id } = await params
  const isPt = (await cookies()).get('eos-language')?.value !== 'en'
  const ficha = await getFicha(id)
  if (!ficha) notFound()

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{isPt ? 'Ficha de Emergência' : 'Emergency Card'} — {ficha.name}</title>
        <meta name="robots" content="noindex" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0a0a0a; color: #e8e8e8; font-family: system-ui, sans-serif; min-height: 100vh; padding: 24px 16px 48px; }
          .card { max-width: 480px; margin: 0 auto; background: #141414; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; overflow: hidden; }
          .header { background: #e8410d; padding: 20px 24px; }
          .sos { font-size: 11px; font-weight: 800; letter-spacing: 2px; color: rgba(255,255,255,0.7); }
          .name { font-size: 28px; font-weight: 800; color: #fff; margin-top: 4px; line-height: 1.1; }
          .body { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
          .row { display: flex; gap: 16px; }
          .field { flex: 1; }
          .label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #727272; margin-bottom: 6px; }
          .value { font-size: 16px; font-weight: 600; color: #e8e8e8; }
          .blood { font-size: 32px; font-weight: 900; color: #e8410d; }
          .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); font-size: 13px; color: #d0d0d0; margin: 3px 3px 0 0; }
          .warn { background: rgba(232,65,13,0.12); border-color: rgba(232,65,13,0.3); color: #e8410d; }
          .divider { height: 1px; background: rgba(255,255,255,0.07); }
          .contact { background: rgba(13,232,100,0.06); border: 1px solid rgba(13,232,100,0.2); border-radius: 14px; padding: 16px; }
          .contact .label { color: #0de864; }
          .contact .value { color: #0de864; font-size: 18px; }
          .footer { text-align: center; padding: 16px; font-size: 11px; color: #3a3a3a; letter-spacing: 0.5px; }
          .eos-badge { font-size: 10px; color: #404040; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="header">
            <div className="sos">⚠ {isPt ? 'FICHA DE EMERGÊNCIA' : 'EMERGENCY CARD'} — EOS</div>
            <div className="name">{ficha.name}</div>
          </div>

          <div className="body">
            {/* Tipo sanguíneo */}
            <div className="row">
              <div className="field">
                <div className="label">{isPt ? 'Tipo Sanguíneo' : 'Blood Type'}</div>
                {ficha.blood_type
                  ? <div className="blood">{ficha.blood_type}</div>
                  : <div className="value" style={{color:'#444'}}>{isPt ? 'Não informado' : 'Not provided'}</div>}
              </div>
            </div>

            {/* Alergias */}
            {(ficha.allergies ?? []).length > 0 && (
              <div>
                <div className="label">⚠ {isPt ? 'Alergias' : 'Allergies'}</div>
                <div>{(ficha.allergies as string[]).map((a: string) => (
                  <span key={a} className="pill warn">{a}</span>
                ))}</div>
              </div>
            )}

            {/* Condições médicas */}
            {ficha.medical_notes && (
              <div>
                <div className="label">{isPt ? 'Condições Médicas' : 'Medical Conditions'}</div>
                <div className="value" style={{fontSize:14, lineHeight:1.5, color:'#c0c0c0'}}>{ficha.medical_notes}</div>
              </div>
            )}

            {/* Medicamentos */}
            {(ficha.medications ?? []).length > 0 && (
              <div>
                <div className="label">💊 {isPt ? 'Medicamentos em uso' : 'Current medications'}</div>
                <div>{(ficha.medications as string[]).map((m: string) => (
                  <span key={m} className="pill">{m}</span>
                ))}</div>
              </div>
            )}

            <div className="divider" />

            {/* Contato de emergência */}
            {(ficha.emergency_contact_name || ficha.emergency_contact_phone) && (
              <div className="contact">
                <div className="label">{isPt ? 'Contato de Emergência' : 'Emergency Contact'}</div>
                {ficha.emergency_contact_name && (
                  <div className="value">{ficha.emergency_contact_name}</div>
                )}
                {ficha.emergency_contact_phone && (
                  <a href={`tel:${ficha.emergency_contact_phone}`} style={{display:'block', marginTop:4}}>
                    <div className="value" style={{fontSize:22}}>{ficha.emergency_contact_phone}</div>
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="footer">
            {isPt
              ? 'Esta ficha foi gerada pelo portador e é para uso de emergência.'
              : 'This card was generated by its owner for emergency use.'}
            <div className="eos-badge">EOS — Emergency Operations System</div>
          </div>
        </div>
      </body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
