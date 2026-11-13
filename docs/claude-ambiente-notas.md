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
