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
    // Lista vazia significa "a casa ainda não foi montada", e não "esta família
    // não tem dependentes" (D-134). São coisas diferentes, e o Pilot precisa
    // saber qual das duas é antes de responder sobre quem mora ali.
    expect(record).toContain('a casa ainda não foi montada')
  })

  describe('a lista se apresenta como a casa, não como um cadastro (D-134)', () => {
    /*
     * O rótulo dizia "MEMBROS CADASTRADOS", que soa a lista de dependentes. Com
     * todos os campos em "não consta" — normal para um adulto com conta, porque
     * uma conta informa a própria ficha e não a própria idade — o modelo lia
     * aquilo como "quase não sei nada desta família" e parava de afirmar quem
     * morava ali. Era a queixa do dono: "o Pilot insiste em não saber quem está
     * morando em casa".
     */
    const casaDoDono = [
      { name: 'Você', has_account: true, medications: ['Loratadine'] },
      { name: 'Daniela Oliveira', has_account: true },
      { name: 'Paola Libanio', has_account: true },
    ]

    it('diz que a lista é a casa, completa e confirmada', () => {
      const record = buildPilotFamilyRecord({ pt: true, profile: null, members: casaDoDono })
      expect(record).toContain('QUEM MORA NESTA CASA (3)')
      expect(record).toMatch(/lista completa e confirmada/)
      // O rótulo antigo não pode voltar: era ele que fazia a lista parecer
      // um cadastro opcional de dependentes.
      expect(record).not.toContain('MEMBROS CADASTRADOS')
    })

    it('separa quem tem conta de quem está sob cuidados', () => {
      const record = buildPilotFamilyRecord({
        pt: true,
        profile: null,
        members: [
          { name: 'Você', has_account: true },
          { name: 'Isadora', has_account: false, cared_for_by: 'Você', age: 25 },
          { name: 'Fabinho', has_account: false, cared_for_by: 'Você', age: 18 },
        ],
      })
      expect(record).toContain('1 com conta no EOS')
      expect(record).toContain('2 sob cuidados')
      // A diferença muda a instrução: "avise a Isadora" não funciona para
      // alguém que não tem o app.
      expect(record).toContain('Isadora: idade 25')
      expect(record).toMatch(/Isadora[^\n]*sob cuidados de Você, sem conta/)
      expect(record).toMatch(/Você[^\n]*tem conta no EOS/)
    })

    it('em inglês também', () => {
      const record = buildPilotFamilyRecord({ pt: false, profile: null, members: casaDoDono })
      expect(record).toContain('WHO LIVES IN THIS HOUSEHOLD (3)')
      expect(record).toContain('3 with an EOS account')
      expect(record).not.toContain('REGISTERED FAMILY MEMBERS')
    })
  })

  it('formats circle member fichas that are shared with the Pilot', () => {
    const record = buildPilotCircleRecord({
      pt: true,
      members: [
        {
          circleName: 'Família',
          name: 'Daniela Oliveira',
          role: 'Editor',
          familyAccessApproved: true,
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
    expect(record).toContain('Família íntima aprovada')
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
