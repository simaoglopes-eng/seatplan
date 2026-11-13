# Relat?rio da noite ? 2026-11-13

## Estado atual

Branch martim/restaurantes-impl. Spec e plano guardados no commit 880624b em martim/restaurantes-spec. Identidade Git configurada apenas neste reposit?rio. Plano com 40 tarefas aprovado durante a prepara??o. Execu??o em curso.

## Linha de base

- Ruff passou e typecheck passou na verifica??o inicial.
- Frontend com 209 passed em 23 ficheiros.
- Backend inicial com uma falha conhecida de concorr?ncia no registo de convidados. Rerun isolado com 1 passed, 1 warning in 1.07s. Exce??o autorizada por Martim.
- Chromium instalado e npm run e2e com 23 passed (24.8s), desktop e 390x844.
- Permiss?es herdadas em pastas tempor?rias/cache exigem pytest com --basetemp ?nico e -p no:cacheprovider. Esta variante mant?m a recolha e execu??o de todos os testes.

## Tarefa 0 ? feita

Criados AGENTS.md, scripts/check_forbidden_paths.py e dois testes que usam reposit?rios tempor?rios. Testes RED com 2 failed antes do script existir e GREEN com 2 passed. Cobrem main, ficheiros untracked/staged/committed, renomea??o e altera??es permitidas. Primeiro lint encontrou quatro chamadas subprocess sem check expl?cito, j? corrigidas sem alterar asser??es.

Verifica??o real antes do commit

- Guard com --base main passou.
- backend ruff check . passou.
- backend ruff format --check . deu 160 files already formatted.
- backend python -m pytest -q -o addopts= -p no:cacheprovider --basetemp <diret?rio ?nico> deu 600 passed, 3 warnings in 98.61s.
- frontend npm run typecheck passou.
- frontend npm test deu 209 passed em 23 ficheiros.
- git diff --check e ruff check do script passaram.
- Commit identificado pela mensagem chore: protect event paths during restaurant implementation. O hash ser? registado na entrada seguinte.

## Regras de recupera??o autorizadas

Se surgirem novas regress?es, confirmar martim/restaurantes-impl e recuperar ?ltimo commit verde com git reset --hard, preservando e repondo este relat?rio. S? a falha conhecida admite rerun isolado. Tarefas sem solu??o ap?s duas tentativas ou decis?o em falta ficam registadas e segue-se a pr?xima tarefa vi?vel.

## D?vidas para a manh?

As 18 quest?es do plano incluem incompatibilidade entre key de quatro elementos e testes atuais de tr?s, ?ndices de migra??o com teste hist?rico limitado a events/guests, permiss?es de geolocaliza??o, privacidade/cache das fotos e reten??o de hist?rico de mesas. As decis?es conservadoras ser?o registadas antes de implementar cada uma.

## Tarefa 1 ? feita

Depend?ncia do S?rgio executada por autoriza??o do Martim. Contratos de coordenadas, rooms, ambiente, erros e compatibilidade adicionados a docs/CONTRACT.md. Decis?es conservadoras registadas em docs/decisions-log.md. Tarefa 0 conclu?da em ecc6dfc. Verifica??o completa executada. Ruff check passou, ruff format --check deu 160 files already formatted, pytest com diret?rio tempor?rio ?nico e sem cache deu 600 passed, 3 warnings in 112.59s. npm run typecheck passou e npm test deu 209 passed em 23 ficheiros. Guard e git diff --check passaram. Commit documental identificado pela mensagem docs: define restaurant platform compatibility contracts.

## Tarefa 2 ? saltada ap?s recupera??o autorizada

Depend?ncia do S?rgio tentada. Teste novo RED observado e migra??o nova GREEN, mas o conjunto com testes existentes deu 1 failed, 16 passed. Falhou test_fresh_and_upgraded_databases_have_the_same_shape por ordem diferente de colunas na base nova e migrada. Ruff encontrou duas chamadas dict a converter em literais no teste novo. Nenhum teste existente foi editado. Conforme instru??o de Martim, aplicado git reset --hard 54f89d7 apenas ap?s confirmar martim/restaurantes-impl. ?ltimo commit verde e contrato permanecem 54f89d7.

Diff integral da tentativa preservado em C:\Users\marti\AppData\Local\Temp\seatplan-task2-rejected-bcjuacb4\task2.patch. Tarefa seguinte vi?vel ? 3, geometria pura. A migra??o deve ser retomada colocando colunas novas depois das antigas nas classes, com a mesma ordem de NEW_COLUMNS, antes de voltar a verificar. O c?digo rejeitado e os testes novos est?o preservados no patch de diagn?stico.

## Tarefa 3 ? feita

Tarefa 1 conclu?da em 54f89d7. Geometria pura implementada com Point imut?vel, contorno circular aproximado, ponto na borda inclu?do, ?rea com sinal, ret?ngulo rodado e rumo/normal. RED por m?dulo inexistente, seguido de 4 passed no teste novo, incluindo hypothesis para invari?ncia da ?rea. Ruff check passou e formato deu 164 files already formatted. Bateria completa passou. Pytest com --basetemp novo e -p no:cacheprovider deu 604 passed, 3 warnings in 99.06s. npm run typecheck passou e npm test deu 209 passed em 23 ficheiros. Guard e git diff --check passaram. Guia do m?dulo criado. Commit identificado pela mensagem feat: add pure restaurant outline geometry.

## Tarefa 4 ? feita

Tarefa 3 conclu?da em 1839a52. solar.py implementado com biblioteca padr?o e equa??es prim?rias NOAA consultadas em https://gml.noaa.gov/grad/solcalc/solareqns.PDF. Testes RED por m?dulo inexistente, depois 8 passed. Lisboa ver?o/inverno, altitude/azimute ao meio-dia, noite, Troms? e valida??o de entradas. Ruff check passou. Bateria completa executada. Ruff check passou, formato com 166 files already formatted, pytest sem cache e com tempor?rio novo com 612 passed, 3 warnings in 105.17s. Typecheck passou, Vitest com 209 passed em 23 ficheiros, build passou em 128ms, contraste com 86 checks e 0 failures, E2E com 23 passed (23.4s). Guard e git diff --check passaram. Commit identificado pela mensagem feat: calculate restaurant solar position and daylight times. Pr?ximo trabalho ? retomar a depend?ncia 2 com a ordem de colunas corrigida antes da tarefa 5.
