import { buildPilotCircleRecord, buildPilotFamilyRecord } from '../pilot-family-record'

describe('pilot family record', () => {
  it('formats master ficha and dependent member details for the Pilot', () => {
    const record = buildPilotFamilyRecord({
      pt: true,
      profile: {
        name: 'Paulo',
        location: 'Parkland, FL',
        blood_type: 'O+',
        allergies: ['penicilina'],
        medications: ['insulina'],
        medical_notes: 'Diabetes tipo 1',
        emergency_contact_name: 'Ana',
        emergency_contact_phone: '+1 555',
      },
      members: [
        {
          name: 'Isadora',
          age: 8,
          medical_conditions: ['asma'],
          medications: ['inalador'],
          medical_notes: 'Evitar fumaça',
          mobility_impaired: false,
          is_infant: false,
        },
      ],
    })

    expect(record).toContain('Tipo sanguíneo: O+')
    expect(record).toContain('Alergias: penicilina')
    expect(record).toContain('Medicamentos: insulina')
    expect(record).toContain('Isadora')
    expect(record).toContain('asma')
    expect(record).toContain('inalador')
  })

  it('does not hide missing medical fields', () => {
    const record = buildPilotFamilyRecord({ pt: true, profile: null, members: [] })
    expect(record).toContain('Nome: não consta')
    expect(record).toContain('nenhum membro dependente cadastrado')
  })

  it('formats circle member fichas that are shared with the Pilot', () => {
    const record = buildPilotCircleRecord({
      pt: true,
      members: [
        {
          circleName: 'Família',
          name: 'Daniela Oliveira',
          role: 'Editor',
          medicalShared: true,
          contactShared: true,
          locationShared: true,
          location: 'Parkland, FL',
          blood_type: 'A+',
          allergies: ['amendoim'],
          medications: ['EpiPen'],
          medical_notes: 'Carrega medicação na bolsa',
          emergency_contact_name: 'Paulo',
          emergency_contact_phone: '+1 555',
        },
      ],
    })

    expect(record).toContain('Daniela Oliveira')
    expect(record).toContain('tipo sanguíneo A+')
    expect(record).toContain('amendoim')
    expect(record).toContain('EpiPen')
    expect(record).toContain('Paulo · +1 555')
  })

  it('keeps unshared circle fields explicit instead of treating the member as missing', () => {
    const record = buildPilotCircleRecord({
      pt: true,
      members: [
        {
          circleName: 'Família',
          name: 'Daniela Oliveira',
          role: 'Viewer',
          medicalShared: false,
          contactShared: false,
          locationShared: false,
        },
      ],
    })

    expect(record).toContain('Daniela Oliveira')
    expect(record).toContain('ficha médica: não compartilhado neste círculo')
    expect(record).toContain('contato de emergência: não compartilhado neste círculo')
    expect(record).toContain('localização/endereço: não compartilhado neste círculo')
  })
})
