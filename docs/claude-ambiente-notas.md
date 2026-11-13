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
