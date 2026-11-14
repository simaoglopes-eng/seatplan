# UX v3 — relatório do Codex

Trabalho em `codex/ux-v3-discovery-ops`, worktree exclusiva, base `f2cea55`. Sem push, PR ou merge. Nenhum ficheiro de Eventos ou das áreas atribuídas à Claude foi editado.

## Grupo 1 — 001, 002, 005, 006, 007, 019, 021, 022

Primeira entrega visual: barra com rótulos, contexto separado dos atalhos, cartões compactos, fallback para imagem indisponível e copy de sol sem garantia temporal.

Ficheiros: `frontend/src/pages/discover/{DiscoverBar,ContextControls,RestaurantCard,FilterDrawer}.tsx`, `discoverModel.ts`, `discover.css` e testes de descoberta.

Verificações: typecheck passou; Vitest 452/452; build passou; contraste 172 verificações/0 falhas; caminhos protegidos contra `f2cea55` e `git diff --check` passaram. A mudança de copy foi observada primeiro a falhar em dois testes, depois a passar. Uma primeira execução npm na raiz falhou por não existir package.json; comandos seguintes foram executados em frontend.

Antes/depois de 001 e 021: `C:/Users/marti/seatplan-screenshots-codex/lote1-antes-depois/` (também contém referências ux-v2). Revisão visual feita nos dois tamanhos. O lote continua com contexto mobile, filtros e estados assíncronos.

## Grupo 2 — 003, 004, 008–015, 023–026, 029–030

Pesquisa/contexto mobile separados dos filtros; filtros com remoção individual; gaveta com scroll interno; sol/vista com significado conservador; horas concretas nos links; horas antigas desativadas durante atualização e respostas atrasadas ignoradas. A pesquisa, o contexto, a vista e o ponto da lista ficam nesta sessão; ao regressar são novamente consultadas as páginas necessárias (até 25 páginas), sem guardar disponibilidade nem links privados.

Ficheiros: descoberta e mapas; `frontend/e2e/discovery-ux.spec.ts`; uma expectativa do estado vazio na descoberta em `frontend/e2e/owner-publish-find.spec.ts` (nenhum fluxo de dono alterado).

Verificações: typecheck passou; Vitest 456/456; build passou; contraste 172/0. Primeira bateria Playwright: 75 passados/2 falhas (contraste transitório da gaveta e copy antiga no teste de descoberta após despublicar). A gaveta recebeu estrutura estável sem animação de entrada; a expectativa foi atualizada, mantendo todas as verificações.

Segunda bateria Playwright: 75/77; permaneceram o contraste da gaveta e uma falha no passo da cadeira em `restaurant.spec.ts:54` (área da Claude; passou na primeira bateria). A análise detalhada de axe identificou opacidade na animação do backdrop, não um token de cor incorreto. Desativou-se também essa animação apenas na gaveta da descoberta; não se alterou o componente partilhado. O teste de axe passou a fornecer os alvos e razões da falha, mantendo a exigência de zero violações.

## Grupo 3 — 070–071, 088–097

Implementado: identificação e retorno à área do dono; referência temporal sem clamp enganador; seleção ligada entre chegada/mesa; chegadas agrupadas e com scroll; mapa/lista; ações por estado; simulação independente; walk-in com contexto efetivo e recuperação de conflito; indicadores diários/históricos separados; prévia do otimizador com confirmação explícita; horário semanal com ações fixas, erros e rascunho preservado nas tabs.

Ficheiros: os nove componentes de staff permitidos, os seus testes, `staff.css` novo e as duas expectativas de staff no e2e misto `restaurant.spec.ts`. Nenhuma alteração em API, backend ou componentes partilhados.

Verificado: typecheck; 463 Vitest em 60 ficheiros (12.68 s); build (314 ms, aviso de bundle principal 508.07 kB, sem falha); contraste 172/0; dois novos e2e de staff passaram incluindo axe; matriz de 22 verificações de reflow passou em 320/390/768/1024/1440 e texto ampliado na gaveta; tema escuro/movimento reduzido capturados. Ruff check/format: 215 ficheiros, sem problemas. Regressão backend final ainda por correr neste checkpoint.

Primeira bateria com os dois novos e2e de staff: 77/79. Uma expectativa nova pressupunha que fora do serviço a API nunca propõe mesa; foi corrigida para verificar a prévia real e zero criação, preservando as regras do backend. O outro teste encontrou overflow real nos campos mobile do horário, corrigido com largura fluida. Bateria seguinte: 78/79, com falha por limite acumulado na reserva (`restaurant.spec.ts:16`), descrita nos pedidos à Claude. Sem correções fora do âmbito.

Capturas: 37 IDs em `C:/Users/marti/seatplan-screenshots-codex/`, com `index.html` antes/depois e `manifest.json`. 087 está explicitamente marcada como não alterada, por depender de Login.tsx. 091 inclui prova fora de serviço; 095 inclui prévia real e confirmação de oito movimentos, sem aplicar; 097 inclui fechos e ações de guardar.

## Grupo 4 — acabamento e prova 015, 025–026, 029–030

Pins com alvo de toque maior; hover, seleção e foco distintos; contexto e hora/grupo conservados também na ligação do resumo do mapa; “Close” no topo do resumo mobile e foco devolvido ao pin visível. O diagrama e o Leaflet oculto não disputam o foco. Os links dos cartões usam o contexto atual mesmo quando as horas antigas estão temporariamente desativadas.

O novo e2e de navegação do mapa falhou primeiro ao devolver foco ao Leaflet oculto. A correção escolhe o pin do diagrama visível e o teste passou, sem remover a asserção.

Playwright final, em duas fatias com servidores/bases isolados: `npm run e2e -- --shard=1/2`: 40 passados (56.4 s); `npm run e2e -- --shard=2/2`: 40 passados (54.2 s). Cada ficheiro conserva os seus fluxos e as asserções, sem retries. A falha por limite acumulado da execução única de 79 testes permanece registada; não se apresenta essa execução como verde.
