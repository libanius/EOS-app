import { buildEduPreparednessProposals } from '../edu-actions'

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
})
