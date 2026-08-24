import { buildEduPreparednessProposals, cleanEduActionText } from '../edu-actions'

describe('buildEduPreparednessProposals', () => {
  it('extracts numbered preparation actions from EDU notes', () => {
    const proposals = buildEduPreparednessProposals({
      summary: '',
      transcript: [
        '1. Defina onde a família se abriga.',
        '2. Verifique água, comida e medicamentos.',
        '3. Combine como o círculo se comunica.',
      ].join('\n'),
    })

    expect(proposals).toEqual([
      { name: 'Defina onde a família se abriga', tier: 'ESSENTIAL', quantity: 1, unit: null },
      { name: 'Verifique água, comida e medicamentos', tier: 'ESSENTIAL', quantity: 1, unit: null },
      { name: 'Combine como o círculo se comunica', tier: 'ESSENTIAL', quantity: 1, unit: null },
    ])
  })

  it('does not generate proposals from link-only metadata', () => {
    expect(buildEduPreparednessProposals({ summary: 'Fallout basics', transcript: '' })).toEqual([])
  })

  it('strips markdown, quotes and video timestamps from raw transcript lines', () => {
    expect(cleanEduActionText('**"Galvanized Stock Tank (3:30):"** Can store over 100 gallons of water.')).toBe(
      'Galvanized Stock Tank: Can store over 100 gallons of water.',
    )
    expect(cleanEduActionText('*The Seven Essential Items:**')).toBe('The Seven Essential Items')
  })
})
