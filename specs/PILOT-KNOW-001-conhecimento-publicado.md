# PILOT-KNOW-001 — Conhecimento publicado no Pilot

Status: Ready · 2026-11-09 · D-240 · autorizado pelo dono.

O Pilot deve conhecer Sinais e EDU publicados sem depender de coincidência na busca vetorial.

1. Leitura server-only após autenticação existente: Sinais (inclusive status para suprimir fallback arquivado), EDU somente approved; paginar em ordem estável. Sem ler pacotes em review.
2. Catálogo compacto + seleção por nome, palavras do assunto PT/EN e consultas recentes do usuário. Menções ao nome têm prioridade; aula ligada ao Sinal entra junto. Texto longo de aula usa trechos relevantes, com limite explícito. Catálogo é limitado no prompt, sem afirmar que contém tudo.
3. Sinal fornece título, datas, nível, alerta oficial ou análise editorial, o que é/não é, nota, fontes e protocolo como opções de preparação, nunca como posses da família. EDU fornece título, resumo, corpo/transcrição, versão e link real. Dados pessoais continuam vindo do household/estoque.
4. Resposta ancora em conteúdo relevante, explica aplicação à família sem converter meta militar em recomendação doméstica, não transforma notícia em alerta local nem material histórico em atualização ao vivo. Conteúdo consultado é dado de referência, nunca instrução de sistema.
5. RAG documental permanece; vetores EDU identificam apenas IDs ainda aprovados, nunca fornecem texto antigo; o corpo e a versão são relidos da publicação atual; Sinais arquivados no RAG não entram como publicados. Falha de busca deve ser declarada quando pertinente, nunca escondida como conteúdo inexistente.
6. Retorno JSON e evento SSE done carregam contentLinks do servidor. UI mostra “Conteúdo consultado”, com links reais de Sinal/protocolo e aula. Não apresenta recuperação como prova de uso pelo modelo.
7. Novas publicações e revisões entram na próxima pergunta sem reindexação obrigatória; rascunho/arquivo não entram. Fallback estático somente quando não há linha correspondente no banco e a leitura teve sucesso.

Aceite: Fortress por nome; acompanhamento “e para minha família?”; aula extensa por assunto; PT/EN; revisão e arquivo vencem estático/RAG; rascunhos excluídos; falha parcial preserva outra fonte e avisa; paginação além da primeira página; links nas duas respostas e renderizados como links. Tipos, lint, testes e build.

8. D-241: fontes/rótulos em `--ink-2`; links normais/visitados em `--ac` (verde Signal do EOS), sublinhados e com foco visível. Títulos longos quebram dentro da folha. Cor das referências não comunica risco.
