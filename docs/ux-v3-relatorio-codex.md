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
