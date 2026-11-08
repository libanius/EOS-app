# SIGNAL-SHARE-001 — Compartilhar um Sinal
Status: Ready — aprovado pelo dono em 2026-11-07.

## Decisão
Compartilhar deve divulgar o EOS e levar ao Sinal específico. Conteúdo público em `/sinais/[slug]/compartilhar?lang=pt|en`, fora da casca autenticada. O protocolo e dados da casa continuam em `/sinais/[slug]`, com login. A página pública usa somente conteúdo editorial publicado e versionado; não consulta a casa nem aceita dados privados em URL.

## Experiência aprovada
Capa promocional EOS por Sinal, com FORTRESS primeiro; fallback Open Graph com título EOS para futuros Sinais. Compartilhar abre a folha nativa com texto curto e um único link EOS. Copiar resumo inclui primeiro o link EOS, contexto e fontes disponíveis na página; não copia números da família. Visitantes leem contexto, o que não é e fontes sem conta. CTA criar conta gratuita retorna ao protocolo após autenticação; CTA entrar para quem já tem conta. Conhecer planos leva à oferta existente, sem inventar benefícios ou cobrar automaticamente. Página PT/EN por parâmetro de idioma. Capa ilustrativa identificada na página.

## Casos e critérios
- Slug inexistente ou conteúdo não publicado: 404, inclusive imagem OG.
- Arquivado: leitura com aviso e sem convite para adotar protocolo.
- Metadados e capa acessíveis sem cookies para robôs sociais.
- Cancelar compartilhamento não copia silenciosamente; sem API nativa, copiar texto+URL.
- Links de cadastro preservam destino; sem expor quantidade, estoque, endereço ou nomes da casa.
- Login e APIs de estoque permanecem protegidos.
- Testar isolamento da rota pública, texto de compartilhamento, metadados, CTA e build.

## Tarefas
SHARE-T01: página pública + metadados + capa + botões + retorno de cadastro (COMPLETE).

Gancho aprovado em 2026-11-07: "Sua família está pronta?" / "Is your family ready?"; chamada "Descubra o que sua família precisa para começar a se preparar." na página, metadados e texto compartilhado. Capa FORTRESS PT com o gancho; EN usa a capa editorial EOS.
