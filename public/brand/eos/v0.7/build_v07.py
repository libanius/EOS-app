"""EOS logo v0.7 — refinamento ótico da v0.6, sem redesenho.

Mudanças:
1. Compensação ótica: traços horizontais 2u mais finos que os verticais
   (bold 26/24, regular 20/18). Abre as contraformas do E e do S e
   faz horizontais e verticais *parecerem* iguais.
2. O interno recalculado: chanfro interno paralelo ao externo, com a
   mesma espessura média do traço.
3. Descritor em curvas (DM Mono Medium), sem depender de fonte instalada,
   com espaçamento calculado para bater exatamente na largura da marca.
4. Ícones com grade de pixel própria para 16/32px e maskable maior.
5. Versões de cor: fundo escuro, fundo claro, uma cor e sobre o Signal.

Regras mantidas: uma única direção de corte (45° descendo à esquerda),
terminais deslizados no E (topo) e no S (base), canais paralelos de 24u.
"""
import os, math
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

OUT = "/home/claude/eos-logo-v07"
os.makedirs(OUT + "/png", exist_ok=True)

BONE, SIG, BAS = "#F2F5F3", "#00E5A0", "#0A0C0B"
SIG_DARK = "#00805A"  # Signal para fundo claro (contraste >= 4.5 com branco)
ADV = 144
R2 = math.sqrt(2)
r = lambda v: round(v, 1)


def glyphs(v, h, ce):
    """v = traço vertical, h = traço horizontal, ce = chanfro do topo do E."""
    g = (120 - 3 * h) / 2  # contraforma do E e do S
    a1, a2 = h + g, 2 * h + g  # braço do meio
    b = 120 - h  # topo do braço de baixo
    E = (f"M {ce},0 L 150,0 L {150-h},{h} L {v},{h} L {v},{r(a1)} L 100,{r(a1)} "
         f"L 100,{r(a2)} L {v},{r(a2)} L {v},{b} L 120,{b} L 120,120 L 0,120 L 0,{ce} Z")
    S = (f"M 30,0 L 120,0 L 120,{h} L {v},{h} L {v},{r(a1)} L 120,{r(a1)} L 120,90 "
         f"L 90,120 L -30,120 L {-30+h},{b} L {120-v},{b} L {120-v},{r(a2)} L 0,{r(a2)} L 0,30 Z")
    t = (v + h) / 2  # espessura média no chanfro
    k1 = 30 + t * R2          # linha interna x+y=k1 (canto sup-esq)
    k2 = 210 - t * R2         # linha interna x+y=k2 (canto inf-dir)
    xi0, xi1, yi0, yi1 = v, 120 - v, h, 120 - h
    O = (f"M 30,0 L 120,0 L 120,90 L 90,120 L 0,120 L 0,30 Z "
         f"M {r(k1-yi0)},{yi0} L {xi1},{yi0} L {xi1},{r(k2-xi1)} L {r(k2-yi1)},{yi1} "
         f"L {xi0},{yi1} L {xi0},{r(k1-xi0)} Z")
    return dict(E=E, O=O, S=S, counter=g)


G = {"bold": glyphs(26, 24, 40), "regular": glyphs(20, 18, 30)}

# ---------- descritor em curvas ----------
font = TTFont("/home/claude/fonts/DMMono-Medium.ttf")
gs, cmap = font.getGlyphSet(), font.getBestCmap()
UPM = font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight / UPM


def glyph_bounds(ch):
    bp = BoundsPen(gs); gs[cmap[ord(ch)]].draw(bp); return bp.bounds


def text_path(text, size, x0, baseline, width=None, track=None):
    s = size / UPM
    adv = gs[cmap[ord(text[0])]].width * s
    first, last = glyph_bounds(text[0]), glyph_bounds(text[-1])
    n = len(text)
    if track is None:
        ink = (n - 1) * adv + (last[2] - first[0]) * s
        track = (width - ink) / (n - 1)
    pen = SVGPathPen(gs)
    for i, ch in enumerate(text):
        if ch == " ":
            continue
        x = x0 - first[0] * s + i * (adv + track)
        gs[cmap[ord(ch)]].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
    return pen.getCommands(), track


def mark(g, c1, c2):
    return (f'<path fill="{c1}" d="{g["E"]}"/>'
            f'<path fill="{c2}" fill-rule="evenodd" transform="translate({ADV},0)" d="{g["O"]}"/>'
            f'<path fill="{c1}" transform="translate({ADV*2},0)" d="{g["S"]}"/>')


def svg(vb, body, bg=None, label="EOS"):
    x, y, w, h = vb.split()
    b = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" '
            f'role="img" aria-label="{label}">{b}{body}</svg>')


# stack: vão de 24u (o mesmo canal entre as letras) entre marca e descritor
DS = 20
st_base = 120 + 24 + CAP * DS
st_d, st_track = text_path("EMERGENCY OPERATING SYSTEM", DS, 0, st_base, width=408)
ST_H = math.ceil(st_base + 4)

# horizontal: 3 linhas, topo da 1ª = topo da marca, base da 3ª = base da marca
HS = 26
c = CAP * HS
bl = [c, (c + 120) / 2, 120]
h1, htrack = text_path("EMERGENCY", HS, 448, bl[0], width=156)
h2, _ = text_path("OPERATING", HS, 448, bl[1], track=htrack)
h3, _ = text_path("SYSTEM", HS, 448, bl[2], track=htrack)
hz_d = h1 + h2 + h3

THEMES = {  # nome: (tinta, acento, fundo)
    "dark": (BONE, SIG, None),
    "light": (BAS, SIG_DARK, None),
    "mono-black": (BAS, BAS, None),
    "mono-white": ("#FFFFFF", "#FFFFFF", None),
    "on-signal": (BAS, BAS, SIG),
}

files = {}
for wt, g in G.items():
    for th, (ink, acc, bg) in THEMES.items():
        files[f"lockup/eos-{wt}-{th}.svg"] = svg("0 0 408 120", mark(g, ink, acc), bg)
gb = G["bold"]
for th, (ink, acc, bg) in THEMES.items():
    files[f"lockup/eos-stack-{th}.svg"] = svg(
        f"0 0 408 {ST_H}", mark(gb, ink, acc) + f'<path fill="{ink}" d="{st_d}"/>', bg,
        "EOS — Emergency Operating System")
    files[f"lockup/eos-horizontal-{th}.svg"] = svg(
        "0 0 604 120", mark(gb, ink, acc) + f'<path fill="{ink}" d="{hz_d}"/>', bg,
        "EOS — Emergency Operating System")
files["lockup/eos-bold-currentColor.svg"] = svg("0 0 408 120", mark(gb, "currentColor", "currentColor"))

# ---------- ícones ----------
for wt, g in G.items():
    files[f"icon/eos-o-{wt}.svg"] = svg("0 0 120 120", f'<path fill="{SIG}" fill-rule="evenodd" d="{g["O"]}"/>')
# app icon: O bold em placa basalto (any)
files["icon/eos-app-icon.svg"] = svg(
    "0 0 512 512", f'<g transform="translate(106,106) scale(2.5)"><path fill="{SIG}" fill-rule="evenodd" d="{gb["O"]}"/></g>', BAS)
# maskable: O inteiro dentro do círculo seguro (80% = raio 204.8)
files["icon/eos-maskable.svg"] = svg(
    "0 0 512 512", f'<g transform="translate(118,118) scale(2.3)"><path fill="{SIG}" fill-rule="evenodd" d="{gb["O"]}"/></g>', BAS)
# favicons desenhados na grade de pixel
files["icon/eos-favicon-32.svg"] = svg(
    "0 0 32 32", f'<path fill="{SIG}" fill-rule="evenodd" d="M 10,4 L 28,4 L 28,22 L 22,28 L 4,28 L 4,10 Z M 12,9 L 23,9 L 23,20 L 20,23 L 9,23 L 9,12 Z"/>', BAS)
files["icon/eos-favicon-16.svg"] = svg(
    "0 0 16 16", f'<path fill="{SIG}" fill-rule="evenodd" d="M 5,2 L 14,2 L 14,11 L 11,14 L 2,14 L 2,5 Z M 6,5 L 11,5 L 11,10 L 10,11 L 5,11 L 5,6 Z"/>', BAS)

for k, v in files.items():
    p = f"{OUT}/{k}"; os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(v)

# ---------- PNGs ----------
import cairosvg
P = lambda src, dst, w: cairosvg.svg2png(url=f"{OUT}/{src}", write_to=f"{OUT}/png/{dst}", output_width=w)
P("icon/eos-app-icon.svg", "eos-icon-512.png", 512)
P("icon/eos-app-icon.svg", "eos-icon-192.png", 192)
P("icon/eos-maskable.svg", "eos-maskable-512.png", 512)
P("icon/eos-maskable.svg", "eos-maskable-192.png", 192)
P("icon/eos-app-icon.svg", "apple-touch-180.png", 180)
P("icon/eos-favicon-32.svg", "favicon-32.png", 32)
P("icon/eos-favicon-16.svg", "favicon-16.png", 16)
for th in ["dark", "light"]:
    P(f"lockup/eos-bold-{th}.svg", f"eos-lockup-{th}-1600.png", 1600)
    P(f"lockup/eos-stack-{th}.svg", f"eos-stack-{th}-1600.png", 1600)
    P(f"lockup/eos-horizontal-{th}.svg", f"eos-horizontal-{th}-2000.png", 2000)

# relatório
def contrast(a, b):
    def L(hx):
        c = [int(hx[i:i+2], 16) / 255 for i in (1, 3, 5)]
        c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
        return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
    l1, l2 = sorted([L(a), L(b)], reverse=True); return (l1 + .05) / (l2 + .05)

print("contraforma E/S bold:", G["bold"]["counter"], "| regular:", G["regular"]["counter"])
print("tracking stack:", round(st_track, 2), "| horizontal:", round(htrack, 2), "| stack h:", ST_H)
print("contraste SIG/branco:", round(contrast(SIG, "#FFFFFF"), 2), "SIG_DARK/branco:", round(contrast(SIG_DARK, "#FFFFFF"), 2),
      "SIG/basalto:", round(contrast(SIG, BAS), 2))
print(len(files), "svgs")
