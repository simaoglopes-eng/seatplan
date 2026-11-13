# Plano de implementa??o dos restaurantes

Aprovado por Martim em 2026-11-13 durante a prepara??o. Fonte de verdade em docs/superpowers/specs/2026-11-13-restaurantes-plataforma-design.md. Execu??o aut?noma autorizada na branch martim/restaurantes-impl, um commit por tarefa. Depend?ncias do S?rgio necess?rias ao trabalho do Martim ser?o executadas e identificadas no relat?rio.

## Verifica??o e leitura conclu?das

Branch inicial martim/restaurantes-spec e base main 767fbb6. Identidade local definida como Martim Gon?alves e 278824942+martimgoncalves2002-rgb@users.noreply.github.com. GitHub martimgoncalves2002-rgb com push=true. Python 3.13.2, Node 24.16.0 e npm 11.13.0. Venv e node_modules existentes.

Ruff passou, typecheck passou e Vitest deu 209 passed em 23 ficheiros. Pytest inicial terminou com uma falha conhecida em test_guest_register.py::test_two_verifies_at_once_make_one_account. O rerun isolado deu 1 passed, 1 warning in 1.07s. Foi necess?ria uma pasta tempor?ria nova e desativar cache por permiss?es em diret?rios da sess?o anterior. Esta exce??o foi autorizada por Martim. Qualquer outra falha durante implementa??o exige recuperar o ?ltimo commit verde na branch de implementa??o, registar o ocorrido e continuar na tarefa seguinte, conforme instru??o posterior.

Chromium instalado e npm run e2e deu 23 passed (24.8s), com desktop e mobile 390x844. Usou E2E_PYTHON apontado para .venv\Scripts\python.exe. Postgres n?o configurado para testes nesta sess?o.

Foram lidos integralmente spec, README.md, docs/CONTRACT.md, docs/team/tasks.md e os oito READ_ME_FIRST.md pedidos. Os 18 grupos de ficheiros/fun??es da sec??o 2 existem, incluindo build_map, save_layout, TableSpec/PartySpec/ScoreBreakdown, recommend_table/assign_service/whatif_walkin, quatro queue_* de email, PictureRoom/render_seat_picture e helpers de accounts. As rotas e estados atuais correspondem ? descri??o.

Diferen?as confirmadas no c?digo

- A demo chama-se Casa Lumen, enquanto a sec??o 13 refere Casa Linho.
- seatPositions para row coloca cadeiras na linha central. O balc?o exige adapta??o no editor novo.
- put_layout devolve 409 gen?rico, sem lista de mesas, ao contr?rio da descri??o da sec??o 6.10.
- load_for_staff permite atualmente todos os restaurantes ao papel staff, como previsto no risco. routers/venues.py tamb?m permite esse acesso e constitui um caminho alternativo a avaliar.
- A chave atual do ScoreBreakdown tem tr?s elementos e testes existentes exigem literalmente esse formato.
- README e deployment ainda dizem que nunca houve deploy, divergindo do contexto fornecido pelo Martim.

## Restri??es e verifica??o comuns

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

Importar useHistory/useUnsavedGuard e helpers existentes ? permitido sem editar os respetivos ficheiros. core/layout.py e o comportamento do editor/API de eventos ficam preservados. Altera??es partilhadas s? nos ficheiros explicitamente indicados pela tarefa. models.py/migrate.py pertencem ? tarefa 2 e SeatMap.tsx ? 27. api/types.ts, App.tsx e documenta??o partilhada editam-se em sequ?ncia. Paralelo significa trabalho independente de Martim e S?rgio em worktrees separadas, com exclus?o de ficheiros partilhados.

Cada tarefa come?a com o guia do m?dulo e os testes p?blicos da funcionalidade. Para fun??es puras e seguran?a, executar teste novo e observar falha antes da implementa??o. Adicionar testes em backend/tests/test_<funcionalidade>.py ou junto dos componentes TS indicados. Cada tarefa atualiza o READ_ME_FIRST.md afetado e a documenta??o API/modelo quando aplic?vel, e relatorio-noite.md.

Comandos comuns antes de CADA commit, a partir das pastas indicadas

| C?digo | Pasta | Comando |
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

B3 admite apenas o rerun isolado do teste conhecido, se for a ?nica falha. Por permiss?es de ficheiros tempor?rios, pode usar --basetemp com diret?rio novo e -p no:cacheprovider, registando a variante real. Para E definir E2E_PYTHON com caminho absoluto do Python do venv. UI exige F3/F4/E e verifica??o visual desktop e 390x844. Dias 1, 5 e 8 e revis?o final exigem bateria integral. Backend local usa DEMO_MODE=1, migra??o/seed e uvicorn app.main:create_app --factory --port 8000. Frontend usa npm run dev. Testes usam bases tempor?rias. Preservar bases locais com dados.

## Tarefas por ordem

Dias de refer?ncia da sec??o 13, com funda??es antecipadas segundo autoriza??o de Martim. As depend?ncias explicitadas determinam a ordem efetiva.

### Tarefa 0 ? Prepara??o e prote??o dos eventos

- **Dono** ? Martim.
- **Spec** ? Sec??es 0.1.
- **Depende de** ? nenhuma.
- **Criar/alterar** ? AGENTS.md, scripts/check_forbidden_paths.py, backend/tests/test_forbidden_paths.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Script recusa altera??es, remo??es e renomea??es de caminhos protegidos e recusa main.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 1 ? Contratos de dados e compatibilidade

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 6.10,7.5,9.3,11,13.
- **Depende de** ? 0.
- **Criar/alterar** ? docs/CONTRACT.md, docs/decisions-log.md e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Formatos, limites, erros e decis?es pendentes documentados.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 2 ? Modelo de dados e migra??o repet?vel

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 6.11,11.
- **Depende de** ? 1.
- **Criar/alterar** ? backend/app/models.py, backend/app/seed/migrate.py, backend/tests/test_migrate_restaurants.py, backend/tests/fixtures/schema_2026_11_13.*.sql e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Migra duas vezes sem alterar dados antigos e preserva reservas e eventos.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr com 3 e 4, sem editar os mesmos ficheiros

### Tarefa 3 ? Geometria pura do contorno

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.1,6.3,6.5,7.1.
- **Depende de** ? 1.
- **Criar/alterar** ? backend/app/ambience/geometry.py, backend/tests/test_ambience_geometry.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Arcos, orienta??o, ?rea, normais e pontos interiores corretos com casos conhecidos e hypothesis.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Ap?s contratos, pode correr com 2

### Tarefa 4 ? Posi??o e horas do sol

- **Dono** ? Martim.
- **Spec** ? Sec??es 7.1,7.2.
- **Depende de** ? 3.
- **Criar/alterar** ? backend/app/ambience/solar.py, backend/tests/test_ambience_solar.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Casos Lisboa ver?o/inverno e Troms? da sec??o 7.2 verificados com NOAA e zoneinfo.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Ap?s contratos, pode correr com 2

### Tarefa 5 ? Conta de dono e isolamento

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 5.1.
- **Depende de** ? 2.
- **Criar/alterar** ? backend/app/restaurant_service/owner_accounts.py, backend/app/routers/owners.py, backend/app/restaurant_service/venue_access.py, backend/app/main.py, backend/tests/test_owner_accounts.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Registo com c?digo, limites e 404 uniforme entre donos e staff apenas demo.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 6 ? Lista dos restaurantes e login do dono

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 5.2.
- **Depende de** ? 5.
- **Criar/alterar** ? frontend/src/pages/owner/OwnerHomePage.tsx, frontend/src/pages/owner/OwnerSignUpPage.tsx, frontend/src/pages/Login.tsx, frontend/src/api/owner.ts, frontend/src/App.tsx e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Dono regista-se, entra e v? apenas os seus restaurantes e progresso.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 7 ? Modelo imut?vel e geometria TS do editor

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.1,6.3,6.10.
- **Depende de** ? 3.
- **Criar/alterar** ? frontend/src/pages/room-editor/roomModel.ts, frontend/src/pages/room-editor/geometry.ts, frontend/src/pages/room-editor/geometry.test.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Fixtures geom?tricas coincidem com Python e todas as opera??es preservam o hist?rico.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 8 ? Estrutura do editor e salas

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.2,6.3,6.12.
- **Depende de** ? 7,6.
- **Criar/alterar** ? frontend/src/pages/room-editor/RoomEditorPage.tsx, frontend/src/pages/room-editor/RoomCanvas.tsx, frontend/src/pages/room-editor/room-editor.css, frontend/src/App.tsx e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Criar ret?ngulo, L e desenho livre com grelha, r?guas e desfazer/refazer.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 9 ? Contornos curvos e propriedades acess?veis

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.3,6.12.
- **Depende de** ? 8.
- **Criar/alterar** ? frontend/src/pages/room-editor/ShapeTools.tsx, frontend/src/pages/room-editor/RoomProperties.tsx, frontend/src/pages/room-editor/roomModel.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Mover, inserir e remover cantos e editar lados e flechas por gesto e formul?rio.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 10 ? Aberturas e orienta??o

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.4,6.5.
- **Depende de** ? 9.
- **Criar/alterar** ? frontend/src/pages/room-editor/WallTools.tsx, frontend/src/pages/room-editor/NorthTools.tsx, frontend/src/pages/room-editor/roomModel.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Janelas, portas, vidro e norte com normais corretas em arcos e sem sobreposi??o.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 11 ? Elementos fixos e zonas

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.6,6.7.
- **Depende de** ? 10.
- **Criar/alterar** ? frontend/src/pages/room-editor/FixtureTools.tsx, frontend/src/pages/room-editor/ZoneTools.tsx, frontend/src/pages/room-editor/roomModel.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Todos os tipos definidos no spec criados e editados com desfazer.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 12 ? Perfil, slug e localiza??o

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 5.3.
- **Depende de** ? 6.
- **Criar/alterar** ? backend/app/restaurant_service/profiles.py, backend/app/routers/owners.py, frontend/src/pages/owner/NewRestaurantWizard.tsx, frontend/src/pages/owner/ProfilePage.tsx, frontend/src/maps/LeafletMap.tsx, frontend/package.json, frontend/package-lock.json, backend/app/main.py, vercel.json e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Guardar e retomar Identity/Location com slug ?nico, valida??o e mapa e geolocaliza??o por a??o expl?cita.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 13 ? Fotos seguras e galeria do dono

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 5.5.
- **Depende de** ? 12.
- **Criar/alterar** ? backend/app/restaurant_service/photos.py, backend/app/routers/photos.py, backend/app/main.py, frontend/src/pages/owner/PhotoEditor.tsx, frontend/src/pages/owner/photoResize.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? PDF disfar?ado recusado, limites e isolamento, capa e ordem e redimensionamento corretos.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 14 ? Mesas e cadeiras no editor

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.8.
- **Depende de** ? 11.
- **Criar/alterar** ? frontend/src/pages/room-editor/TableTools.tsx, frontend/src/pages/room-editor/tableModel.ts, frontend/src/pages/room-editor/tableModel.test.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Quatro formas, cadeiras edit?veis e balc?o com cadeiras de um lado, flags e grupos.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 15 ? Gestos e sele??o m?ltipla

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.8,6.12.
- **Depende de** ? 14.
- **Criar/alterar** ? frontend/src/pages/room-editor/RoomCanvas.tsx, frontend/src/pages/room-editor/selection.ts, frontend/src/pages/room-editor/selection.test.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Alinhar, distribuir, duplicar, rodar e atalhos com equivalentes t?teis.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 16 ? Valida??o browser e servidor

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.9.
- **Depende de** ? 15.
- **Criar/alterar** ? backend/app/ambience/validation.py, backend/tests/test_room_validation.py, frontend/src/pages/room-editor/validation.ts, frontend/src/pages/room-editor/validation.test.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Erros e avisos da sec??o 6.9 coincidem nos dois lados, incluindo mesas rodadas e curvas.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 17 ? Guardar salas em transa??o e sala impl?cita

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.10,6.11.
- **Depende de** ? 16,5,2.
- **Criar/alterar** ? backend/app/restaurant_service/rooms.py, backend/app/routers/owner_rooms.py, backend/app/main.py, backend/tests/test_owner_rooms.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Upsert seguro por id/key, ids alheios recusados, vers?o at?mica 409, vizinhos reconstru?dos e reserva protegida.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 18 ? Persist?ncia do editor e recupera??o local

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.10.
- **Depende de** ? 17.
- **Criar/alterar** ? frontend/src/api/rooms.ts, frontend/src/pages/room-editor/useRoomDraft.ts, frontend/src/pages/room-editor/RoomEditorPage.tsx e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Guardar/recarregar mant?m layout e conflito entre separadores conserva rascunho com restore/discard.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 19 ? Hor?rio e publica??o

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 5.3,9.1.
- **Depende de** ? 18,13.
- **Criar/alterar** ? backend/app/restaurant_service/publishing.py, backend/app/routers/owners.py, frontend/src/pages/owner/HoursPage.tsx, frontend/src/pages/owner/PublishReview.tsx e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Publica??o valida localiza??o, hor?rio, mesas e norte e devolve problemas com links e features.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 20 ? Editor m?vel e acessibilidade

- **Dono** ? Martim.
- **Spec** ? Sec??es 6.2,6.12,16.
- **Depende de** ? 18.
- **Criar/alterar** ? frontend/src/pages/room-editor/RoomEditorPage.tsx, frontend/src/pages/room-editor/RoomProperties.tsx, frontend/src/pages/room-editor/room-editor.css, frontend/e2e/room-editor.spec.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? A 390x844 criar sala 10x7, curva, duas janelas, norte, bar e oito mesas e guardar/recarregar.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 21 ? Luz e manchas de sol

- **Dono** ? Martim.
- **Spec** ? Sec??es 7.3,7.4.
- **Depende de** ? 4,3.
- **Criar/alterar** ? backend/app/ambience/light.py, backend/app/ambience/models.py, backend/tests/test_ambience_light.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Regras auto/never/between, altitude, orienta??o, exterior e toldos respeitam crit?rios 7.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 22 ? Ambiente por mesa e frases

- **Dono** ? Martim.
- **Spec** ? Sec??es 7.5.
- **Depende de** ? 21.
- **Criar/alterar** ? backend/app/ambience/table.py, backend/app/ambience/phrases.py, backend/tests/test_table_ambience.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Dist?ncias borda a borda, vista diurna/noturna e amostragem [in?cio,fim) com 60 minutos de sol no exemplo.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 23 ? Servi?o e endpoints de ambiente

- **Dono** ? Martim.
- **Spec** ? Sec??es 7.6.
- **Depende de** ? 22,17.
- **Criar/alterar** ? backend/app/restaurant_service/ambience_view.py, backend/app/routers/owner_rooms.py, backend/app/routers/restaurants.py, backend/tests/test_ambience_api.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Preview guardado protegido e endpoint leve p?blico com READ_LIMIT e sem dados pessoais.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 24 ? Ferramenta Light do editor

- **Dono** ? Martim.
- **Spec** ? Sec??es 7.7.
- **Depende de** ? 23,20.
- **Criar/alterar** ? frontend/src/pages/room-editor/LightTools.tsx, frontend/src/pages/room-editor/RoomCanvas.tsx, frontend/src/api/rooms.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Slider e atalhos mostram manchas, noite, dire??o solar e frases para o rascunho guardado.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 25 ? API de descoberta

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 9.1.
- **Depende de** ? 19.
- **Criar/alterar** ? backend/app/restaurant_service/discovery.py, backend/app/routers/discovery.py, backend/app/main.py, backend/tests/test_discovery.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Pesquisa sem acentos, filtros, dist?ncias e pagina??o publicados com disponibilidade correta.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 26 ? Descoberta, cabe?alho e rota demo

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 4,9.1.
- **Depende de** ? 25,12.
- **Criar/alterar** ? frontend/src/pages/discover/DiscoverPage.tsx, frontend/src/pages/discover/RestaurantCard.tsx, frontend/src/App.tsx, frontend/src/pages/Home.test.tsx, frontend/src/pages/demoLinks.test.ts, frontend/e2e/accessibility.spec.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Lista/mapa, Near me e cidades, filtros e Show more e p?gina antiga em /demo.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 27 ? Mapa com salas e camadas opcionais

- **Dono** ? Martim.
- **Spec** ? Sec??es 9.3.
- **Depende de** ? 23.
- **Criar/alterar** ? backend/app/restaurant_service/map_view.py, backend/app/restaurant_service/occupancy.py, frontend/src/seatmap/RoomLayers.tsx, frontend/src/seatmap/SeatMap.tsx, frontend/src/api/types.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Mapa mant?m campos antigos e desenha contorno, aberturas, elementos, sol e noite por props opcionais.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 28 ? Passo Table com ambiente

- **Dono** ? Martim.
- **Spec** ? Sec??es 9.3.
- **Depende de** ? 27.
- **Criar/alterar** ? frontend/src/pages/restaurant/StepTable.tsx, frontend/src/pages/restaurant/TablePanels.tsx, frontend/src/pages/restaurant/MapKey.tsx, frontend/src/api/restaurant.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Salas, contagens, cart?es e slider 250ms sem perder sele??o, holds e conflitos e live preservados.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 29 ? P?gina p?blica e integra??o da reserva

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 9.2.
- **Depende de** ? 26,28.
- **Criar/alterar** ? frontend/src/pages/restaurant-public/RestaurantPage.tsx, frontend/src/pages/restaurant/BookingPage.tsx, frontend/src/pages/restaurant/useBookingFlow.ts, backend/app/routers/discovery.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Galeria, informa??es, hor?rio e reserva embutida com data/hora/pessoas do URL e redirect legado publicado.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 30 ? Prefer?ncias puras do optimizador

- **Dono** ? Martim.
- **Spec** ? Sec??es 8.
- **Depende de** ? 22,1.
- **Criar/alterar** ? backend/app/optimiser/restaurant_model.py, backend/app/optimiser/restaurant_assign.py, backend/app/optimiser/restaurant_exact.py, backend/tests/test_optimiser_ambience.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Sol desempata mesas de quatro, casal preserva mesa de dois face a oito e regras duras e determinismo mantidos.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 31 ? Prefer?ncias no fluxo completo

- **Dono** ? Martim.
- **Spec** ? Sec??es 8.3.
- **Depende de** ? 30,28.
- **Criar/alterar** ? backend/app/restaurant_service/availability.py, backend/app/restaurant_service/diner_flow.py, backend/app/restaurant_service/service_plan.py, backend/app/restaurant_service/whatif.py, backend/app/routers/restaurants.py, frontend/src/pages/restaurant/StepParty.tsx, frontend/src/api/restaurant.ts e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Prefs chegam ao mapa, hold, reserva e staff, sun/shade excluem-se.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 32 ? Escolha de cadeira, confirma??o e staff

- **Dono** ? Martim.
- **Spec** ? Sec??es 9.4,9.5.
- **Depende de** ? 31,29.
- **Criar/alterar** ? backend/app/restaurant_service/chosen_seat.py, backend/app/restaurant_service/diner_flow.py, backend/app/restaurant_service/booking_rows.py, backend/app/restaurant_service/staff_floor.py, backend/app/routers/restaurants.py, frontend/src/pages/restaurant/ChooseSeat.tsx, frontend/src/pages/restaurant/useBookingFlow.ts, frontend/src/pages/restaurant/Confirmation.tsx, frontend/src/pages/restaurant/SelectionPanel.tsx e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Seat 2 aparece em Done e staff, cadeira alheia ou bloqueada recusada, reserva continua por mesa.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 33 ? Gest?o de reserva com cadeira

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 9.4.
- **Depende de** ? 32.
- **Criar/alterar** ? backend/app/routers/bookings.py, backend/app/restaurant_service/manage_flow.py, frontend/src/pages/restaurant/ManageBookingPage.tsx, frontend/src/pages/restaurant/ChangeSeat.tsx e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? PATCH seat_id altera s? a cadeira e preserva slots e mudan?as de hor?rio revalidam cadeira.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 34 ? Email com perfil, foto e ambiente

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 10.
- **Depende de** ? 32.
- **Criar/alterar** ? backend/app/restaurant_service/emails.py, backend/app/mail/templates.py, backend/tests/test_restaurant_emails.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Texto e HTML com foto, endere?o, mesa/cadeira, frases e ICS, outbox idempotente.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 35 ? PNG da sala para email

- **Dono** ? Martim.
- **Spec** ? Sec??es 10.
- **Depende de** ? 27,32.
- **Criar/alterar** ? backend/app/mail/seat_picture.py, backend/app/mail/restaurant_picture.py, backend/tests/test_restaurant_picture.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? PNG desenha sala curva, aberturas, elementos e cadeira marcada sem nomes de clientes.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 36 ? Integrar mini-mapa e dados demo

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 10,13.
- **Depende de** ? 35,34.
- **Criar/alterar** ? backend/app/restaurant_service/emails.py, backend/app/seed/demo_restaurant.py, backend/app/seed/run.py, backend/tests/test_restaurant_seed.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? PNG inline em confirma??o/change/reminder e demos inventadas com fontes das fotos registadas.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 37 ? Playwright editor e reserva e desempenho

- **Dono** ? Martim.
- **Spec** ? Sec??es 6,9,12.
- **Depende de** ? 36,33,24.
- **Criar/alterar** ? frontend/e2e/room-editor.spec.ts, frontend/e2e/restaurant-ambience.spec.ts, backend/tests/test_restaurant_performance.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Editor m?vel e concorr?ncia, cadeira no fluxo e mapa 60 mesas <300ms.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 38 ? Playwright dono e descoberta

- **Dono** ? S?rgio.
- **Spec** ? Sec??es 5,9,12.
- **Depende de** ? 36,29.
- **Criar/alterar** ? frontend/e2e/owner.spec.ts, frontend/e2e/discovery.spec.ts, backend/tests/test_discovery_performance.py e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Criar/publicar/encontrar restaurante, axe p?ginas novas e 100 restaurantes <500ms.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

### Tarefa 39 ? Revis?o final, documenta??o e ensaio

- **Dono** ? Martim.
- **Spec** ? Sec??es 0.1,12,13,16.
- **Depende de** ? 37,38.
- **Criar/alterar** ? docs/api.md, docs/openapi.json, docs/data-model.md, docs/decisions-log.md, docs/team/tasks.md, README.md, docs/test-report.md e testes espec?ficos da funcionalidade e documenta??o afetada.
- **N?o tocar** ? Grupo G e restantes ficheiros fora do ?mbito listado.
- **Testes primeiro** ? Exercitar a interface p?blica e os casos de aceita??o seguintes, incluindo regress?es de compatibilidade e isolamento quando aplic?vel. Observar RED antes de GREEN.
- **Feito quando** ? Todos os crit?rios rastreados, verifica??es completas e ensaio desktop/m?vel com riscos registados.
- **Verifica??o** ? G, B1, B2, B3, F1 e F2. Nas tarefas de UI acrescentar F3, F4, E e inspe??o visual. Usar pytest no ficheiro novo e npm test -- <ficheiro> durante desenvolvimento.
- **Paralelo** ? Pode correr apenas com tarefas sem depend?ncias e sem ficheiros em comum. A execu??o aut?noma segue uma tarefa de cada vez.

## D?vidas, contradi??es e decis?es conservadoras propostas

1. Sec??o 8 exige key com quatro elementos e testes atuais inalterados, mas test_optimiser_restaurant_rules.py exige (6,-2,1) e o or?culo exato usa tr?s elementos. Preservar a interface legada e introduzir compara??o de prefer?ncias separada ? a op??o conservadora, documentando o desvio antes da tarefa 30.
2. test_migrate_guest_accounts.py procura NEW_INDEXES s? em events/guests. Acrescentar ?ndice de slug nessa lista quebra a asser??o. Preservar lista hist?rica e adicionar lista espec?fica dos restaurantes, com novo teste completo, evita enfraquecer testes.
3. Permissions-Policy bloqueia geolocation tanto em main.py como vercel.json. A funcionalidade aprovada exige geolocation=(self) nos headers relevantes e manuten??o das outras restri??es.
4. Fotos de rascunho exigem Bearer, mas img n?o envia sessionStorage. Usar fetch autenticado e URL de objeto para preview. Ajustar CSP m?nima para esse preview. Cache immutable p?blica permite conservar imagens ap?s unpublish. Usar cache privada/no-store em rascunho e registar o limite de revoga??o de imagens anteriormente p?blicas.
5. Perfil e salas guardados de um restaurante j? publicado n?o t?m snapshot p?blico separado. Op??o conservadora ? impedir nova publica??o com erros e evitar aceitar novas reservas quando configura??o inv?lida. Confirmar comportamento antes da integra??o p?blica.
6. Contorno inv?lido deve poder guardar como rascunho, mas JSON estruturalmente inv?lido ou refer?ncias alheias t?m de ser recusados. Separar valida??o estrutural de problemas geom?tricos de publica??o.
7. Inverter contorno exige remapear side/offset das aberturas, al?m de inverter pontos e curvas. Caso de teste obrigat?rio.
8. Salas exteriores dispensam janelas para sol, mas o rumo das manchas e o crit?rio sem norte deixam ambiguidade. Na aus?ncia de orienta??o/localiza??o, nunca afirmar sol.
9. A vista ? noite sem night_text e os estados polares com sunrise/sunset None exigem regras expl?citas. Op??o conservadora ? omitir a vista noturna n?o declarada e classificar noite pelo sol abaixo do horizonte.
10. Tabelas n?o mant?m liga??o hist?rica permanente ?s reservas depois de release_slots. Regra de nunca apagar mesa com reservas passadas exige associa??o hist?rica adicional ou reten??o conservadora das mesas. Implementar prote??o conservadora e registar antes de persist?ncia.
11. Slug m?ximo 60 exige reservar espa?o para sufixo e tratar concorr?ncia com ?ndice ?nico. Combina??es de mesas entre salas devem ser recusadas.
12. Limite discovery at? 50 diverge de disponibilidade calculada para no m?ximo 20. Limitar trabalho de disponibilidade a p?ginas de 20 quando existir filtro temporal e documentar.
13. Foto view usa opening_key mas as keys s?o transit?rias. Resolver apenas ap?s abertura persistida e proteger refer?ncias de outras salas/restaurantes.
14. Sala impl?cita em clientes antigos sem latitude/norte exige ambiente conservador, sem previs?es solares inventadas.
15. A regra staff apenas demo tem bypass em /venues. Como o contrato de eventos ? protegido, qualquer prote??o nesse router deve ser restrita a kind=restaurant e preservar respostas de eventos. Se implicar altera??o de ficheiro proibido, saltar e registar.
16. Acessibilidade total n?o ? coberta pelo useUnsavedGuard atual no bot?o Back do browser. Rascunho local deve recuperar o trabalho sem editar esse hook protegido.
17. Valores NOAA do spec s?o aproximados. Confirmar toler?ncias na fonte prim?ria ao escrever testes, documentando eventual diferen?a real.
18. Nome e email local foram fornecidos posteriormente. Commits apenas nas duas branches autorizadas. Sem push e sem PR.

## Recupera??o durante a noite

Guardar no relat?rio a tarefa, tentativa, resultados e ?ltimo commit verde. Se uma altera??o quebrar a linha de base, confirmar branch martim/restaurantes-impl, preservar o registo fora do diff a descartar e executar git reset --hard para o ?ltimo commit verde nessa branch. Repor o registo e continuar a tarefa seguinte vi?vel. Duas tentativas falhadas ou decis?o sem resposta levam a op??o conservadora documentada ou tarefa saltada. Nunca aceitar falhas novas por as ocultar ou enfraquecer testes.
