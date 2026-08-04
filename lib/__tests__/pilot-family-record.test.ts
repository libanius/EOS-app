import { buildPilotFamilyRecord } from '../pilot-family-record'

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
})
