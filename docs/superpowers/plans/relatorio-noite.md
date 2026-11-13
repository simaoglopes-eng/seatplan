# Relatório da noite — 13 de novembro de 2026

Trabalho em curso na branch martim/restaurantes-impl. Último commit verde
antes da migração, 7581213. Spec e plano aprovados por Martim, commit 880624b
na branch martim/restaurantes-spec. Identidade Git configurada apenas neste
repositório. Plano com 40 tarefas.

## Tarefas e commits

| Tarefa | Estado | Commit | Resultado |
|---|---|---|---|
| Spec e plano | Feita | 880624b | Leitura e inventário concluídos |
| 0 — Proteção | Feita | ecc6dfc | AGENTS.md, guard e dois testes reais de Git |
| 1 — Contratos | Feita | 54f89d7 | Dependência do Sérgio executada por autorização |
| 2 — Modelos e migração | Feita | Commit desta entrada | 30 tabelas, migração repetível e formato legado preservado |
| 3 — Geometria | Feita | 1839a52 | Contorno circular, normais, rumos, área e contenção |
| 4 — Sol | Feita | 7581213 | Posição e horas solares, fusos e casos polares |

## Verificações reais

Cada bateria completa executou backend ruff check ., ruff format --check .,
python -m pytest -q -o addopts=, e frontend npm run typecheck e npm test.
O pytest usa --basetemp novo e -p no:cacheprovider devido a permissões herdadas
na primeira sessão. Todos os testes continuam a ser recolhidos e executados.

| Tarefa | Pytest | Frontend | Formato |
|---|---|---|---|
| 0 | 600 passed, 3 warnings em 98,61 s | 209 passed em 23 ficheiros, tipos passaram | 160 ficheiros |
| 1 | 600 passed, 3 warnings em 112,59 s | 209 passed, tipos passaram | 160 ficheiros |
| 3 | 604 passed, 3 warnings em 99,06 s | 209 passed, tipos passaram | 164 ficheiros |
| 4 | 612 passed, 3 warnings em 105,17 s | 209 passed, tipos passaram | 166 ficheiros |

Ruff e guard scripts/check_forbidden_paths.py --base main passaram em cada
commit, assim como git diff --check. Nenhum caminho protegido foi alterado.
Na tarefa 4, npm run build passou em 128 ms, npm run contrast deu 86 checks
e 0 failures, e npm run e2e deu 23 passed (23,4 s), desktop e 390x844.
O E2E usa E2E_PYTHON com caminho absoluto do venv Windows. Na linha de base
inicial, E2E deu 23 passed (24,8 s) após instalar Chromium.

## Testes primeiro

- Tarefa 0 com dois testes RED antes do script existir, depois dois GREEN.
  Cobrem main, untracked, staged, committed e renomeações.
- Tarefa 2 com RED antes das colunas existirem. O teste novo passou e os
  testes históricos detetaram as diferenças de esquema descritas abaixo.
- Tarefa 3 com RED por módulo inexistente, depois quatro testes verdes,
  incluindo hipótese geradora sobre invariância da área com rotação.
- Tarefa 4 com RED por módulo inexistente, depois oito testes verdes.
  Equações primárias consultadas em https://gml.noaa.gov/grad/solcalc/solareqns.PDF.

## Recuperações autorizadas da tarefa 2

A primeira tentativa deu 1 failed e 16 passed no subconjunto. O teste
test_fresh_and_upgraded_databases_have_the_same_shape encontrou ordem
diferente de colunas. Confirmada a branch e executado git reset --hard
54f89d7. Seguiram-se as tarefas independentes 3 e 4. Diff preservado em
C:\Users\marti\AppData\Local\Temp\seatplan-task2-rejected-bcjuacb4\task2.patch.

A segunda tentativa corrigiu a ordem e isolou published_at como TIMESTAMP
no esquema migrado e DATETIME no esquema SQLite novo. A diferença foi
confirmada por inspeção direta das duas bases temporárias. Executado
git reset --hard 7581213 após confirmar a branch. Diff preservado em
C:\Users\marti\AppData\Local\Temp\seatplan-task2-second-zbfwlg4e\task2.patch.

Após as duas tentativas, escolheu-se a solução conservadora autorizada por
Martim, alinhando o DDL SQLite com DATETIME e mantendo TIMESTAMP em Postgres.
O subconjunto deu 17 passed e 3 warnings em 2,04 s. Ruff passou e formato
deu 167 ficheiros. Bateria completa pendente antes de aceitar a migração.
Os testes existentes foram preservados. Os testes novos rejeitados foram
arquivados com o diff e recuperados na tentativa seguinte.

## Decisões e dúvidas para a manhã

As decisões estão em docs/decisions-log.md e as 18 questões no plano.
Incluem chave do optimizador, índices históricos, geolocalização bloqueada
nos headers, autenticação/cache das fotos, histórico de mesas e publicação
de configuração inválida. O editor usará preview solar do rascunho guardado
no servidor. A demo atual é Casa Lumen, chamada Casa Linho no spec.

Postgres ainda não foi executado porque SEATPLAN_TEST_POSTGRES está ausente.
O teste conhecido de concorrência dos eventos falhou na linha de base inicial
e passou isolado com 1 passed em 1,07 s. As baterias seguintes passaram inteiras.

O stdin do PowerShell danificou acentos nos primeiros documentos gerados.
O plano e este relatório foram corrigidos com escrita UTF-8 direta.

### Compatibilidade do editor antigo

A bateria completa da migração deu 1 failed e 612 passed em 99,98 s.
test_layout_upsert_updates_by_id_and_removes_missing revelou room_id na
resposta antiga, que esse editor devolvia ao servidor e era rejeitado por
extra=forbid. Após confirmar a branch, foi executado git reset --hard
7581213. O diff foi preservado em
C:\Users\marti\AppData\Local\Temp\seatplan-model-compatibility-1o8ksq13\attempt.patch.
A opção conservadora mantém os campos do contrato antigo no serializador
partilhado routers/venues.py. Nenhum ficheiro protegido foi alterado.
O subconjunto com modelos, migrações e plantas passou com 25 passed e
3 warnings em 2,78 s. A bateria completa final passou com 613 passed,
3 warnings em 100,17 s. Ruff check passou e formato com 167 ficheiros.
Typecheck passou e npm test deu 209 passed em 23 ficheiros. Guard e
git diff --check passaram. Modelos, migração e testes novos aceites.
