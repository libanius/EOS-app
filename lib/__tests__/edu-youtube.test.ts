import { youtubeEmbedFromId, youtubeEmbedUrl, youtubeThumbFromId } from '@/lib/edu'

describe('YouTube por ID (CONTENT-001 §5.7)', () => {
  it('monta o embed sem cookies e a miniatura', () => {
    expect(youtubeEmbedFromId('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(youtubeThumbFromId('dQw4w9WgXcQ')).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })
  it('recusa ID inválido ou ausente', () => {
    expect(youtubeEmbedFromId('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
    expect(youtubeEmbedFromId(undefined)).toBeNull()
    expect(youtubeThumbFromId('curto')).toBeNull()
  })
  it('o caminho antigo por URL continua igual', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })
})
