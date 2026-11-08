# EOS — logo

Versão atual: **v0.7** (`v0.7/`). A v0.6 fica guardada em `v0.6/` como referência.

## Regras
- Uma única direção de corte: 45° descendo para a esquerda. Nunca a diagonal espelhada.
- O braço de cima do E e o braço de baixo do S são terminais **deslizados**, não cantos chanfrados.
- Não redesenhar nem aproximar com fonte. Use os SVGs desta pasta.
- Signal `#00E5A0` só em fundo escuro. Em fundo claro use `#00805A`.

## O que mudou da v0.6 para a v0.7
- Horizontais 2u mais finas que as verticais (bold 26/24, regular 20/18): compensação ótica e contraformas mais abertas.
- Contraforma do O recalculada, com chanfro interno paralelo ao externo.
- Descritor em curvas (DM Mono Medium), batendo exatamente na largura da marca.
- Ícones novos: app icon e maskable em placa basalto, favicons 16/32 desenhados na grade de pixel.
- Versões de cor: `dark`, `light`, `mono-black`, `mono-white`, `on-signal`.

## Quando usar
| Largura | Use |
|---|---|
| acima de 260px | stack ou horizontal |
| 100–260px | só a marca (`eos-bold-*`) |
| abaixo de 100px | só o ícone |
| abaixo de 24px | `eos-favicon-16` / `eos-favicon-32` |

`build_v07.py` regenera tudo (precisa de DM Mono Medium e `fonttools`).
