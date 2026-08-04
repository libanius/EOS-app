type ProfileFicha = {
  name?: string | null
  location?: string | null
  blood_type?: string | null
  allergies?: string[] | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  medical_notes?: string | null
  medications?: string[] | null
}

type FamilyMemberFicha = {
  name?: string | null
  age?: number | null
  medical_conditions?: string[] | null
  medical_notes?: string | null
  medications?: string[] | null
  mobility_impaired?: boolean | null
  is_infant?: boolean | null
}

const list = (items: string[] | null | undefined, empty: string) => {
  const clean = (items ?? []).map(item => item.trim()).filter(Boolean)
  return clean.length ? clean.join(', ') : empty
}

const text = (value: string | null | undefined, empty: string) => {
  const clean = value?.trim()
  return clean || empty
}

export function buildPilotFamilyRecord({
  profile,
  members,
  pt,
}: {
  profile: ProfileFicha | null
  members: FamilyMemberFicha[]
  pt: boolean
}) {
  const empty = pt ? 'não consta' : 'not recorded'
  const lines: string[] = []

  lines.push(pt ? 'FICHA MASTER DO USUÁRIO:' : 'USER MASTER RECORD:')
  lines.push(pt ? `- Nome: ${text(profile?.name, empty)}` : `- Name: ${text(profile?.name, empty)}`)
  lines.push(pt ? `- Local/endereço: ${text(profile?.location, empty)}` : `- Location/address: ${text(profile?.location, empty)}`)
  lines.push(pt ? `- Tipo sanguíneo: ${text(profile?.blood_type, empty)}` : `- Blood type: ${text(profile?.blood_type, empty)}`)
  lines.push(pt ? `- Alergias: ${list(profile?.allergies, empty)}` : `- Allergies: ${list(profile?.allergies, empty)}`)
  lines.push(pt ? `- Medicamentos: ${list(profile?.medications, empty)}` : `- Medications: ${list(profile?.medications, empty)}`)
  lines.push(pt ? `- Notas médicas: ${text(profile?.medical_notes, empty)}` : `- Medical notes: ${text(profile?.medical_notes, empty)}`)
  lines.push(
    pt
      ? `- Contato de emergência: ${text(profile?.emergency_contact_name, empty)} · ${text(profile?.emergency_contact_phone, empty)}`
      : `- Emergency contact: ${text(profile?.emergency_contact_name, empty)} · ${text(profile?.emergency_contact_phone, empty)}`,
  )

  lines.push('')
  lines.push(pt ? `MEMBROS CADASTRADOS (${members.length}):` : `REGISTERED FAMILY MEMBERS (${members.length}):`)
  if (!members.length) {
    lines.push(pt ? '- nenhum membro dependente cadastrado' : '- no dependent members recorded')
    return lines.join('\n')
  }

  members.forEach(member => {
    const flags = [
      member.is_infant ? (pt ? 'bebê' : 'infant') : '',
      member.mobility_impaired ? (pt ? 'mobilidade reduzida' : 'reduced mobility') : '',
    ].filter(Boolean)
    lines.push(
      pt
        ? `- ${text(member.name, empty)}: idade ${member.age ?? empty}; condições ${list(member.medical_conditions, empty)}; medicamentos ${list(member.medications, empty)}; notas ${text(member.medical_notes, empty)}${flags.length ? `; ${flags.join(', ')}` : ''}.`
        : `- ${text(member.name, empty)}: age ${member.age ?? empty}; conditions ${list(member.medical_conditions, empty)}; medications ${list(member.medications, empty)}; notes ${text(member.medical_notes, empty)}${flags.length ? `; ${flags.join(', ')}` : ''}.`,
    )
  })

  return lines.join('\n')
}
