# Plano de implementação dos restaurantes

Aprovado por Martim em 2026-11-13 durante a preparação. Fonte de verdade em docs/superpowers/specs/2026-11-13-restaurantes-plataforma-design.md. Execução autónoma autorizada na branch martim/restaurantes-impl, um commit por tarefa. Dependências do Sérgio necessárias ao trabalho do Martim serão executadas e identificadas no relatório.

## Verificação e leitura concluídas

Branch inicial martim/restaurantes-spec e base main 767fbb6. Identidade local definida como Martim Gonçalves e 278824942+martimgoncalves2002-rgb@users.noreply.github.com. GitHub martimgoncalves2002-rgb com push=true. Python 3.13.2, Node 24.16.0 e npm 11.13.0. Venv e node_modules existentes.

Ruff passou, typecheck passou e Vitest deu 209 passed em 23 ficheiros. Pytest inicial terminou com uma falha conhecida em test_guest_register.py::test_two_verifies_at_once_make_one_account. O rerun isolado deu 1 passed, 1 warning in 1.07s. Foi necessária uma pasta temporária nova e desativar cache por permissões em diretórios da sessão anterior. Esta exceção foi autorizada por Martim. Qualquer outra falha durante implementação exige recuperar o último commit verde na branch de implementação, registar o ocorrido e continuar na tarefa seguinte, conforme instrução posterior.

Chromium instalado e npm run e2e deu 23 passed (24.8s), com desktop e mobile 390x844. Usou E2E_PYTHON apontado para .venv\Scripts\python.exe. Postgres não configurado para testes nesta sessão.

Foram lidos integralmente spec, README.md, docs/CONTRACT.md, docs/team/tasks.md e os oito READ_ME_FIRST.md pedidos. Os 18 grupos de ficheiros/funções da secção 2 existem, incluindo build_map, save_layout, TableSpec/PartySpec/ScoreBreakdown, recommend_table/assign_service/whatif_walkin, quatro queue_* de email, PictureRoom/render_seat_picture e helpers de accounts. As rotas e estados atuais correspondem à descrição.

Diferenças confirmadas no código

- A demo chama-se Casa Lumen, enquanto a secção 13 refere Casa Linho.
- seatPositions para row coloca cadeiras na linha central. O balcão exige adaptação no editor novo.
- put_layout devolve 409 genérico, sem lista de mesas, ao contrário da descrição da secção 6.10.
- load_for_staff permite atualmente todos os restaurantes ao papel staff, como previsto no risco. routers/venues.py também permite esse acesso e constitui um caminho alternativo a avaliar.
- A chave atual do ScoreBreakdown tem três elementos e testes existentes exigem literalmente esse formato.
- README e deployment ainda dizem que nunca houve deploy, divergindo do contexto fornecido pelo Martim.

## Restrições e verificação comuns

O grupo G de caminhos proibidos aplica-se a TODAS as tarefas

- frontend/src/pages/events/**
- frontend/src/pages/editor/**
- frontend/src/pages/join/**
- frontend/src/pages/account/**
- backend/app/events_service/**
- backend/app/routers/events.py
- backend/app/routers/attendee.py
- backend/app/routers/guest_*.py
- backend/app/routers/visitor.py

Importar useHistory/useUnsavedGuard e helpers existentes é permitido sem editar os respetivos ficheiros. core/layout.py e o comportamento do editor/API de eventos ficam preservados. Alterações partilhadas só nos ficheiros explicitamente indicados pela tarefa. models.py/migrate.py pertencem à tarefa 2 e SeatMap.tsx à 27. api/types.ts, App.tsx e documentação partilhada editam-se em sequência. Paralelo significa trabalho independente de Martim e Sérgio em worktrees separadas, com exclusão de ficheiros partilhados.

Cada tarefa começa com o guia do módulo e os testes públicos da funcionalidade. Para funções puras e segurança, executar teste novo e observar falha antes da implementação. Adicionar testes em backend/tests/test_<funcionalidade>.py ou junto dos componentes TS indicados. Cada tarefa atualiza o READ_ME_FIRST.md afetado e a documentação API/modelo quando aplicável, e relatorio-noite.md.

Comandos comuns antes de CADA commit, a partir das pastas indicadas

| Código | Pasta | Comando |
|---|---|---|
| G | raiz | .\.venv\Scripts\python.exe scripts/check_forbidden_paths.py --base main |
| B1 | backend | ..\.venv\Scripts\ruff.exe check . |
| B2 | backend | ..\.venv\Scripts\ruff.exe format --check . |
| B3 | backend | ..\.venv\Scripts\python.exe -m pytest -q |
| F1 | frontend | npm run typecheck |
| F2 | frontend | npm test |
| F3 | frontend | npm run build |
| F4 | frontend | npm run contrast |
| E | frontend | npm run e2e |

B3 admite apenas o rerun isolado do teste conhecido, se for a única falha. Por permissões de ficheiros temporários, pode usar --basetemp com diretório novo e -p no:cacheprovider, registando a variante real. Para E definir E2E_PYTHON com caminho absoluto do Python do venv. UI exige F3/F4/E e verificação visual desktop e 390x844. Dias 1, 5 e 8 e revisão final exigem bateria integral. Backend local usa DEMO_MODE=1, migração/seed e uvicorn app.main:create_app --factory --port 8000. Frontend usa npm run dev. Testes usam bases temporárias. Preservar bases locais com dados.

## Tarefas por ordem

Dias de referência da secção 13, com fundações antecipadas segundo autorização de Martim. As dependências explicitadas determinam a ordem efetiva.

### Tarefa 0 — Preparação e proteção dos eventos

- **Dono** — Martim.
- **Spec** — Secções 0.1.
- **Depende de** — nenhuma.
- **Criar/alterar** — AGENTS.md, scripts/check_forbidden_paths.py, backend/tests/test_forbidden_paths.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Script recusa alterações, remoções e renomeações de caminhos protegidos e recusa main.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 1 — Contratos de dados e compatibilidade

- **Dono** — Sérgio.
- **Spec** — Secções 6.10,7.5,9.3,11,13.
- **Depende de** — 0.
- **Criar/alterar** — docs/CONTRACT.md, docs/decisions-log.md e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Formatos, limites, erros e decisões pendentes documentados.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 2 — Modelo de dados e migração repetível

- **Dono** — Sérgio.
- **Spec** — Secções 6.11,11.
- **Depende de** — 1.
- **Criar/alterar** — backend/app/models.py, backend/app/seed/migrate.py, backend/app/routers/venues.py (compatibilidade do formato antigo), backend/tests/test_migrate_restaurants.py, backend/tests/fixtures/schema_2026_11_13.*.sql e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Migra duas vezes sem alterar dados antigos e preserva reservas e eventos.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr com 3 e 4, sem editar os mesmos ficheiros

### Tarefa 3 — Geometria pura do contorno

- **Dono** — Martim.
- **Spec** — Secções 6.1,6.3,6.5,7.1.
- **Depende de** — 1.
- **Criar/alterar** — backend/app/ambience/geometry.py, backend/tests/test_ambience_geometry.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Arcos, orientação, área, normais e pontos interiores corretos com casos conhecidos e hypothesis.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Após contratos, pode correr com 2

### Tarefa 4 — Posição e horas do sol

- **Dono** — Martim.
- **Spec** — Secções 7.1,7.2.
- **Depende de** — 3.
- **Criar/alterar** — backend/app/ambience/solar.py, backend/tests/test_ambience_solar.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Casos Lisboa verão/inverno e Tromsø da secção 7.2 verificados com NOAA e zoneinfo.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Após contratos, pode correr com 2

### Tarefa 5 — Conta de dono e isolamento

- **Dono** — Sérgio.
- **Spec** — Secções 5.1.
- **Depende de** — 2.
- **Criar/alterar** — backend/app/restaurant_service/owner_accounts.py, backend/app/routers/owners.py, backend/app/restaurant_service/venue_access.py, backend/app/main.py, backend/tests/test_owner_accounts.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Registo com código, limites e 404 uniforme entre donos e staff apenas demo.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 6 — Lista dos restaurantes e login do dono

- **Dono** — Sérgio.
- **Spec** — Secções 5.2.
- **Depende de** — 5.
- **Criar/alterar** — frontend/src/pages/owner/OwnerHomePage.tsx, frontend/src/pages/owner/OwnerSignUpPage.tsx, frontend/src/pages/Login.tsx, frontend/src/api/owner.ts, frontend/src/App.tsx e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Dono regista-se, entra e vê apenas os seus restaurantes e progresso.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 7 — Modelo imutável e geometria TS do editor

- **Dono** — Martim.
- **Spec** — Secções 6.1,6.3,6.10.
- **Depende de** — 3.
- **Criar/alterar** — frontend/src/pages/room-editor/roomModel.ts, frontend/src/pages/room-editor/geometry.ts, frontend/src/pages/room-editor/geometry.test.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Fixtures geométricas coincidem com Python e todas as operações preservam o histórico.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 8 — Estrutura do editor e salas

- **Dono** — Martim.
- **Spec** — Secções 6.2,6.3,6.12.
- **Depende de** — 7,6.
- **Criar/alterar** — frontend/src/pages/room-editor/RoomEditorPage.tsx, frontend/src/pages/room-editor/RoomCanvas.tsx, frontend/src/pages/room-editor/room-editor.css, frontend/src/App.tsx e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Criar retângulo, L e desenho livre com grelha, réguas e desfazer/refazer.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 9 — Contornos curvos e propriedades acessíveis

- **Dono** — Martim.
- **Spec** — Secções 6.3,6.12.
- **Depende de** — 8.
- **Criar/alterar** — frontend/src/pages/room-editor/ShapeTools.tsx, frontend/src/pages/room-editor/RoomProperties.tsx, frontend/src/pages/room-editor/roomModel.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Mover, inserir e remover cantos e editar lados e flechas por gesto e formulário.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 10 — Aberturas e orientação

- **Dono** — Martim.
- **Spec** — Secções 6.4,6.5.
- **Depende de** — 9.
- **Criar/alterar** — frontend/src/pages/room-editor/WallTools.tsx, frontend/src/pages/room-editor/NorthTools.tsx, frontend/src/pages/room-editor/roomModel.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Janelas, portas, vidro e norte com normais corretas em arcos e sem sobreposição.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 11 — Elementos fixos e zonas

- **Dono** — Martim.
- **Spec** — Secções 6.6,6.7.
- **Depende de** — 10.
- **Criar/alterar** — frontend/src/pages/room-editor/FixtureTools.tsx, frontend/src/pages/room-editor/ZoneTools.tsx, frontend/src/pages/room-editor/roomModel.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Todos os tipos definidos no spec criados e editados com desfazer.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 12 — Perfil, slug e localização

- **Dono** — Sérgio.
- **Spec** — Secções 5.3.
- **Depende de** — 6.
- **Criar/alterar** — backend/app/restaurant_service/profiles.py, backend/app/routers/owners.py, frontend/src/pages/owner/NewRestaurantWizard.tsx, frontend/src/pages/owner/ProfilePage.tsx, frontend/src/maps/LeafletMap.tsx, frontend/package.json, frontend/package-lock.json, backend/app/main.py, vercel.json e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Guardar e retomar Identity/Location com slug único, validação e mapa e geolocalização por ação explícita.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 13 — Fotos seguras e galeria do dono

- **Dono** — Sérgio.
- **Spec** — Secções 5.5.
- **Depende de** — 12.
- **Criar/alterar** — backend/app/restaurant_service/photos.py, backend/app/routers/photos.py, backend/app/main.py, frontend/src/pages/owner/PhotoEditor.tsx, frontend/src/pages/owner/photoResize.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — PDF disfarçado recusado, limites e isolamento, capa e ordem e redimensionamento corretos.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 14 — Mesas e cadeiras no editor

- **Dono** — Martim.
- **Spec** — Secções 6.8.
- **Depende de** — 11.
- **Criar/alterar** — frontend/src/pages/room-editor/TableTools.tsx, frontend/src/pages/room-editor/tableModel.ts, frontend/src/pages/room-editor/tableModel.test.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Quatro formas, cadeiras editáveis e balcão com cadeiras de um lado, flags e grupos.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 15 — Gestos e seleção múltipla

- **Dono** — Martim.
- **Spec** — Secções 6.8,6.12.
- **Depende de** — 14.
- **Criar/alterar** — frontend/src/pages/room-editor/RoomCanvas.tsx, frontend/src/pages/room-editor/selection.ts, frontend/src/pages/room-editor/selection.test.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Alinhar, distribuir, duplicar, rodar e atalhos com equivalentes táteis.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 16 — Validação browser e servidor

- **Dono** — Martim.
- **Spec** — Secções 6.9.
- **Depende de** — 15.
- **Criar/alterar** — backend/app/ambience/validation.py, backend/tests/test_room_validation.py, frontend/src/pages/room-editor/validation.ts, frontend/src/pages/room-editor/validation.test.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Erros e avisos da secção 6.9 coincidem nos dois lados, incluindo mesas rodadas e curvas.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 17 — Guardar salas em transação e sala implícita

- **Dono** — Martim.
- **Spec** — Secções 6.10,6.11.
- **Depende de** — 16,5,2.
- **Criar/alterar** — backend/app/restaurant_service/rooms.py, backend/app/routers/owner_rooms.py, backend/app/main.py, backend/tests/test_owner_rooms.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Upsert seguro por id/key, ids alheios recusados, versão atómica 409, vizinhos reconstruídos e reserva protegida.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 18 — Persistência do editor e recuperação local

- **Dono** — Martim.
- **Spec** — Secções 6.10.
- **Depende de** — 17.
- **Criar/alterar** — frontend/src/api/rooms.ts, frontend/src/pages/room-editor/useRoomDraft.ts, frontend/src/pages/room-editor/RoomEditorPage.tsx e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Guardar/recarregar mantém layout e conflito entre separadores conserva rascunho com restore/discard.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 19 — Horário e publicação

- **Dono** — Sérgio.
- **Spec** — Secções 5.3,9.1.
- **Depende de** — 18,13.
- **Criar/alterar** — backend/app/restaurant_service/publishing.py, backend/app/routers/owners.py, frontend/src/pages/owner/HoursPage.tsx, frontend/src/pages/owner/PublishReview.tsx e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Publicação valida localização, horário, mesas e norte e devolve problemas com links e features.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 20 — Editor móvel e acessibilidade

- **Dono** — Martim.
- **Spec** — Secções 6.2,6.12,16.
- **Depende de** — 18.
- **Criar/alterar** — frontend/src/pages/room-editor/RoomEditorPage.tsx, frontend/src/pages/room-editor/RoomProperties.tsx, frontend/src/pages/room-editor/room-editor.css, frontend/e2e/room-editor.spec.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — A 390x844 criar sala 10x7, curva, duas janelas, norte, bar e oito mesas e guardar/recarregar.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 21 — Luz e manchas de sol

- **Dono** — Martim.
- **Spec** — Secções 7.3,7.4.
- **Depende de** — 4,3.
- **Criar/alterar** — backend/app/ambience/light.py, backend/app/ambience/models.py, backend/tests/test_ambience_light.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Regras auto/never/between, altitude, orientação, exterior e toldos respeitam critérios 7.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 22 — Ambiente por mesa e frases

- **Dono** — Martim.
- **Spec** — Secções 7.5.
- **Depende de** — 21.
- **Criar/alterar** — backend/app/ambience/table.py, backend/app/ambience/phrases.py, backend/tests/test_table_ambience.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Distâncias borda a borda, vista diurna/noturna e amostragem [início,fim) com 60 minutos de sol no exemplo.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 23 — Serviço e endpoints de ambiente

- **Dono** — Martim.
- **Spec** — Secções 7.6.
- **Depende de** — 22,17.
- **Criar/alterar** — backend/app/restaurant_service/ambience_view.py, backend/app/routers/owner_rooms.py, backend/app/routers/restaurants.py, backend/tests/test_ambience_api.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Preview guardado protegido e endpoint leve público com READ_LIMIT e sem dados pessoais.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 24 — Ferramenta Light do editor

- **Dono** — Martim.
- **Spec** — Secções 7.7.
- **Depende de** — 23,20.
- **Criar/alterar** — frontend/src/pages/room-editor/LightTools.tsx, frontend/src/pages/room-editor/RoomCanvas.tsx, frontend/src/api/rooms.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Slider e atalhos mostram manchas, noite, direção solar e frases para o rascunho guardado.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 25 — API de descoberta

- **Dono** — Sérgio.
- **Spec** — Secções 9.1.
- **Depende de** — 19.
- **Criar/alterar** — backend/app/restaurant_service/discovery.py, backend/app/routers/discovery.py, backend/app/main.py, backend/tests/test_discovery.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Pesquisa sem acentos, filtros, distâncias e paginação publicados com disponibilidade correta.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 26 — Descoberta, cabeçalho e rota demo

- **Dono** — Sérgio.
- **Spec** — Secções 4,9.1.
- **Depende de** — 25,12.
- **Criar/alterar** — frontend/src/pages/discover/DiscoverPage.tsx, frontend/src/pages/discover/RestaurantCard.tsx, frontend/src/App.tsx, frontend/src/pages/Home.test.tsx, frontend/src/pages/demoLinks.test.ts, frontend/e2e/accessibility.spec.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Lista/mapa, Near me e cidades, filtros e Show more e página antiga em /demo.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 27 — Mapa com salas e camadas opcionais

- **Dono** — Martim.
- **Spec** — Secções 9.3.
- **Depende de** — 23.
- **Criar/alterar** — backend/app/restaurant_service/map_view.py, backend/app/restaurant_service/occupancy.py, frontend/src/seatmap/RoomLayers.tsx, frontend/src/seatmap/SeatMap.tsx, frontend/src/api/types.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Mapa mantém campos antigos e desenha contorno, aberturas, elementos, sol e noite por props opcionais.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 28 — Passo Table com ambiente

- **Dono** — Martim.
- **Spec** — Secções 9.3.
- **Depende de** — 27.
- **Criar/alterar** — frontend/src/pages/restaurant/StepTable.tsx, frontend/src/pages/restaurant/TablePanels.tsx, frontend/src/pages/restaurant/MapKey.tsx, frontend/src/api/restaurant.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Salas, contagens, cartões e slider 250ms sem perder seleção, holds e conflitos e live preservados.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 29 — Página pública e integração da reserva

- **Dono** — Sérgio.
- **Spec** — Secções 9.2.
- **Depende de** — 26,28.
- **Criar/alterar** — frontend/src/pages/restaurant-public/RestaurantPage.tsx, frontend/src/pages/restaurant/BookingPage.tsx, frontend/src/pages/restaurant/useBookingFlow.ts, backend/app/routers/discovery.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Galeria, informações, horário e reserva embutida com data/hora/pessoas do URL e redirect legado publicado.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 30 — Preferências puras do optimizador

- **Dono** — Martim.
- **Spec** — Secções 8.
- **Depende de** — 22,1.
- **Criar/alterar** — backend/app/optimiser/restaurant_model.py, backend/app/optimiser/restaurant_assign.py, backend/app/optimiser/restaurant_exact.py, backend/tests/test_optimiser_ambience.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Sol desempata mesas de quatro, casal preserva mesa de dois face a oito e regras duras e determinismo mantidos.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 31 — Preferências no fluxo completo

- **Dono** — Martim.
- **Spec** — Secções 8.3.
- **Depende de** — 30,28.
- **Criar/alterar** — backend/app/restaurant_service/availability.py, backend/app/restaurant_service/diner_flow.py, backend/app/restaurant_service/service_plan.py, backend/app/restaurant_service/whatif.py, backend/app/routers/restaurants.py, frontend/src/pages/restaurant/StepParty.tsx, frontend/src/api/restaurant.ts e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Prefs chegam ao mapa, hold, reserva e staff, sun/shade excluem-se.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 32 — Escolha de cadeira, confirmação e staff

- **Dono** — Martim.
- **Spec** — Secções 9.4,9.5.
- **Depende de** — 31,29.
- **Criar/alterar** — backend/app/restaurant_service/chosen_seat.py, backend/app/restaurant_service/diner_flow.py, backend/app/restaurant_service/booking_rows.py, backend/app/restaurant_service/staff_floor.py, backend/app/routers/restaurants.py, frontend/src/pages/restaurant/ChooseSeat.tsx, frontend/src/pages/restaurant/useBookingFlow.ts, frontend/src/pages/restaurant/Confirmation.tsx, frontend/src/pages/restaurant/SelectionPanel.tsx e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Seat 2 aparece em Done e staff, cadeira alheia ou bloqueada recusada, reserva continua por mesa.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 33 — Gestão de reserva com cadeira

- **Dono** — Sérgio.
- **Spec** — Secções 9.4.
- **Depende de** — 32.
- **Criar/alterar** — backend/app/routers/bookings.py, backend/app/restaurant_service/manage_flow.py, frontend/src/pages/restaurant/ManageBookingPage.tsx, frontend/src/pages/restaurant/ChangeSeat.tsx e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — PATCH seat_id altera só a cadeira e preserva slots e mudanças de horário revalidam cadeira.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 34 — Email com perfil, foto e ambiente

- **Dono** — Sérgio.
- **Spec** — Secções 10.
- **Depende de** — 32.
- **Criar/alterar** — backend/app/restaurant_service/emails.py, backend/app/mail/templates.py, backend/tests/test_restaurant_emails.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Texto e HTML com foto, endereço, mesa/cadeira, frases e ICS, outbox idempotente.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 35 — PNG da sala para email

- **Dono** — Martim.
- **Spec** — Secções 10.
- **Depende de** — 27,32.
- **Criar/alterar** — backend/app/mail/seat_picture.py, backend/app/mail/restaurant_picture.py, backend/tests/test_restaurant_picture.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — PNG desenha sala curva, aberturas, elementos e cadeira marcada sem nomes de clientes.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 36 — Integrar mini-mapa e dados demo

- **Dono** — Sérgio.
- **Spec** — Secções 10,13.
- **Depende de** — 35,34.
- **Criar/alterar** — backend/app/restaurant_service/emails.py, backend/app/seed/demo_restaurant.py, backend/app/seed/run.py, backend/tests/test_restaurant_seed.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — PNG inline em confirmação/change/reminder e demos inventadas com fontes das fotos registadas.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 37 — Playwright editor e reserva e desempenho

- **Dono** — Martim.
- **Spec** — Secções 6,9,12.
- **Depende de** — 36,33,24.
- **Criar/alterar** — frontend/e2e/room-editor.spec.ts, frontend/e2e/restaurant-ambience.spec.ts, backend/tests/test_restaurant_performance.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Editor móvel e concorrência, cadeira no fluxo e mapa 60 mesas <300ms.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 38 — Playwright dono e descoberta

- **Dono** — Sérgio.
- **Spec** — Secções 5,9,12.
- **Depende de** — 36,29.
- **Criar/alterar** — frontend/e2e/owner.spec.ts, frontend/e2e/discovery.spec.ts, backend/tests/test_discovery_performance.py e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Criar/publicar/encontrar restaurante, axe páginas novas e 100 restaurantes <500ms.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

### Tarefa 39 — Revisão final, documentação e ensaio

- **Dono** — Martim.
- **Spec** — Secções 0.1,12,13,16.
- **Depende de** — 37,38.
- **Criar/alterar** — docs/api.md, docs/openapi.json, docs/data-model.md, docs/decisions-log.md, docs/team/tasks.md, README.md, docs/test-report.md e testes específicos da funcionalidade e documentação afetada.
- **Não tocar** — Grupo G e restantes ficheiros fora do âmbito listado.
- **Testes primeiro** — Exercitar a interface pública e os casos de aceitação seguintes, incluindo regressões de compatibilidade e isolamento quando aplicável. Observar RED antes de GREEN.
- **Feito quando** — Todos os critérios rastreados, verificações completas e ensaio desktop/móvel com riscos registados.
- **Verificação** — G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspeção visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** — Pode correr apenas com tarefas sem dependências e sem ficheiros em comum. A execução autónoma segue uma tarefa de cada vez.

## Dúvidas, contradições e decisões conservadoras propostas

1. Secção 8 exige key com quatro elementos e testes atuais inalterados, mas test_optimiser_restaurant_rules.py exige (6,-2,1) e o oráculo exato usa três elementos. Preservar a interface legada e introduzir comparação de preferências separada é a opção conservadora, documentando o desvio antes da tarefa 30.
2. test_migrate_guest_accounts.py procura NEW_INDEXES só em events/guests. Acrescentar índice de slug nessa lista quebra a asserção. Preservar lista histórica e adicionar lista específica dos restaurantes, com novo teste completo, evita enfraquecer testes.
3. Permissions-Policy bloqueia geolocation tanto em main.py como vercel.json. A funcionalidade aprovada exige geolocation=(self) nos headers relevantes e manutenção das outras restrições.
4. Fotos de rascunho exigem Bearer, mas img não envia sessionStorage. Usar fetch autenticado e URL de objeto para preview. Ajustar CSP mínima para esse preview. Cache immutable pública permite conservar imagens após unpublish. Usar cache privada/no-store em rascunho e registar o limite de revogação de imagens anteriormente públicas.
5. Perfil e salas guardados de um restaurante já publicado não têm snapshot público separado. Opção conservadora é impedir nova publicação com erros e evitar aceitar novas reservas quando configuração inválida. Confirmar comportamento antes da integração pública.
6. Contorno inválido deve poder guardar como rascunho, mas JSON estruturalmente inválido ou referências alheias têm de ser recusados. Separar validação estrutural de problemas geométricos de publicação.
7. Inverter contorno exige remapear side/offset das aberturas, além de inverter pontos e curvas. Caso de teste obrigatório.
8. Salas exteriores dispensam janelas para sol, mas o rumo das manchas e o critério sem norte deixam ambiguidade. Na ausência de orientação/localização, nunca afirmar sol.
9. A vista à noite sem night_text e os estados polares com sunrise/sunset None exigem regras explícitas. Opção conservadora é omitir a vista noturna não declarada e classificar noite pelo sol abaixo do horizonte.
10. Tabelas não mantém ligação histórica permanente às reservas depois de release_slots. Regra de nunca apagar mesa com reservas passadas exige associação histórica adicional ou retenção conservadora das mesas. Implementar proteção conservadora e registar antes de persistência.
11. Slug máximo 60 exige reservar espaço para sufixo e tratar concorrência com índice único. Combinações de mesas entre salas devem ser recusadas.
12. Limite discovery até 50 diverge de disponibilidade calculada para no máximo 20. Limitar trabalho de disponibilidade a páginas de 20 quando existir filtro temporal e documentar.
13. Foto view usa opening_key mas as keys são transitórias. Resolver apenas após abertura persistida e proteger referências de outras salas/restaurantes.
14. Sala implícita em clientes antigos sem latitude/norte exige ambiente conservador, sem previsões solares inventadas.
15. A regra staff apenas demo tem bypass em /venues. Como o contrato de eventos é protegido, qualquer proteção nesse router deve ser restrita a kind=restaurant e preservar respostas de eventos. Se implicar alteração de ficheiro proibido, saltar e registar.
16. Acessibilidade total não é coberta pelo useUnsavedGuard atual no botão Back do browser. Rascunho local deve recuperar o trabalho sem editar esse hook protegido.
17. Valores NOAA do spec são aproximados. Confirmar tolerâncias na fonte primária ao escrever testes, documentando eventual diferença real.
18. Nome e email local foram fornecidos posteriormente. Commits apenas nas duas branches autorizadas. Sem push e sem PR.

## Recuperação durante a noite

Guardar no relatório a tarefa, tentativa, resultados e último commit verde. Se uma alteração quebrar a linha de base, confirmar branch martim/restaurantes-impl, preservar o registo fora do diff a descartar e executar git reset --hard para o último commit verde nessa branch. Repor o registo e continuar a tarefa seguinte viável. Duas tentativas falhadas ou decisão sem resposta levam a opção conservadora documentada ou tarefa saltada. Nunca aceitar falhas novas por as ocultar ou enfraquecer testes.
