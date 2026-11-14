# UX v3 — relatório final do Codex

14 de novembro de 2026. Trabalho na branch `codex/ux-v3-discovery-ops`, worktree `C:/Users/marti/seatplan-codex-ux`, base `f2cea55`.

## Entrega

| Lote | IDs | Resultado |
|---|---|---|
| Descoberta | 001–015, 019, 021–026, 029–030 | Alterações entregues: barra/contexto, cartões compactos, filtros, disponibilidade assíncrona segura, memória da pesquisa, mapa/lista e fallback acessível |
| Operação | 070–071, 088–097 | Alterações nos ficheiros permitidos entregues: referência temporal, chegadas/seleção, ações, walk-in, indicadores, otimização com confirmação e horário semanal |
| Login staff | 087 | Não alterado: depende de `Login.tsx`, reservado à Claude |
| Eventos | 098–102 | Só regressão, conforme instruído; nenhuma proposta visual aplicada |

Subsistem ajustes de copy nos componentes partilhados de 089–091/090 e o caso de metadados de um rascunho visto como staff. Estão discriminados em `docs/ux-v3-pedidos-ao-claude.md`; não foram feitas alterações fora da divisão de ficheiros.

## O que mudou

- Pesquisa/contexto numa linha própria e ambiente noutra; cartões horizontais compactos, fallback para fotografias indisponíveis e desktop lista/mapa 60/40. No telemóvel, contexto e filtros têm diálogos separados e o mapa apresenta um resumo com ligação e fecho acessível.
- “Has sunny tables” e “Tables with a view” descrevem características do espaço; a luz da mesa confirma-se na reserva. Filtros avançados aparecem como chips removíveis e a origem da distância é explícita.
- Durante uma consulta nova, as horas antigas ficam desativadas e identificadas como atualização. Respostas antigas não substituem a consulta vigente. Cada hora liga ao seu próprio slot. Os links do cartão e do resumo conservam o contexto atual.
- Critérios, vista e ponto da lista ficam na sessão da tab; disponibilidade é novamente consultada. Regressar restaura até 25 páginas de 20 resultados, sem guardar links privados ou dados de clientes.
- Hora do serviço sem clamp enganador: “Live now” / “Viewing…”, serviço e referência efetiva. Abrir um walk-in fixa a referência, mostra data/hora/grupo e avisa fora do serviço. Prévia não cria reserva; conflito exige nova proposta e conserva necessidades.
- Chegadas com grupos por hora/serviço e scroll próprio; seleção ligada à mesa; lista alternativa ao mapa. Ações por estado, cancelamento separado e foco conservado durante pedidos.
- Indicadores diários separados do histórico; sem amostra mostra “No data”. Sugestão e fórmula ficam distintas de decisões manuais.
- Otimizador identifica data/serviço, mostra antes/depois e contagem protegida, exige confirmação de N movimentos e invalida a prévia ao mudar contexto. Exact check fica num detalhe. A API só fornece nomes de mesas para os movimentos: aplica-se a variante de lista, sem inventar geometria.
- Horário explicitamente semanal, secções com navegação, erros junto das linhas, ações fixas e rascunho mantido entre tabs. O dia de visualização não altera a recorrência. A entrada do dono identifica também rascunhos pelo perfil privado já existente.

## Verificação final

| Comando / prova | Resultado |
|---|---|
| Backend: `ruff check .` | Passou |
| Backend: `ruff format --check .` | 215 ficheiros, passou |
| Backend: `python -m pytest -q -o addopts= -p no:cacheprovider --basetemp <pasta temporária nova>` | **880 passados, 3 avisos, 167.81 s**, SQLite isolado; sem repetir testes |
| `npm run typecheck` | Passou |
| `npm test` | **464 passados, 60 ficheiros, 12.50 s** |
| `npm run build` | Passou; permanece aviso de bundle principal superior a 500 kB (cerca de 508 kB) |
| `npm run contrast` | **172 verificações, 0 falhas** |
| `npm run e2e -- --shard=1/2` | **40 passados, 56.4 s**, após a correção final do foco no diagrama |
| `npm run e2e -- --shard=2/2` | **40 passados, 54.2 s** |
| E2E dirigido após o ajuste do perfil privado do dono | **6 passados, 14.4 s**: staff/owner, walk-in, horário e axe |
| Matriz de browser externa | **22 verificações sem overflow**: 320/390/768/1024/1440 px, filtros a 200% de texto, staff escuro e movimento reduzido |
| Caminhos protegidos, bases `main` e `f2cea55`; `git diff --check` | Passaram |

Python/Ruff: `C:/Users/marti/seatplan/.venv/Scripts/`. Frontend verificado nesta worktree, com `E2E_API_PORT=8877`, `E2E_WEB_PORT=4429` e `E2E_PYTHON=C:/Users/marti/seatplan/.venv/Scripts/python.exe`.

As duas fatias Playwright usam servidores e bases novas, conservando os ficheiros de teste, as suas sequências e as asserções, sem retries. Incluem convites de Eventos, links partilhados, contas, atribuição, organizador e mobile. A suite completa do backend inclui igualmente os testes de Eventos. Não foi necessário repetir a corrida conhecida do registo.

### Falhas observadas durante o trabalho

- Primeira integração de descoberta: 75/77 Playwright. Contraste durante a animação do backdrop e uma expectativa com a copy antiga do estado vazio. Corrigidos sem alterar o componente partilhado nem reduzir a exigência de zero violações.
- Segunda integração: 75/77; o contraste foi localizado com os alvos de axe e corrigido. O passo de cadeira falhou nessa execução, mas passou nas execuções posteriores; não se alterou o fluxo da reserva.
- Primeira bateria com os novos e2e de staff: 77/79. Uma expectativa nova pressupunha que fora de serviço a API nunca propõe mesa; passou a verificar a resposta real e zero criação. O outro teste encontrou overflow real no horário mobile, corrigido.
- Execução única de 79 testes: **78 passaram e 1 falhou** em `frontend/e2e/restaurant.spec.ts:16`. O mapa mostrava “Too many attempts. Please wait a moment.”, pelo que “Choose for me” não existia. **Essa execução não está verde**; permanece uma questão de isolamento/orçamento de pedidos da bateria integrada. Nenhum limite do backend foi alterado ou contornado.
- O novo e2e do mapa encontrou um erro real no retorno de foco: era escolhido o marcador Leaflet oculto em vez do pin do diagrama. Corrigido e confirmado no fecho da fatia 1: 40/40.
- As falhas de reflow detetadas na matriz foram corrigidas nos CSS permitidos: cabeçalho que quebra linha a 200%, chips que quebram texto, campos fluidos e contenção das etiquetas ocultas da tabela.

## Capturas e ensaio

Fora do repositório: `C:/Users/marti/seatplan-screenshots-codex/`.

- `lote1-antes-depois/index.html`: antes/depois de **001 e 021**, capturados a partir da base branca `f2cea55`; as referências originais ux-v2 estão separadas.
- `index.html` e `manifest.json`: **37 IDs** da divisão recebida, com referências e imagens finais. 087 está explicitamente marcada como não alterada.
- `lote1-final/`: 24 capturas da descoberta. `lote4-final/`: 13 capturas de operação, incluindo 087 apenas como referência de dependência.
- Provas adicionais: `025-320px-text-200.png`, `088-dark-reduced-motion.png`, `091-outside-service.png`, `095-confirmation.png` e `097-closed-days-and-save.png` (as três últimas em `lote4-final/`).
- `qa-matrix.json`: matriz de reflow. Inspeção visual das capturas principais, do contexto mobile, da gaveta ampliada, do walk-in fora de serviço e da confirmação do otimizador.

A prévia real da captura 095 apresentou **8 movimentos** e o diálogo de confirmação; o ensaio fechou o diálogo sem aplicar. A regressão e2e verifica separadamente o walk-in confirmado. Os dados capturados são os exemplos fictícios do seed, numa base temporária; não foram capturados links privados de gestão.

## Pendentes concretos

1. **087 — Claude / `Login.tsx`:** copy de entrada do staff e destino seguro. Ficheiro fora do meu âmbito.
2. **090 — Claude / `SelectionPanel.tsx`:** substituir “Guest chose seat …” por “Chair requested: …”. As necessidades e ações já são apresentadas; falta a terminologia partilhada.
3. **089–091 — Claude / `WhatIf.tsx`:** substituir “right now” por referência à hora selecionada. Os diálogos novos já mostram data/hora efetiva; a copy interna continua no componente reservado.
4. **Staff num rascunho:** o floor não devolve nome/timezone e o perfil público não existe. A entrada do dono usa o perfil privado; o staff mantém ID e aviso do relógio do dispositivo. Um contrato futuro pode completar este caso sem alargar permissões.
5. **Bateria única:** orçamento acumulado dos pedidos pode atingir o limite público; as duas fatias isoladas passaram. Não se aumentaram limites nem se introduziram sleeps/retries para esconder a falha.

As decisões e variantes conservadoras estão em `docs/ux-v3-decisoes-codex.md`.

## Commits de implementação

- `35a62ca` — barra e cartões (001, 002, 005–007, 019, 021, 022).
- `11a6140` — contexto, filtros e disponibilidade (003, 004, 008–015, 023–026, 029, 030).
- `49e0831` — operação (070, 071, 088–097).
- `dc22340` — foco, seleção e reflow do mapa (015, 025, 026, 029, 030).
- O ajuste final da identificação de rascunhos do dono e este relatório seguem no commit de fecho (070, 071, regressão 098–102).

Sem push, PR ou merge. Nenhuma edição nos checkouts principal/Claude, nos caminhos dos Eventos, em backend ou nos testes de desempenho. Sem dependências, fontes ou cores literais novas na aplicação. Servidores de ensaio terminados.

## Ficheiros alterados desde a base

- `docs/ux-v3-decisoes-codex.md`
- `docs/ux-v3-pedidos-ao-claude.md`
- `docs/ux-v3-relatorio-codex.md`
- `frontend/e2e/discovery-ux.spec.ts`
- `frontend/e2e/discovery.spec.ts`
- `frontend/e2e/owner-publish-find.spec.ts`
- `frontend/e2e/restaurant.spec.ts`
- `frontend/e2e/staff-ux.spec.ts`
- `frontend/src/maps/ResultsMap.tsx`
- `frontend/src/maps/SchematicMap.tsx`
- `frontend/src/maps/maps.css`
- `frontend/src/pages/discover/ContextControls.tsx`
- `frontend/src/pages/discover/DiscoverBar.tsx`
- `frontend/src/pages/discover/DiscoverPage.test.tsx`
- `frontend/src/pages/discover/DiscoverPage.tsx`
- `frontend/src/pages/discover/FilterDrawer.tsx`
- `frontend/src/pages/discover/PublicHeaderActions.tsx`
- `frontend/src/pages/discover/RestaurantCard.tsx`
- `frontend/src/pages/discover/discover.css`
- `frontend/src/pages/discover/discoverModel.test.ts`
- `frontend/src/pages/discover/discoverModel.ts`
- `frontend/src/pages/discover/discoveryState.ts`
- `frontend/src/pages/restaurant/BookingActions.tsx`
- `frontend/src/pages/restaurant/FloorLists.tsx`
- `frontend/src/pages/restaurant/MoveDialog.tsx`
- `frontend/src/pages/restaurant/StaffDashboard.tsx`
- `frontend/src/pages/restaurant/StaffFloor.tsx`
- `frontend/src/pages/restaurant/StaffOptimise.tsx`
- `frontend/src/pages/restaurant/StaffPage.tsx`
- `frontend/src/pages/restaurant/StaffSchedule.tsx`
- `frontend/src/pages/restaurant/WalkinDialog.tsx`
- `frontend/src/pages/restaurant/__tests__/staff-ux.test.tsx`
- `frontend/src/pages/restaurant/__tests__/staff.test.tsx`
- `frontend/src/pages/restaurant/staff.css`
