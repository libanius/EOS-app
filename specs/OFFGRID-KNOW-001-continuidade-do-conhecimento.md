# OFFGRID-KNOW-001 — Conhecimento que acompanha a família

Status: **Ready** — D-242, prioridade total autorizada pelo dono em 2026-11-10.

## Contrato

- Fonte documental: textos de `knowledge_base`, sem vetores. Editorial: versões ATUAIS de Sinais publicados e EDU aprovado, reutilizando o catálogo D-240, nos dois idiomas. Nunca exportar content_packages/review/draft nem dados pessoais. Vetores editoriais antigos são excluídos.
- Endpoint autenticado `/api/pilot/offline-pack`, NetworkOnly, sem cache compartilhado. Snapshot versionado por SHA-256; ETag evita retransmitir texto idêntico. A resposta inicial é um manifesto; texto via partes de até 256 Ki caracteres, autenticadas e presas à mesma versão (409 se a publicação mudou). Isso evita o limite de payload da hospedagem. Só montar/gravar após todas as partes e hash correto. Falha em qualquer fonte retorna 503 e mantém a cópia anterior. Teto de 32 MiB retorna erro explícito; não corta o acervo.
- Sincronização automática ao abrir o app autenticado, reconectar, voltar ao primeiro plano e a cada cinco minutos visíveis. Novos textos entram no próximo sync, inclusive quando `rag_enabled=false`; não precisam ter sido abertos. Sem conexão não há como receber publicações futuras.
- IndexedDB guarda a cópia inteira atomicamente. Casca nativa espelha em blocos no Preferences e só promove o ponteiro depois de gravar/reler todos. Biblioteca contém somente conhecimento editorial/documental, não dados de família.
- Pilot pesquisa localmente ao detectar offline, erro de servidor, timeout ou stream incompleto; preserva texto parcial identificado. Crise emocional continua sendo verificada antes de recuperar documentos. Regras determinísticas continuam prioritárias.
- Busca lexical PT/EN com sinônimos; manuais continuam no idioma original. Cada resultado identifica fonte, versão, data do snapshot e natureza de trecho. Leitura completa disponível em `/offline.html`, estática e cacheada previamente; o fallback nativo usa o mesmo motor gerado e mesma biblioteca. Não inventar tradução nem apresentar trecho como plano adaptado.
- Conteúdo completo textual publicado inclui protocolo, alternativas, advertências e fontes. Vídeos, imagens, páginas externas e produtos continuam links; baixar mídia é entrega separada.
- UI usa tokens/cores EOS e não muda navegação ou propriedade das telas: entrada pelo Pilot e abertura offline.

No navegador, a contagem de textos salvos é independente da prontidão da tela offline. Verificar controle pelo service worker e presença do HTML e scripts essenciais no precache. Exibir no Pilot um botão claro para abrir e verificar o leitor e uma mensagem caso a abertura offline ainda não esteja pronta.

## Aceitação

1. Publicar/aprovar novo Sinal/EDU, sincronizar sem abrir o artigo, desligar toda rede e encontrar título e corpo.
2. Manuais militar, sobrevivência e psicologia continuam pesquisáveis sem OpenAI e Supabase.
3. Fonte, versão e data visíveis; abrir texto completo sem rede.
4. Atualização substitui; arquivamento remove após sync. Review e vetores antigos nunca entram.
5. Falha parcial, JSON inválido, quota cheia e queda durante gravação preservam último pacote íntegro; nunca mostrar sucesso falso.
6. Reiniciar PWA em modo avião abre a biblioteca sem sessão remota. Reabrir casca nativa usa dados nativos entre origens.
7. Pergunta sem correspondência declara ausência e oferece biblioteca; não inventa resposta.
8. Sem download inicial, estado vazio explícito. Navegador pode remover dados: verificar presença ao abrir, não prometer permanência absoluta.
9. Testes automatizados do contrato, recuperação e mudança de versão; build/types/lint/suíte. Validação real de iPhone separada, sem dizer concluída por simulação.

## Próxima entrega

Modelo local compatível com Capacitor consultando essa biblioteca para interpretar, combinar e orientar em conversa livre. Busca documental não pode ser anunciada como modelo local implementado. Mantém fallback sem modelo.
