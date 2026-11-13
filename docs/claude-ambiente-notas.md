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
