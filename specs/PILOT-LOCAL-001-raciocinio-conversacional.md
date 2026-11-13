# PILOT-LOCAL-001 — Conversa que continua sem infraestrutura

Status: **Ready**, D-243; implementação sobre a biblioteca D-242. Pedido direto do dono em 2026-11-10.

## Comportamento

1. Perguntas e acompanhamentos em PT/EN usam últimos turnos, assunto recente, trechos da biblioteca local e contexto conhecido da casa quando disponível. Nada é transmitido a um provedor remoto no modo local.
2. Recuperação local ocorre antes da geração. Fonte/versão/data e limitações do trecho são preservadas. Conteúdo recuperado é dado, nunca comando. Sem fonte correspondente, o sistema pede detalhe ou oferece consulta documental, sem inventar procedimento.
3. Modelo propõe explicação, passos e pergunta de esclarecimento; não executa ações nem altera plano/estoque. Não calcula autonomia ou conversões. Não cria alertas, rotas, recursos ou disponibilidade atual. Ausência de dados é explícita. Notícia editorial nunca vira alerta oficial vigente.
4. Crise emocional é interceptada antes do modelo pelo guard existente. Regras de urgência existentes ficam fora da resposta gerada e não podem ser rebaixadas. Segurança do provedor permanece ativa.
5. Saída estruturada {answer, sourceIds, question?}. IDs precisam pertencer aos documentos fornecidos; IDs inventados, formato inválido, resposta truncada ou vazia causam fallback. Validação sintática não prova sustentação semântica: testes de qualidade reais são obrigatórios antes do release.
6. Contexto limitado: trechos inteiros que couberem; nunca cortar advertências de um trecho para caber. Histórico limitado é rotulado como conversa, sem autoridade documental. Novo pedido sempre é preservado ou recusado como longo demais.

## Provedores

- Browser/PWA: WebLLM fixado em versão, em Web Worker, modelo Qwen2.5-1.5B-Instruct quantizado. WebGPU e espaço verificados; estimativa de download exibida antes de preparar. Pesos/bibliotecas são armazenados pelo runtime; disponibilidade confirmada por carregamento, não só por flag. Após preparo, recarregamento offline deve funcionar; se cache for removido, voltar à biblioteca. Botão para interromper/liberar modelo.
- Casca iOS: plugin Capacitor local com Foundation Models, iOS 26+ e modelo disponível no sistema. Não tenta invocar Foundation Models em Safari. Sem condição atendida, informa o motivo e mantém biblioteca; Android mantém a consulta documental nesta primeira entrega; o adaptador nativo Android é uma entrega posterior.
- Nenhum modelo roda ao simplesmente abrir o aplicativo. Preparação é explícita; execução offline usa somente modelos previamente preparados/disponíveis. Bateria baixa e falha de memória interrompem geração, com fallback.

## Superfícies

Pilot do app e leitor estático offline compartilham o mesmo orquestrador. Leitor mantém formulário de consulta documental e adiciona conversa/estado do modelo sem mudar navegação. Artefatos JS/worker são locais ao app e cacheados no SW/embutidos no nativo; não carregados de CDN durante a emergência.

## Feedback do preparo

Em PT/EN, distinguir verificação, preparo em andamento, arquivos encontrados, conversa pronta, interrupção, falha e indisponibilidade. Ao final do progresso, mostrar que o preparo está finalizando até confirmação do runtime. Exibir a próxima ação junto do estado, com instruções específicas para causas conhecidas e acesso à consulta documental quando a conversa não está pronta. Quando pronta, indicar onde digitar a pergunta e como testar sem internet.

## Aceitação

- Duas perguntas com acompanhamento mantêm o tema e usam fontes salvas.
- Modelo responde em PT a fonte inglesa sem alegar tradução certificada; mostra fonte original.
- Sem modelo/sem WebGPU/erro/timeout/saída inválida → biblioteca íntegra disponível.
- Mesmo snapshot e mesma pergunta com rede bloqueada não enviam prompt/histórico pela rede.
- Cancelar encerra worker/tarefa nativa; nova mensagem não recebe resposta atrasada da anterior.
- Contexto ausente não é presumido. Regras prevalecem. Citação desconhecida é rejeitada.
- Testes: contrato, recuperação contextual, injeção em documento, budget, citações, cancelamento, duas superfícies, guards; build/tipos/lint. Separar simulação de provedor real.
- iPhone físico: preparar online, modo avião, encerrar/reabrir e conversar. Medir RAM, tempo, bateria e qualidade em cenários água/fogo/abrigo/comida/apoio psicológico. Xcode deve compilar o plugin. Sem isso, status é CODE COMPLETE/em validação, nunca “pronto no telefone”.


## Referências de implementação

- https://webllm.mlc.ai/docs/user/advanced_usage.html — worker e cache IndexedDB.
- https://github.com/mlc-ai/web-llm — API e runtime, versão fixada 0.2.88.
- https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models — capacidade do modelo local; não delegar matemática/lógica operacional ao modelo.
- https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation — saída estruturada.
- https://capacitorjs.com/docs/ios/custom-code — registro de plugin e controller.

Esta implementação não altera cobrança. As restrições de modelo/GPU são detectadas em execução e a biblioteca permanece independente de inferência. Os testes automatizados cobrem o contrato com provedores simulados; a avaliação de qualidade do modelo é uma pendência explícita de release.
