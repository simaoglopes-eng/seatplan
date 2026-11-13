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
