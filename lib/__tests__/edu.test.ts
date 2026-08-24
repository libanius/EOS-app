import { youtubeEmbedUrl } from '../edu'

describe('edu helpers', () => {
  it('builds privacy-enhanced embeds for supported YouTube URLs', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(youtubeEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(youtubeEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('rejects unsupported or malformed video URLs', () => {
    expect(youtubeEmbedUrl(null)).toBeNull()
    expect(youtubeEmbedUrl('not a url')).toBeNull()
    expect(youtubeEmbedUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeEmbedUrl('https://youtube.com/watch?v=bad')).toBeNull()
  })
})
