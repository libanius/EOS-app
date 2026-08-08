"""
O ícone maskable do EOS (D-133).

POR QUE ESTE ARQUIVO EXISTE. O manifest declarava `icon.svg` como
`purpose: "any maskable"`. Ele não é maskable: o ponto verde fica em (420, 150)
com raio 26, ou seja a 221px do centro — e a zona segura de um ícone maskable é
o círculo de raio 205 (80% da tela). A máscara circular do Android cortaria o
ponto pela metade, e o Play mostraria um ícone mutilado na gaveta de apps.

Um SVG também não serve sozinho: o Bubblewrap e o Play Console querem PNG de
512, e o Lighthouse reprova um PWA sem PNG maskable.

Este script desenha a MESMA composição — fundo, três barras, o ponto — com duas
diferenças que a máscara exige:

  1. o fundo é FULL BLEED (sem cantos arredondados). O arredondamento é papel da
     máscara do sistema; desenhá-lo aqui produziria canto dentro de canto.
  2. o desenho inteiro é reduzido para caber no círculo de 80%, com o ponto
     junto — em vez de deixá-lo escapar pela borda.

Rodar:  python3 scripts/make-maskable-icon.py
Saída:  public/icon-maskable-512.png e public/icon-maskable-192.png
"""

from PIL import Image, ImageDraw

FUNDO = (10, 10, 15, 255)      # #0a0a0f
VERDE_CLARO = (34, 197, 94)    # #22c55e
VERDE_ESCURO = (21, 128, 61)   # #15803d

LADO = 512
# 4x de supersampling: PIL não tem antialias em `rounded_rectangle`, e uma
# barra com serrilha num ícone de 512 aparece.
ESCALA = 4


def gradiente(tamanho, de, para):
    """Diagonal, como o `linearGradient` do SVG (x1,y1 → x2,y2 = 0,0 → 1,1)."""
    g = Image.new('RGB', (tamanho, tamanho))
    px = g.load()
    for y in range(tamanho):
        for x in range(tamanho):
            t = (x + y) / (2 * (tamanho - 1))
            px[x, y] = tuple(round(de[i] + (para[i] - de[i]) * t) for i in range(3))
    return g


def desenhar():
    n = LADO * ESCALA
    base = Image.new('RGBA', (n, n), FUNDO)

    # A composição original, em coordenadas de 512.
    barras = [(128, 120, 384, 172), (128, 230, 320, 282), (128, 340, 384, 392)]
    ponto = (420, 150, 26)

    # Caixa que envolve tudo, o ponto incluído.
    x0 = min(b[0] for b in barras)
    y0 = min(min(b[1] for b in barras), ponto[1] - ponto[2])
    x1 = max(max(b[2] for b in barras), ponto[0] + ponto[2])
    y1 = max(max(b[3] for b in barras), ponto[1] + ponto[2])

    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # A diagonal da caixa tem que caber no círculo seguro (raio 205 de 512).
    meia_diagonal = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 / 2
    k = (LADO * 0.4) / meia_diagonal

    def mapear(x, y):
        """De coordenada original para a tela, centrado e reduzido."""
        return ((LADO / 2 + (x - cx) * k) * ESCALA, (LADO / 2 + (y - cy) * k) * ESCALA)

    # A tinta verde é uma imagem de gradiente recortada por uma máscara — é
    # assim que se pinta um gradiente numa forma com PIL.
    mascara = Image.new('L', (n, n), 0)
    caneta = ImageDraw.Draw(mascara)
    for bx0, by0, bx1, by1 in barras:
        p0, p1 = mapear(bx0, by0), mapear(bx1, by1)
        caneta.rounded_rectangle([p0, p1], radius=8 * k * ESCALA, fill=255)
    px, py = mapear(ponto[0], ponto[1])
    r = ponto[2] * k * ESCALA
    caneta.ellipse([px - r, py - r, px + r, py + r], fill=255)

    tinta = gradiente(n, VERDE_CLARO, VERDE_ESCURO).convert('RGBA')
    base = Image.composite(tinta, base, mascara)

    # O anel escuro que separa o ponto da barra de cima, como no SVG.
    anel = ImageDraw.Draw(base)
    anel.ellipse([px - r, py - r, px + r, py + r], outline=FUNDO, width=round(6 * k * ESCALA))

    return base.resize((LADO, LADO), Image.LANCZOS)


if __name__ == '__main__':
    icone = desenhar()
    icone.save('public/icon-maskable-512.png')
    icone.resize((192, 192), Image.LANCZOS).save('public/icon-maskable-192.png')

    # A conferência que importa: nenhum pixel visível fora do círculo seguro.
    seguro = LADO * 0.4
    fora = 0
    px = icone.convert('RGBA').load()
    for y in range(LADO):
        for x in range(LADO):
            if ((x - LADO / 2) ** 2 + (y - LADO / 2) ** 2) ** 0.5 > seguro:
                r, g, b, _ = px[x, y]
                # Fundo é permitido fora do círculo — é ele que a máscara corta.
                if abs(r - FUNDO[0]) + abs(g - FUNDO[1]) + abs(b - FUNDO[2]) > 24:
                    fora += 1
    print(f'gerado. pixels de conteúdo fora da zona segura: {fora}')
    raise SystemExit(1 if fora else 0)
