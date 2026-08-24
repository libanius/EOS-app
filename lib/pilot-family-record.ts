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
  /**
   * Tem conta no EOS? (D-134)
   *
   * A diferença muda a resposta: quem tem conta recebe alerta, aparece no mapa
   * e pode ter papel no plano; um dependente não faz nada disso sozinho — ele
   * depende de quem cuida dele. Sem esta marca o Pilot tratava os dois como a
   * mesma coisa e sugeria "avise a Paola" para alguém sem telefone.
   */
  has_account?: boolean | null
  /** Quem responde por esta pessoa, quando ela não tem conta. */
  cared_for_by?: string | null
}

export type CircleVisibleMemberRecord = {
  circleName: string
  name?: string | null
  role?: string | null
  isMe?: boolean | null
  familyAccessApproved?: boolean | null
  medicalShared: boolean
  contactShared: boolean
  locationShared: boolean
  location?: string | null
  blood_type?: string | null
  allergies?: string[] | null
  medications?: string[] | null
  medical_notes?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
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

  /*
   * O RÓTULO É O CONSERTO (D-134).
   *
   * Dizia "MEMBROS CADASTRADOS", que soa a lista de dependentes — e com todos os
   * campos em "não consta" o modelo lia aquilo como "quase não sei nada desta
   * família" e passava a hedgear sobre quem mora ali. A lista sempre foi a casa
   * inteira; faltava ela se apresentar como tal, e dizer quem tem conta.
   *
   * "Idade não consta" para um adulto com conta é normal, não é buraco: uma
   * conta informa a própria ficha, não a própria idade. Dizer isso evita que o
   * Pilot gaste a resposta pedindo um dado que ninguém devia preencher.
   */
  const comConta = members.filter(m => m.has_account).length
  const dependentes = members.length - comConta

  lines.push('')
  lines.push(
    pt
      ? `QUEM MORA NESTA CASA (${members.length}) — esta é a lista completa e confirmada; use-a como certa:`
      : `WHO LIVES IN THIS HOUSEHOLD (${members.length}) — this is the complete, confirmed list; treat it as certain:`,
  )
  if (!members.length) {
    lines.push(pt ? '- a casa ainda não foi montada' : '- the household has not been assembled yet')
    return lines.join('\n')
  }
  lines.push(
    pt
      ? `(${comConta} com conta no EOS — recebem alerta e aparecem no mapa; ${dependentes} sob cuidados, sem conta.)`
      : `(${comConta} with an EOS account — they get alerts and appear on the map; ${dependentes} dependants, no account.)`,
  )

  members.forEach(member => {
    const flags = [
      member.has_account
        ? (pt ? 'tem conta no EOS' : 'has an EOS account')
        : (pt
            ? `sob cuidados${member.cared_for_by ? ` de ${member.cared_for_by}` : ''}, sem conta`
            : `dependant${member.cared_for_by ? ` of ${member.cared_for_by}` : ''}, no account`),
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

export function buildPilotCircleRecord({
  members,
  pt,
}: {
  members: CircleVisibleMemberRecord[]
  pt: boolean
}) {
  const empty = pt ? 'não consta' : 'not recorded'
  const notShared = pt ? 'não compartilhado neste círculo' : 'not shared in this circle'
  const lines: string[] = []

  lines.push(pt ? `MEMBROS VISÍVEIS DO CÍRCULO (${members.length}):` : `VISIBLE CIRCLE MEMBERS (${members.length}):`)
  if (!members.length) {
    lines.push(pt ? '- nenhum membro de círculo visível' : '- no visible circle members')
    return lines.join('\n')
  }

  let currentCircle = ''
  for (const member of members) {
    const circleName = text(member.circleName, pt ? 'Círculo sem nome' : 'Unnamed circle')
    if (circleName !== currentCircle) {
      currentCircle = circleName
      lines.push('')
      lines.push(pt ? `CÍRCULO: ${circleName}` : `CIRCLE: ${circleName}`)
    }

    const name = text(member.name, empty)
    const role = text(member.role, empty)
    const self = member.isMe ? (pt ? ' · é o usuário' : ' · is the user') : ''
    const familyAccess = member.familyAccessApproved
      ? (pt ? ' · Família íntima aprovada' : ' · intimate family approved')
      : ''
    const medical = member.medicalShared
      ? pt
        ? `ficha médica: tipo sanguíneo ${text(member.blood_type, empty)}; alergias ${list(member.allergies, empty)}; medicamentos ${list(member.medications, empty)}; notas ${text(member.medical_notes, empty)}`
        : `medical record: blood type ${text(member.blood_type, empty)}; allergies ${list(member.allergies, empty)}; medications ${list(member.medications, empty)}; notes ${text(member.medical_notes, empty)}`
      : pt
        ? `ficha médica: ${notShared}`
        : `medical record: ${notShared}`
    const contact = member.contactShared
      ? pt
        ? `contato de emergência: ${text(member.emergency_contact_name, empty)} · ${text(member.emergency_contact_phone, empty)}`
        : `emergency contact: ${text(member.emergency_contact_name, empty)} · ${text(member.emergency_contact_phone, empty)}`
      : pt
        ? `contato de emergência: ${notShared}`
        : `emergency contact: ${notShared}`
    const location = member.locationShared
      ? pt
        ? `localização/endereço: ${text(member.location, empty)}`
        : `location/address: ${text(member.location, empty)}`
      : pt
        ? `localização/endereço: ${notShared}`
        : `location/address: ${notShared}`

    lines.push(`- ${name} (${role}${self}${familyAccess}): ${medical}; ${contact}; ${location}.`)
  }

  return lines.join('\n')
}
