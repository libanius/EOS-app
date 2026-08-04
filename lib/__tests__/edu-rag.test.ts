import {
  buildEduRagText,
  chunkEduRagText,
  eduRagSource,
  eduRagSourceVersion,
  inferEduScenarioType,
} from '../edu-rag'

describe('edu rag helpers', () => {
  it('preserves EDU id and version as knowledge-base provenance', () => {
    expect(eduRagSource('abc-123')).toBe('edu:abc-123')
    expect(eduRagSourceVersion(3)).toBe('v3')
    expect(eduRagSourceVersion(0)).toBe('v1')
  })

  it('maps scenario tags into the existing knowledge_base enum', () => {
    expect(inferEduScenarioType(['fallout', 'shelter'])).toBe('FALLOUT')
    expect(inferEduScenarioType(['wildfire'])).toBe('FIRE')
    expect(inferEduScenarioType(['unknown'])).toBe('GENERAL')
  })

  it('builds and chunks owner-approved EDU text', () => {
    const text = buildEduRagText({
      title: 'Fallout basics',
      summary: 'Prepare shelter and water.',
      transcript: 'Stay inside. Seal gaps. Listen for official updates.',
      source_url: 'https://youtu.be/dQw4w9WgXcQ',
      scenario_tags: ['fallout'],
    })

    expect(text).toContain('Title: Fallout basics')
    expect(text).toContain('Transcript / notes:')
    expect(chunkEduRagText(text)).toHaveLength(1)
    expect(chunkEduRagText('')).toEqual([])
  })
})
