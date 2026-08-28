#!/usr/bin/env python3
"""Confere as imagens da ficha da Play Store ANTES do upload.

Cada regra abaixo é uma recusa real do Play Console, e todas se descobrem tarde:
o formulário aceita o arquivo, você preenche a ficha inteira e só então o
"Salvar" devolve um erro sem dizer qual imagem tem culpa.

A que mais pega: **a maior dimensão não pode passar do dobro da menor**. Uma
captura de iPhone (780x1688, razao 2.16) é reprovada, e o número parece tão
inocente que ninguém desconfia dele primeiro.

USO:  python3 scripts/check-store-images.py [pasta] [--icon arq] [--feature arq]
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Falta Pillow:  pip3 install Pillow")

OK, FAIL = "  OK  ", " FALHA"
problemas = 0


def diz(bom, msg):
    global problemas
    if not bom:
        problemas += 1
    print(f"{OK if bom else FAIL}  {msg}")


def captura(p: Path):
    im = Image.open(p)
    w, h = im.size
    menor, maior = min(w, h), max(w, h)
    print(f"\n{p.name}  —  {w}x{h}  {im.mode}")
    diz(im.format == "PNG" or im.format == "JPEG", f"formato PNG ou JPEG (é {im.format})")
    diz(menor >= 320, f"menor lado >= 320 px (é {menor})")
    diz(maior <= 3840, f"maior lado <= 3840 px (é {maior})")
    diz(maior <= 2 * menor,
        f"maior lado <= 2x o menor — razão {maior/menor:.2f} (limite 2.00)")
    # Uma tela quase toda de uma cor costuma ser carregamento capturado cedo
    # demais: o mapa ainda não pintou, a lista ainda não chegou.
    pequena = im.convert("RGB").resize((48, 48))
    cores = pequena.getcolors(48 * 48) or []
    dominante = max(c[0] for c in cores) / (48 * 48) if cores else 1
    diz(dominante < 0.92,
        f"tem conteúdo — cor dominante em {dominante*100:.0f}% da tela (suspeito acima de 92%)")


def icone(p: Path):
    im = Image.open(p)
    w, h = im.size
    print(f"\n[ícone da loja] {p.name}  —  {w}x{h}  {im.mode}")
    diz((w, h) == (512, 512), f"exatamente 512x512 (é {w}x{h})")
    diz(im.format == "PNG", f"PNG (é {im.format})")
    if im.mode == "RGBA":
        # O Play aplica a própria máscara arredondada. Um ícone que já vem com
        # cantos transparentes leva arredondamento DUAS vezes e fica com a
        # borda comida.
        a = im.getchannel("A")
        cantos = [a.getpixel(c) for c in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
        diz(all(v == 255 for v in cantos),
            f"cantos opacos (full-bleed) — alfa dos cantos: {cantos}")


def destaque(p: Path):
    im = Image.open(p)
    w, h = im.size
    print(f"\n[gráfico de destaque] {p.name}  —  {w}x{h}  {im.mode}")
    diz((w, h) == (1024, 500), f"exatamente 1024x500 (é {w}x{h})")
    diz(im.format in ("PNG", "JPEG"), f"PNG ou JPEG (é {im.format})")


def main():
    args = sys.argv[1:]
    pasta = Path(args[0]) if args and not args[0].startswith("--") else Path("store/screenshots")
    icon = feature = None
    for i, a in enumerate(args):
        if a == "--icon" and i + 1 < len(args):
            icon = Path(args[i + 1])
        if a == "--feature" and i + 1 < len(args):
            feature = Path(args[i + 1])

    shots = sorted(p for p in pasta.glob("*.png")) if pasta.exists() else []
    for p in shots:
        captura(p)

    print(f"\ncapturas encontradas: {len(shots)}")
    diz(len(shots) >= 2, "o Play exige no mínimo 2 capturas de telefone")
    diz(len(shots) <= 8, "o Play aceita no máximo 8 capturas de telefone")

    if icon:
        icone(icon)
    if feature:
        destaque(feature)

    print(f"\n{'TUDO PRONTO PARA UPLOAD' if problemas == 0 else f'{problemas} problema(s) — corrija antes de subir'}")
    sys.exit(1 if problemas else 0)


if __name__ == "__main__":
    main()
