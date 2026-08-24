/**
 * O que o Play e o Bubblewrap exigem do manifest (D-133).
 *
 * Um TWA é o site embrulhado num APK. Se o manifest estiver errado, o app
 * instala e abre — com a barra de endereço do Chrome por cima, ou com o ícone
 * cortado na gaveta. Nada disso quebra em desenvolvimento; só aparece depois
 * de publicado, que é o pior momento para descobrir.
 *
 * O caso que motivou este arquivo: o manifest declarava `icon.svg` como
 * `"any maskable"`. Ele não é. O ponto verde do logotipo fica a 221px do centro
 * e a zona segura de um maskable é o círculo de raio 205 — a máscara circular
 * do Android cortaria o ponto pela metade.
 */

import fs from 'node:fs'
import path from 'node:path'

const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public/manifest.json'), 'utf8'),
) as {
  id?: string
  name?: string
  short_name?: string
  start_url?: string
  scope?: string
  display?: string
  theme_color?: string
  background_color?: string
  lang?: string
  icons?: Array<{ src: string; sizes: string; type?: string; purpose?: string }>
  shortcuts?: Array<{ name: string; url: string }>
}

const emDisco = (src: string) => fs.existsSync(path.join(process.cwd(), 'public', src.replace(/^\//, '')))

describe('o manifest atende ao que o TWA exige', () => {
  it('tem os campos sem os quais o Bubblewrap não gera o APK', () => {
    for (const campo of ['name', 'short_name', 'start_url', 'display', 'theme_color', 'background_color'] as const) {
      expect(manifest[campo]).toBeTruthy()
    }
    // `standalone` ou `fullscreen`: qualquer outro valor faz o Android mostrar
    // a barra do navegador, que é exatamente o que o TWA existe para remover.
    expect(['standalone', 'fullscreen']).toContain(manifest.display)
  })

  it('tem `id`, que é o que mantém a identidade do PWA estável', () => {
    // Sem `id`, mudar o `start_url` faz o navegador tratar como OUTRO app e a
    // pessoa perde o que já estava instalado.
    expect(manifest.id).toBeTruthy()
  })

  it('short_name cabe embaixo do ícone do Android', () => {
    // Acima de 12 caracteres o Android corta com reticências na gaveta.
    expect((manifest.short_name ?? '').length).toBeLessThanOrEqual(12)
  })
})

describe('os ícones', () => {
  const icones = manifest.icons ?? []

  it('todo ícone declarado existe em disco', () => {
    for (const i of icones) expect({ src: i.src, existe: emDisco(i.src) }).toEqual({ src: i.src, existe: true })
  })

  it('há PNG de 192 e 512 — o Play não aceita só SVG', () => {
    for (const tamanho of ['192x192', '512x512']) {
      expect(icones.some(i => i.sizes === tamanho && i.type === 'image/png')).toBe(true)
    }
  })

  it('há um maskable PNG de 512, e ele NÃO é o SVG', () => {
    const maskables = icones.filter(i => (i.purpose ?? '').split(' ').includes('maskable'))
    expect(maskables.length).toBeGreaterThan(0)
    expect(maskables.some(i => i.sizes === '512x512' && i.type === 'image/png')).toBe(true)
    // O SVG foi declarado maskable uma vez, com o ponto do logotipo fora da
    // zona segura. Não pode voltar a ser.
    expect(maskables.some(i => i.src.endsWith('.svg'))).toBe(false)
  })

  it('o maskable é um arquivo próprio, não o ícone comum reetiquetado', () => {
    /*
     * Um maskable precisa de fundo full bleed e do desenho dentro dos 80%
     * centrais. Reetiquetar o ícone normal passa neste manifest e falha no
     * aparelho — por isso a checagem é de arquivo diferente, e o script
     * `scripts/make-maskable-icon.py` mede os pixels de verdade.
     */
    const comuns = icones.filter(i => (i.purpose ?? 'any') === 'any').map(i => i.src)
    const maskables = icones.filter(i => (i.purpose ?? '').includes('maskable')).map(i => i.src)
    for (const m of maskables) expect(comuns).not.toContain(m)
  })
})

describe('os atalhos do long-press', () => {
  it('todo atalho aponta para uma rota que existe no app', () => {
    for (const atalho of manifest.shortcuts ?? []) {
      const rota = atalho.url.replace(/^\//, '')
      const existe =
        fs.existsSync(path.join(process.cwd(), 'app/(app)', rota, 'page.tsx')) ||
        fs.existsSync(path.join(process.cwd(), 'app', rota, 'page.tsx'))
      expect({ url: atalho.url, existe }).toEqual({ url: atalho.url, existe: true })
    }
  })
})

describe('a rota de assetlinks', () => {
  const fonte = fs.readFileSync(
    path.join(process.cwd(), 'app/.well-known/assetlinks.json/route.ts'),
    'utf8',
  )

  it('não tem impressão digital escrita no código', () => {
    // Uma fingerprint no repositório envelhece na primeira troca de chave, e o
    // arquivo continua afirmando que o app antigo é este site.
    expect(fonte).not.toMatch(/[0-9A-F]{2}(:[0-9A-F]{2}){10,}/)
    expect(fonte).toContain('TWA_SHA256_FINGERPRINTS')
  })

  it('valida o formato antes de publicar', () => {
    // Uma fingerprint malformada faz o Chrome falhar a verificação em silêncio.
    expect(fonte).toMatch(/\[0-9A-F\]\{2\}/)
  })
})
