# UX v5 — relatório final do Codex

Concluídos os 11 ecrãs atribuídos, com capturas reais, comparação lado a lado e percursos verificados. Trabalho exclusivamente em `C:\Users\marti\seatplan-codex-ux5`, branch `codex/ux-v5-discovery-staff`, a partir de `c8c75f2` da `claude/ux-v5`.

Sem push, PR ou merge. Não foram alterados o backend, os contratos, dependências, ficheiros de Eventos ou componentes partilhados reservados. Em `BookingPage.tsx` mudou apenas a linha autorizada que desenha `STEP.time`.

## Commits

| Commit | Entrega |
|---|---|
| `b765515` | Descoberta 001, 004, 021, 024, 026 |
| `0f422fe` | Página pública e When 031, 034, 054 |
| `cb4c4c3` | Staff 088, 090, 091; verificação de contextos e ajustes visuais finais |

## Capturas e percursos

Todos os PNGs estão fora do repositório. A comparação navegável é `C:\Users\marti\seatplan-screenshots-codex-v5\comparison.html`; cada `compare-<ID>.png` mostra referência e implementação lado a lado. Desktop: 1440×900; telemóvel: 390×844.

| ID | Captura implementada | Percurso verificado | Diferenças materiais / limitações |
|---|---|---|---|
| 001 | `C:\Users\marti\seatplan-screenshots-codex-v5\001.png` | Cidade, data, hora e grupo; Find a table leva o foco aos resultados; nome/foto abrem a página e cada horário conserva date/time/party exatos. | Cinco restaurantes reais do seed, ordem por distância, ilustrações da API e mapa OpenStreetMap; não são as quatro fotografias/zonas ilustrativas do mockup. |
| 004 | `C:\Users\marti\seatplan-screenshots-codex-v5\004.png` | Termo ativo no vazio; Clear search term preserva cidade/data/hora/grupo/acessibilidade; Edit filters permite recuperação. | Mapa real e ícone existente de estado vazio. Com disponibilidade sem resultados, a ação é Change time. |
| 021 | `C:\Users\marti\seatplan-screenshots-codex-v5\021.png` | Contexto móvel, filtros, cartões verticais, horários utilizáveis, visita e regresso à pesquisa. | Dados/fotos reais do seed; alvos móveis de horário de 44 px. Campo de pesquisa sempre editável. |
| 024 | `C:\Users\marti\seatplan-screenshots-codex-v5\024.png` | Rascunho de filtros; Apply confirma; Cancel/Escape descarta; foco volta ao controlo de abertura. Rodapé disponível a 390 e 320 px. | API não suporta filtro de high chairs: explica que o pedido é feito ao reservar. Cuisine/Price são expansíveis; Availability pode exigir scroll, mantendo Apply fixo. |
| 026 | `C:\Users\marti\seatplan-screenshots-codex-v5\026.png` | Pin numerado e cartão correspondentes; horários exatos; seleção conservada em Lista/Mapa e após navegar; fecho devolve foco; fallback por falha dos mosaicos. | Mapa real mais detalhado que o desenho ilustrativo. Seleção terracota; número e estado acessível distinguem o pin. |
| 031 | `C:\Users\marti\seatplan-screenshots-codex-v5\031.png` | Nome/endereço primeiro; galeria e reserva lado a lado; galeria/lightbox e preview privado preservados; CTA de reserva junto ao nome no telemóvel. | Endereço e ilustrações do seed. A hora exata é escolhida na própria etapa When ao ver os horários, em vez de acrescentar um seletor inicial sem ligação ao controlador partilhado. |
| 034 | `C:\Users\marti\seatplan-screenshots-codex-v5\034.png` | Data/grupo/requisitos e horários na mesma etapa When; selecionar não avança; Choose a table at HH:MM só avança com hora utilizável. Alterar data bloqueia disponibilidade antiga durante a carga. | Jantar real tem 16 horários, por isso o cartão é mais alto que as dez opções do mockup. Serviços expansíveis; CTA de largura total. Data/grupo atuais ficam nos controlos editáveis, sem resumo lateral duplicado. |
| 054 | `C:\Users\marti\seatplan-screenshots-codex-v5\054.png` | Hora original, aviso antes dos controlos, alternativas com diferença em minutos, seleção explícita, See all service times; preserva requisitos. | Captura real: pedido das 18:00, Dinner starts at 19:00 e alternativas reais. Teste de componente cobre perda das 20:00 com 19:45/20:15. Não se falsificou disponibilidade para reproduzir a fotografia. |
| 088 | `C:\Users\marti\seatplan-screenshots-codex-v5\088.png` | Planta e chegadas no mesmo viewport; inspeção de hora, Change floor time e Return to now; vista Lista com seleção e ações equivalentes. | Casa Lumen e geometria real do endpoint de staff; API não entrega as salas do mapa do cliente, pelo que não foram inventadas tabs River hall/Quay terrace. Quatro destinos de navegação existentes. |
| 090 | `C:\Users\marti\seatplan-screenshots-codex-v5\090.png` | Seleção de chegada realça grupo/mesa(s); cartão Confirmed, Seat now primário, More actions revela mover/no-show/cancelar conforme o estado. | Fábio Bastos, Table T1, dados reais. Não se inventou Due soon nem um pedido de cadeira que o grupo não fez; seleção usa também contorno/estado acessível. |
| 091 | `C:\Users\marti\seatplan-screenshots-codex-v5\091.png` | Diálogo com data/hora/serviço efetivos, grupo/requisitos; Find a table só sugere, Seat at confirma; Cancel/X/Escape restauram foco. | Diálogo de cerca de 448×506 px, ligeiramente mais alto para explicitar a prévia e manter controlos de 44 px. Testados serviço fechado, sem mesa e falha depois da sugestão. |

O símbolo e a navegação partilhados mantêm a implementação da base; esses ficheiros pertencem à Claude. Não foram fabricados nomes de bairros, river views, capacidades ou estados de reserva.

Capturas adicionais: `054-narrow.png` e `088-narrow-list.png`, a 320×844. Scripts de captura, ensaio e logs também estão na pasta externa.

## Verificação final

| Comando / ensaio | Resultado |
|---|---|
| `ruff check backend` | Passou |
| `ruff format --check backend` | 215 ficheiros conformes |
| `python -m pytest -q --basetemp=<pasta exclusiva>` em backend | 880 testes passaram; inclui Eventos |
| `npm run typecheck` | Passou |
| `npm test` | 495 testes passaram, 67 ficheiros; base tinha 487 |
| `npm run build` | Passou; aviso existente sobre bundle maior que 500 kB |
| `npm run contrast` | 172 verificações, zero falhas |
| `npm run e2e` com API 8877 / web 4429 | 83 passaram, 1,9 min; inclui Eventos, axe, mobile, reservas e staff |
| `scripts/check_forbidden_paths.py --base main` | Caminhos de Eventos intactos; executado antes de cada commit |
| `git diff --check` | Passou |
| Ensaio real `verify-roundtrip.cjs` | Pesquisa, acessibilidade, cidade/data/grupo, URLs exatas, pin/cartão, seleção em Lista/Mapa, regresso e scroll restaurados, sem overflow a 320 px |

Logs finais copiados para `C:\Users\marti\seatplan-screenshots-codex-v5\verification\`. Resultado do ensaio: `roundtrip-result.log` na pasta principal das capturas.

A primeira execução pytest foi interrompida porque a pasta temporária partilhada devolvia WinError 5; a execução completa numa pasta exclusiva passou. Os testes conhecidos de concorrência/relógio não exigiram repetição isolada. As falhas de Playwright durante a adaptação foram corrigidas (títulos, abertura explícita dos controlos e preview privado); a bateria final inteira passou, sem retries nem alteração de limites de pedidos. O ensaio adicional aguardou o fallback de mosaicos por 20 s, em vez dos 5 s iniciais.

## Pendentes para o Martim / integração

Não ficou nenhum dos 11 IDs bloqueado. As limitações de dados estão descritas na tabela e em `ux-v5-decisoes-codex.md`: filtro de high chairs, salas na planta de staff e imagens/detalhes específicos do mockup não estão disponíveis pela mesma API. Foram mantidas adaptações funcionais conservadoras, sem backend novo.

A integração com a branch da Claude continua a cargo do Martim. Preservar a alteração de uma linha autorizada em BookingPage.tsx e os seletores atualizados dos testes. Nenhuma mudança obrigatória a ficheiros da Claude: `ux-v5-pedidos-ao-claude.md` identifica a base partilhada preservada.

Pré-visualização local deste worktree: `http://127.0.0.1:4429/` (API em 8877). É uma pré-visualização local, sem deployment remoto.

## Ficheiros alterados desde c8c75f2
- `docs/ux-v5-decisoes-codex.md`
- `docs/ux-v5-pedidos-ao-claude.md`
- `docs/ux-v5-relatorio-codex.md`
- `frontend/e2e/accessibility.spec.ts`
- `frontend/e2e/discovery-ux.spec.ts`
- `frontend/e2e/discovery.spec.ts`
- `frontend/e2e/owner-publish-find.spec.ts`
- `frontend/e2e/restaurant-ambience-booking.spec.ts`
- `frontend/e2e/restaurant-ambience.spec.ts`
- `frontend/e2e/restaurant-fixture.ts`
- `frontend/e2e/restaurant-journey-mobile.spec.ts`
- `frontend/e2e/restaurant.spec.ts`
- `frontend/e2e/staff-ux.spec.ts`
- `frontend/src/maps/ResultsMap.tsx`
- `frontend/src/maps/maps.css`
- `frontend/src/maps/schematic.ts`
- `frontend/src/pages/discover/ContextControls.tsx`
- `frontend/src/pages/discover/DiscoverBar.tsx`
- `frontend/src/pages/discover/DiscoverPage.test.tsx`
- `frontend/src/pages/discover/DiscoverPage.tsx`
- `frontend/src/pages/discover/DiscoverV5.test.tsx`
- `frontend/src/pages/discover/FilterDrawer.tsx`
- `frontend/src/pages/discover/RestaurantCard.tsx`
- `frontend/src/pages/discover/discover.css`
- `frontend/src/pages/discover/discoveryState.ts`
- `frontend/src/pages/restaurant-public/RestaurantPage.test.tsx`
- `frontend/src/pages/restaurant-public/RestaurantPage.tsx`
- `frontend/src/pages/restaurant-public/restaurantPage.css`
- `frontend/src/pages/restaurant/BookingActions.tsx`
- `frontend/src/pages/restaurant/BookingPage.tsx`
- `frontend/src/pages/restaurant/FloorLists.tsx`
- `frontend/src/pages/restaurant/SelectionPanel.tsx`
- `frontend/src/pages/restaurant/SlotButton.tsx`
- `frontend/src/pages/restaurant/StaffFloor.tsx`
- `frontend/src/pages/restaurant/StaffPage.tsx`
- `frontend/src/pages/restaurant/StaffV5.test.tsx`
- `frontend/src/pages/restaurant/StepParty.tsx`
- `frontend/src/pages/restaurant/StepTime.tsx`
- `frontend/src/pages/restaurant/WalkinDialog.tsx`
- `frontend/src/pages/restaurant/WhenV5.test.tsx`
- `frontend/src/pages/restaurant/__tests__/ambience.test.tsx`
- `frontend/src/pages/restaurant/__tests__/booking.test.tsx`
- `frontend/src/pages/restaurant/__tests__/chooseSeat.test.tsx`
- `frontend/src/pages/restaurant/__tests__/detailsPanel.test.tsx`
- `frontend/src/pages/restaurant/__tests__/prefs.test.tsx`
- `frontend/src/pages/restaurant/__tests__/staff-ux.test.tsx`
- `frontend/src/pages/restaurant/__tests__/staff.test.tsx`
- `frontend/src/pages/restaurant/__tests__/tableCard.test.tsx`
- `frontend/src/pages/restaurant/staff.css`
- `frontend/src/pages/restaurant/useLinkedTime.ts`
- `frontend/src/pages/restaurant/when.css`
- `docs/superpowers/plans/relatorio-noite.md` (índice deste fecho)
