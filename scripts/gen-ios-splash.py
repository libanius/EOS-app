#!/usr/bin/env python3
"""D-238 — gera as telas de abertura do iPhone (public/splash/*.png).

Cada imagem é o primeiro quadro da abertura (components/BootSplash.tsx):
fundo basalto e o O da v0.7 virado 90° para a esquerda, no mesmo lugar em
que a animação começa. Assim a troca da imagem do iOS para a animação não
aparece.

A posição repete a geometria do BootSplash: largura do lockup
L = min(62% da tela, 300px), lockup centrado na vertical com altura
≈ 0,4116·L (marca + margem + descritor), O em 174..294 de 438 unidades.

Se mudar o tamanho ou a posição da abertura, rode de novo:
    pip install cairosvg && python3 scripts/gen-ios-splash.py
e mantenha a lista IOS_SPLASH de app/layout.tsx igual à lista DEV abaixo.
"""
import os
import cairosvg

O = "M 30,0 L 120,0 L 120,90 L 90,120 L 0,120 L 0,30 Z M 41.4,24 L 94,24 L 94,80.6 L 78.6,96 L 26,96 L 26,39.4 Z"
BG = "#0a0a0f"
SIGNAL = "#00E5A0"

# (nome, largura CSS, altura CSS, densidade) — retrato
DEV = [
    ("iphone-17-pro-max", 440, 956, 3), ("iphone-air", 420, 912, 3),
    ("iphone-17-pro", 402, 874, 3), ("iphone-16-pro-max", 430, 932, 3),
    ("iphone-15", 393, 852, 3), ("iphone-14-plus", 428, 926, 3),
    ("iphone-14", 390, 844, 3), ("iphone-11-pro-max", 414, 896, 3),
    ("iphone-11", 414, 896, 2), ("iphone-x", 375, 812, 3),
    ("iphone-8-plus", 414, 736, 3), ("iphone-8", 375, 667, 2),
    ("iphone-se-1", 320, 568, 2),
]

root = os.path.join(os.path.dirname(__file__), "..", "public", "splash")
os.makedirs(root, exist_ok=True)
for name, w, h, r in DEV:
    lockup = min(0.62 * w, 300)
    top = (h - 0.4116 * lockup) / 2
    left = (w - lockup) / 2 + lockup * 174 / 438
    k = (lockup * 120 / 438) / 120
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w*r}" height="{h*r}" viewBox="0 0 {w} {h}">'
        f'<rect width="{w}" height="{h}" fill="{BG}"/>'
        f'<path fill="{SIGNAL}" fill-rule="evenodd" '
        f'transform="translate({left:.2f},{top:.2f}) scale({k:.5f}) rotate(-90 60 60)" d="{O}"/></svg>'
    )
    cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(root, f"{name}.png"))
    print(name)
