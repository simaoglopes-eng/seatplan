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
