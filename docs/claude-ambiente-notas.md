# Notas do Claude: branch claude/ambiente (tarefas 21, 22, 30)

Worktree C:\Users\marti\seatplan-claude, criada a partir de
martim/restaurantes-impl em 022fd28. Trabalho em paralelo com o Codex; este
ficheiro substitui o relatorio-noite.md para estas três tarefas.

## Tarefa 21: luz e manchas de sol (spec 7.3, 7.4)

Ficheiros: backend/app/ambience/models.py, light.py, READ_ME_FIRST.md,
backend/tests/test_ambience_light.py.

Testes primeiro: 29 testes escritos antes do código; RED por módulos
inexistentes (ImportError na recolha), depois GREEN.

Verificação (a partir de backend/, venv do repositório principal):
- ruff check . → All checks passed!
- ruff format --check . → 174 files already formatted
- pytest -q (completo, --basetemp na scratchpad) → 651 passed, 3 warnings
- scripts/check_forbidden_paths.py --base main → Protected event paths unchanged.

Decisões que o spec não fixava (conservadoras):
- Portas nunca deixam entrar sol; só "window" e "glass_wall" contam.
- A regra "between" usa [início, fim): às 15:00 de "12:00-15:00" já não há sol.
  Horas que atravessam a meia-noite são aceites.
- "between" sem as duas horas preenchidas conta como "never".
- Numa sala exterior, sem sol direto mas de dia e fora de toldos: "daylight".
- Uma janela num lado curvo é cortada em 16 pedaços; cada pedaço decide o sol
  pela sua própria orientação (o "faces" mostrado ao dono continua a ser o do
  meio da janela).
- Dias polares (sem nascer/pôr): é noite só com o sol abaixo do horizonte.
- Distâncias mesa-janela são borda a borda (contorno da mesa ao segmento da
  janela); mesa redonda aproximada por 16 lados.

## Tarefa 22: ambiente por mesa e frases (spec 7.5)

Ficheiros: backend/app/ambience/table.py, phrases.py, READ_ME_FIRST.md,
backend/tests/test_table_ambience.py.

Testes primeiro: 23 testes escritos antes do código; RED por módulo
inexistente, depois GREEN. Inclui o critério do spec: reserva 13:00-14:30 com
o sol a sair às 14:00 dá "Direct sun until 14:00" e sun_minutes = 60.

Verificação:
- ruff check . → All checks passed!
- ruff format --check . → 177 files already formatted
- pytest -q (completo) → 674 passed, 3 warnings
- check_forbidden_paths --base main → Protected event paths unchanged.

Decisões (conservadoras):
- "Sunset at HH:MM from your seat" só quando a mesa vê o poente (janela
  200-340 graus a menos de 3 m, ou sala exterior). Caso contrário, se o pôr do
  sol cai dentro da reserva, a frase é "It gets dark at HH:MM".
- À noite, a vista usa night_view_text se existir; senão mantém o texto de dia
  (a vista não desaparece à noite, só muda).
- "View of the <texto>": um "The " inicial no texto do dono é retirado para não
  ficar "View of the The bridge". Só com etiquetas: "River view", etc.
- Frase para "shade" exterior: "In the shade" (o spec não a tinha).
- A frase da cadeira usa a janela com vista se houver, senão a mais próxima, e
  só se estiver a menos de 3 m; sem isso devolve None (não afirmar).
- "near" inclui host_stand e a porta marcada como entrada principal
  ("entrance"); "quiet" ignora lareira e host_stand, como no spec.

## Tarefa 30: preferências puras do optimizador (spec 8)

Ficheiros: backend/app/optimiser/restaurant_model.py, restaurant_assign.py,
READ_ME_FIRST.md, docs/optimiser-restaurant.md,
backend/tests/test_optimiser_ambience.py. O restaurant_exact.py não precisou
de mudanças: recebe as preferências dentro do PartySpec e o score_plan conta-as.

Testes primeiro: 13 testes escritos antes do código; RED com 13 falhas
(TypeError: features/prefs inexistentes), depois GREEN. Os testes existentes
do optimizador (assign, exact, properties, rules) passam sem alterações.

Verificação:
- ruff check . → All checks passed!
- ruff format --check . → 178 files already formatted
- pytest -q (completo) → 687 passed, 3 warnings
- check_forbidden_paths --base main → Protected event paths unchanged.

DESVIO AO SPEC (para registar no decisions-log ao fazer merge):
- Spec 8.2 dizia key() = (covers, -waste, zonas, prefs_met). Mas um teste
  existente exige key() == (6, -2, 1) e o exact check, o service_plan ("o
  plano novo é melhor?") e o gap report comparam key() de 3 partes. Para não
  alterar testes nem comportamento existente: key() fica com 3 partes e há um
  ranking_key() = key() + prefs_met, usado só pela heurística (busca local)
  para desempatar. As preferências nunca mudam o que conta como ótimo.

Outras decisões:
- recommend_table só reordena quando o grupo tem desejos; ordenação estável
  por (desperdício <= 2 ? 0 : 1, -desejos cumpridos), mantendo a ordem antiga
  (desperdício, zona, menos mesas, ids) dentro de cada grupo.
- Mesas juntas cumprem um desejo só se todas o cumprirem.
- Razões: "Sunny, as you asked" (cumprido), "Not in the sun" (outra opção
  livre cumpre), "No sunny table is free at 13:00" (nenhuma livre cumpre). A
  hora vem do start_slot (grelha de 15 min de clock.py), sem importar o
  restaurant_service, para o optimizador continuar puro.

## Tarefa 23 (parte do serviço, adiantada): restaurant_service/ambience_view.py

Feita já na claude/ambiente depois de trazer a martim/restaurantes-impl
(81973f5, tarefa 14) para aqui com um merge normal (a martim/restaurantes-impl
não foi tocada). Ficheiros novos: backend/app/restaurant_service/ambience_view.py
e backend/tests/test_ambience_view.py (16 testes). Alterações pequenas:
light.py passa `_is_night` a `is_night` (público, o serviço usa-o) e uma linha
nova em restaurant_service/READ_ME_FIRST.md e no ambience/READ_ME_FIRST.md.

AINDA NÃO FEITO (precisa da tarefa 17 do Codex, ficheiros proibidos para mim):
- routers/owner_rooms.py: GET /api/owner/restaurants/{vid}/ambience-preview
  (dono, rascunho guardado) chama ambience_payload(..., detail=True).
- routers/restaurants.py: GET /api/r/{vid}/ambience?date=&time=&party=
  (público, com _limit(..., "read", READ_LIMIT)) chama ambience_payload.
- Teste de API backend/tests/test_ambience_api.py (isolamento do dono, 404 em
  rascunho, limite de leituras, sem dados pessoais).

Decisões:
- Sala implícita (restaurante sem salas guardadas): retângulo width x height,
  sem norte e sem janelas, id None. Não afirma sol nem vista.
- Mesas com room_id que não existe contam como da sala implícita.
- Dois momentos: a estadia [start, start + turn_minutes) dá frases e números;
  `moment` (o cursor do cliente, por defeito start) só mexe nas manchas e no
  véu da noite. Resposta traz `time`, `stay_start`, `stay_end`.
- Sem lat/lng: `located: false`, `sun: null`, sem mesas, manchas vazias.
- Resposta leve = {id, light, phrases} por mesa (spec); `detail=True` junta
  sun_minutes, sun_until/from, sunset_at, dark_at, view (com photo_url
  /api/photos/<public_id>, só metadados, nunca bytes), near, quiet, features.
- `sun` (nascer, pôr, azimute, altura) vai sempre, também na resposta leve,
  para a ferramenta Light (tarefa 24) mostrar a direção do sol.
- Manchas à noite: lista vazia, mesmo que a geometria desse alguma coisa.
- Desempenho medido: 200 mesas, 4 janelas, estadia de 2 h, 0,5 s. Sem cache.

## Tarefas 23 (rota pública), 27 (parte backend) e 31 (parte backend)

Feitas na claude/ambiente, num só commit. Ficheiros: restaurant_service/
ambience_view.py (describe_room, table_features, rooms pré-carregadas),
map_view.py, occupancy.py, availability.py, diner_flow.py, alternatives.py,
manage_flow.py, booking_rows.py, staff_floor.py, routers/restaurants.py,
docs/CONTRACT.md; testes novos test_map_rooms.py (8) e
test_ambience_prefs_flow.py (8). Suite completa: 756 passed.

O que ficou FEITO:
- GET /api/r/{vid}/ambience (público, READ_LIMIT, party e hora validadas como
  no mapa; `moment` opcional move só manchas e véu da noite).
- GET /api/r/{vid}/map ganha `rooms` (contorno, aberturas sem sun_rule/hora/
  altura, elementos, `sun`, `sun_patches`, `night`) e em cada mesa `room_id`,
  `is_active`, `ambience` (null se o restaurante não tem coordenadas). Os
  campos antigos não mudam.
- Mesas inativas: occupancy.venue_tables() só devolve as ativas (mapa,
  optimizador, validação de hold, dashboard). O staff continua a ver uma mesa
  inativa enquanto ela tiver uma reserva a essa hora (include_inactive).
- Preferências: PartyNeeds.prefs, clean_prefs (conhecidas, no máximo 5, sol e
  sombra não juntos, senão 422), `?prefs=sun,view` no mapa, `prefs` no hold
  ("Choose for me") e na reserva (guardadas ordenadas em bookings.prefs e em
  describe() para o staff). A mudança de reserva (manage_flow) mantém-nas.
  As features das mesas vêm de ambience_view.table_features (mesma conta do
  cartão de ambiente). O 409 com alternativas também as usa.

O que NÃO foi feito (e porquê):
- GET /api/owner/restaurants/{vid}/ambience-preview: vive em owner_rooms.py
  (proibido para mim, tarefa 17 do Codex). Chama ambience_payload(session,
  venue, dia, hora, detail=True); falta só a rota e o teste de isolamento.
- service_plan.py / whatif.py (staff): continuam sem preferências. As features
  dependem da hora de cada reserva, e o optimizador de serviço usa um só
  conjunto de TableSpec; precisava de features por festa. Não mexi para não
  arriscar o que já funciona; o pedido de reserva já guarda as prefs.
- Frontend (RoomLayers.tsx, SeatMap.tsx, StepTable/StepParty): ver abaixo.

Observação para o Martim/Sérgio (não é meu código): load_restaurant() não
esconde restaurantes em rascunho; quem tiver o public_id acede ao mapa e agora
também à rota de ambiente. A tarefa 25/29 (Sérgio) deve esconder rascunhos.

## Tarefa 35: PNG da sala para o email (backend/app/mail/restaurant_picture.py)

Ficheiros novos: mail/restaurant_picture.py e tests/test_restaurant_picture.py
(20 testes que descodificam o PNG e olham para pixéis reais). O
mail/seat_picture.py dos eventos NÃO foi alterado: importo dele a tela, o
marcador "YOU" e o contorno das mesas, e acrescento o que faltava (preencher
polígonos não convexos, paredes grossas).

Decisões:
- Entradas = dataclasses do motor (AmbienceRoom, AmbienceTable, AmbienceSeat):
  não têm campo para pessoas, por construção. O chamador passa só as mesas e
  cadeiras da sala da reserva (spec: com várias salas desenha só essa).
- Contorno curvo/em L preenchido por varrimento par-ímpar; curvas a 24 pedaços.
- Janela e parede de vidro: linha azul clara grossa; porta: interrupção
  castanha clara na parede; elementos fixos: cinzento claro com o nome (só se
  couber e o tipo de letra o escrever); sala exterior: chão verde claro.
- Mesa reservada: âmbar com contorno escuro (mais a etiqueta e a cadeira, não
  só a cor); as outras mesas todas iguais; cadeiras das outras: anéis ocos.
- Sem cadeira escolhida (reserva só por mesa) só destaca a mesa.
- Cabeçalho "MAIN ROOM - TABLE 4 - SEAT 2"; o que o tipo de letra não escreve
  (acentos, nomes longos) cai: primeiro o nome da sala, depois a cadeira, e no
  fim "YOUR TABLE". Nunca mostra texto errado.
- Falta (tarefas 32/36, do Martim/Sérgio): quem monta as entradas a partir da
  BD e do `ambience_view.load_rooms` e liga o PNG ao email inline (cid:seatmap).

Nota sobre um teste que falha às vezes (não é meu): test_redteam.py::
test_s1_forged_forwarded_for_cannot_dodge_the_login_limit faz 12 pedidos e
espera 10 x 401 e depois 429. O limitador (security.rate_limit) conta por
minuto de calendário; se os 12 pedidos atravessarem a virada do minuto (mais
provável com a bateria toda a correr) o contador recomeça e o teste falha.
Passa isolado. Não mexi (código de segurança e teste de outro). O meu teste do
limite de leituras do /ambience foi escrito a contar com isto (2 x limite + 1).

## Tarefa 32 (parte backend): cadeira escolhida

Ficheiros: restaurant_service/chosen_seat.py (novo), ambience_view.seat_sentence,
diner_flow (seat_id), booking_rows.describe (seat, with_phrase), manage_flow e
staff_floor (largam a cadeira se as mesas mudam), routers/restaurants.py
(BookingIn.seat_id), routers/bookings.py (GET /b/{token} com a frase);
tests/test_chosen_seat.py (9).
- A cadeira é só indicativa: sem hold nem verificação contra outras reservas.
- 422 (mesma mensagem) para cadeira desconhecida, de outro restaurante, de
  outra mesa ou bloqueada; a validação acontece ANTES de gastar o hold, por isso
  o cliente não perde a mesa por escolher mal a cadeira.
- describe() devolve `seat` {id, label, table_id} e, com with_phrase (confirmação
  e página de gestão), `phrase`. A lista do staff não calcula a frase (uma
  reserva por linha seria N consultas).
- Mudar a hora mantém a cadeira; se as mesas mudam (o optimizador escolhe
  outras, ou o staff move a reserva) a cadeira é largada em vez de apontar
  para uma mesa que já não é da reserva. A tarefa 33 (Sérgio) fará o
  PATCH seat_id ("Change seat") e pode reutilizar check_chosen_seat.
- Falta o frontend (ChooseSeat, SelectionPanel, Confirmation) e o email (34/35).

## Tarefa 27 (parte frontend): salas no SeatMap

Ficheiros: frontend/src/seatmap/RoomLayers.tsx, roomScene.ts (novos, com
testes: 11 + 8), SeatMap.tsx (props opcionais rooms, activeRoomId, showSun),
seatmap.css (classes room-*), api/types.ts (tipos MapRoom, MapRoomOpening,
MapRoomFixture, MapRoomSun, MapTableAmbience; MapTable ganha room_id,
is_active, ambience opcionais; SeatMapPayload ganha rooms opcional).
- Sem `rooms` o mapa desenha-se exatamente como antes (eventos intactos);
  testado ("draws no room at all when none is given").
- Reutiliza as funções puras do editor (pages/room-editor/geometry.ts e
  FIXTURE_NAMES de roomObjects.ts): só importo, não edito. Se o Codex mudar
  esses exportes, o roomScene.ts é o único sítio a ajustar.
- Cores só com tokens existentes (sol = latão às riscas; janela = info-soft;
  noite = info a 38 %). Contraste: 86 verificações, 0 falhas.
- Verificado a olho com o Chromium do Playwright (sala em L, vidro curvo,
  janela, porta, bar, WC, sol, noite).
- Falta (tarefa 28): StepTable com separadores de salas, contagens, cartão de
  ambiente e o cursor de hora (250 ms) ligado a GET /api/r/{vid}/ambience;
  MapKey com sol/noite/vista. Também passar `rooms` do build_map ao SeatMap.

## Tarefa 28: passo "Table" com salas, cartão de ambiente e cursor de luz

Ficheiros: pages/restaurant/{RoomTabs,LightCursor}.tsx, useLightCursor.ts,
ambienceView.ts (novos), StepTable.tsx, TablePanels.tsx, MapKey.tsx,
restaurant.css, api/restaurant.ts (AmbienceAnswer, getAmbience, stay_start/end),
seatmap/SeatMap.tsx (prop onActiveChange); backend: o mapa passa a trazer
`stay_start` e `stay_end`. Testes: ambienceView.test.ts (14), ambience.test.tsx (12).
Verificação: 286 testes, typecheck, build, contraste (86/0) e e2e 45/45; olhado
no Chromium (desktop).
- Sem `rooms` na resposta nada muda; com uma só sala não há separadores.
- O cartão só aparece se a mesa tiver ambiente (sem coordenadas não se afirma nada).
- Tocar numa mesa continua a segurá-la logo (comportamento antigo e testes
  mantidos); o cartão descreve a mesa sob o ponteiro/teclado, senão a segurada,
  senão a sugerida, com o botão "Hold this table". Se o Martim preferir
  "tocar = ver cartão, botão = segurar" como na letra do spec, é uma mudança
  pequena em StepTable (e nos testes do booking), mas muda o fluxo atual.
- Segurar uma mesa de outra sala (pela lista) muda o separador para essa sala.
- O cursor só aparece se alguma sala tiver `sun` (há coordenadas) e a estadia
  tiver mais de um passo; erro de rede: mensagem e mantém a última imagem.
- Corrigido de passagem: os botões "Hold" da lista liam-se "Holdtable 8"
  (nome acessível); agora aria-label "Hold table 8".
- Falta ainda a prop `prefs` (tarefa 31, StepParty) e a conta das preferências
  no pedido do mapa/hold.

## Tarefa 31 (parte frontend): desejos no passo 1 até à reserva

Ficheiros: pages/restaurant/prefs.ts (novo), StepParty.tsx (cinco caixas
"Sunny table", "In the shade", "With a view", "Quiet corner", "Away from the
toilets"; sol e sombra excluem-se, o último escolhido ganha), StepTable.tsx
(a chave de recarga inclui os desejos), BookingSummary.tsx ("Your wishes"),
SelectionPanel.tsx (staff: "Guest wished for: ..."), api/restaurant.ts
(PartyNeeds.prefs opcional; `?prefs=sun,view` no mapa; `prefs` no hold e na
reserva só quando há desejos; BookingView/StaffBooking.prefs).
Testes: prefs.test.tsx (8). Total frontend: 293 testes, typecheck, build,
contraste e e2e 45/45.
- Sem desejos nada muda nos pedidos (não vai `prefs` vazio).
- O servidor continua a ser quem decide: o desejo só desempata (nunca tira a
  mesa de 2 a um casal para dar a de 8, ver tarefa 30).

## Tarefa 32 (parte frontend e rota de cadeiras)

Backend: GET /api/r/{vid}/seats?table_ids= (chosen_seat.table_seats,
ambience_view.seat_sentences); testes em test_chosen_seat.py (12 no total).
Frontend: ChooseSeat.tsx (novo), useBookingFlow (choosingSeat, seatId, askSeat,
backToMap, chooseSeat), BookingPage, StepTable (Hold guarda tableIds), StepDetails
(seatId), BookingSummary ("Seat 2, facing the window"), SelectionPanel (staff:
"Guest chose seat 2"), api/restaurant.ts (getTableSeats, TableSeats, BookingSeat,
createBooking com seat_id). Testes: chooseSeat.test.tsx (6); o restaurant.spec
do e2e passou a clicar "Skip" e há um e2e novo que escolhe a cadeira e a vê na
confirmação. Frontend: 299 testes, typecheck, build, contraste e e2e.
- O passo da cadeira é uma paragem dentro do passo Table (o Stepper continua
  com 5 passos). Sem cadeiras utilizáveis, ou se não carregam, salta sozinho.
- Mudar de mesa (novo hold) esquece a cadeira; "Back to the map" não larga o hold.
- O toHold passou a devolver também table_ids (teste de conversão atualizado
  só para acrescentar esse campo).
- Falta: cadeira marcada no mapa do staff (padrão "marked"), "Change seat" na
  página de gestão (tarefa 33, Sérgio; o backend já tem check_chosen_seat) e o
  email (34/35/36).

## Continuação do trabalho do Codex (limite esgotado): tarefa 17 e rota de pré-visualização

O Codex ficou com a tarefa 17 por commitar (rooms.py, routers/owner_rooms.py,
tests/test_owner_rooms.py, main.py) na pasta principal. Copiei esses ficheiros
(sem os alterar na pasta principal) para a claude/ambiente, formatei com ruff,
acrescentei 5 testes (isolamento entre donos, ids alheios, atomicidade,
vizinhos, problemas na resposta; 8 no total) e fechei a tarefa 17. A pasta
principal fica com esses 4 ficheiros por commitar: ao fazer o merge de
claude/ambiente na martim/restaurantes-impl convém apagá-los/descartá-los lá
primeiro (git checkout -- backend/app/main.py e remover os 3 novos), senão o
merge recusa por ficheiros não rastreados.
Também a rota GET /owner/restaurants/{vid}/ambience-preview (tarefa 23):
tests/test_ambience_api.py (5).

## Tarefa 18 (continuação do Codex): guardar e recuperar o editor

Ficheiros: frontend/src/api/rooms.ts, pages/room-editor/useRoomDraft.ts (novos),
RoomEditorPage.tsx (carrega do servidor, Save a funcionar, avisos), api/client.ts
(ApiError.details) e types.ts (código stale_layout); removido legacyRoom.ts
(a sala implícita vem agora do servidor). Testes: roomPersistence.test.tsx (10) e
e2e room-editor.spec.ts (telemóvel 390x844: sala 10x7, curva, 2 janelas, norte,
bar, 8 mesas, guardar, recarregar e ver o mesmo; dois separadores com 409 e
"Save mine over it"). O teste unitário antigo do editor passou a responder por
URL (GET venue e GET rooms), sem enfraquecer nada.
- O rascunho local só é oferecido se diferir do guardado; restaurar reaproveita a
  versão atual como base (o servidor continua a ser quem recusa ids apagados).
- Critério de aceitação 6 (telemóvel) e o do conflito entre separadores ficam
  cobertos por e2e. Falta: "desfazer/refazer em todas as ferramentas" (o Codex
  cobriu a maior parte) e o publicar bloquear com erros (tarefa 19).
