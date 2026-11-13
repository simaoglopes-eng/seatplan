# Relatório da noite — 13 de novembro de 2026

## Coordenação atualizada por Martim

Claude trabalha em C:\Users\marti\seatplan-claude, branch claude/ambiente,
a partir de martim/restaurantes-impl. Ficam com ele as tarefas 21, 22 e 30:
backend/app/ambience/light.py, models.py, table.py, phrases.py e optimizador
restaurant_*.py. Codex não altera esses módulos. A referência models.py nesta
lista é backend/app/ambience/models.py.

Codex segue 12, 13, 14, 15, 16, 17, 18, 19 e 20, com commit verificado por
tarefa e sem parar entre tarefas. Antes de começar 23, pára para Martim
confirmar que claude/ambiente está pronta. Só depois faz merge dessa branch
na impl e corre a bateria completa antes de prosseguir. Sem push nem PR.

Trabalho em curso na branch martim/restaurantes-impl. Último commit verde
antes da tarefa 16, ab18e82. Spec e plano aprovados por Martim, commit 880624b
na branch martim/restaurantes-spec. Identidade Git configurada apenas neste
repositório. Plano com 40 tarefas.

## Tarefas e commits

| Tarefa | Estado | Commit | Resultado |
|---|---|---|---|
| Spec e plano | Feita | 880624b | Leitura e inventário concluídos |
| 0 — Proteção | Feita | ecc6dfc | AGENTS.md, guard e dois testes reais de Git |
| 1 — Contratos | Feita | 54f89d7 | Dependência do Sérgio executada por autorização |
| 2 — Modelos e migração | Feita | 2f984a4 | 30 tabelas, migração repetível e formato legado preservado |
| 3 — Geometria | Feita | 1839a52 | Contorno circular, normais, rumos, área e contenção |
| 4 — Sol | Feita | 7581213 | Posição e horas solares, fusos e casos polares |
| 5 — Registo e isolamento | Feita | dca8703 | Código, consentimento, concorrência, staff apenas demo |
| 6 — Área do dono | Feita | d4eefca | Formulários, cartões privados e destino do login |
| 7 — Modelo do editor | Feita | 2587840 | Geometria TS e operações imutáveis |
| 8 — Estrutura e formas | Feita | 8abad49 | Salas retangulares, em L e desenho livre |
| 9 — Curvas e cantos | Feita | 3e6e651 | Arcos circulares, arrasto e propriedades acessíveis |
| 10 — Aberturas e norte | Feita | 2fc9ea5 | Janelas, portas, vidro, normais em arcos e bússola |
| 11 — Elementos e zonas | Feita | 022fd28 | Paletas, colocação, arrasto, campos e desfazer |
| 12 — Perfil e localização | Feita | a97f0ac | Slug, Identity/Location persistidos, Leaflet e geolocalização explícita |
| 13 — Fotos | Feita | 3ddb8bb | Galeria privada, resize, capa/ordem e foto de vista |
| 14 — Mesas e cadeiras | Feita | 81973f5 | Quatro formas, balcão unilateral, propriedades e cadeiras individuais |
| 15 — Gestos e seleção | Feita | ab18e82 | Alinhar, distribuir, duplicar, pegas, atalhos e toque longo |

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

## Tarefa 5 — feita

Dependência do Sérgio executada para desbloquear o editor do dono. Registo
por código com consentimento, limites partilhados, código associado ao browser,
cinco tentativas, consumo único e login de organizador. Isolamento aplicado
ao staff e ao caminho alternativo /venues apenas para restaurantes.

RED inicial com quatro falhas esperadas. Após implementar, 39 testes de
contas/staff/migrações passaram. A segurança adicional passou sete testes,
incluindo duas confirmações simultâneas com um único 201 e 404/409 no outro
pedido. Código demo omitido para caixas de correio reais.

A fixture Test Bistro foi marcada explicitamente is_demo=True para preservar
os cenários operacionais do staff. Nenhuma asserção antiga foi alterada.
O teste novo exige 404 para restaurantes reais, incluindo acesso por /venues.
O seed Casa Lumen também marca is_demo=True. Guias, API e OpenAPI atualizados.

Verificação final com 621 passed, 3 warnings em 101,82 s. Ruff check passou,
formato com 170 ficheiros, typecheck passou e npm test com 209 passed em
23 ficheiros. O teste adicional confirma que um signup substituído não
consome o código novo. A escrita atómica compara também os hashes do signup
e do código para proteger substituições concorrentes. Guard e diff check
passaram. Commit identificado por feat: register restaurant owners and isolate real venues.

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

## Tarefa 6 — feita

Dependência do Sérgio executada para dar entrada ao editor. Testes RED para
GET /owner/restaurants inexistente e componente de registo inexistente.
Depois passaram nove testes backend e um teste do formulário, com fetch na
fronteira HTTP. Typecheck passou. O login existente mantém o destino original
e a rota /owner/sign-in usa /owner por defeito.

Dois Playwright novos passaram em 7,9 s, com axe sem violações e ausência
de scroll horizontal. Capturas desktop e 390x844 inspecionadas visualmente.
Imagens temporárias em seatplan-owner-signup-390.png e
seatplan-owner-home-1440.png na pasta temporária do Windows. A lista usa a
API privada e mostra progresso, estado e links para as etapas seguintes.
Essas etapas serão implementadas pelas tarefas posteriores do plano.

Verificação final completa com 622 passed, 3 warnings em 112,14 s no backend.
Ruff check passou e formato com 171 ficheiros. Typecheck passou e Vitest com
210 passed em 24 ficheiros. Build passou em 124 ms, contraste com 86 checks
e 0 failures e Playwright com 26 passed em 25,7 s. A captura dos cartões
foi inspecionada e o cartão único ajustado para manter largura de cartão.
Guard e diff check passaram. Commit identificado por feat: add owner signup and private restaurant home.

## Tarefa 7 — feita

Modelo imutável do editor e geometria TS criados com testes RED antes dos
módulos existirem. Depois passaram cinco testes, com os mesmos casos de
referência do Python para área, bordas, semicírculo, rotação e rumo.
Operações addRoom/replaceRoom preservam os objetos anteriores e limitam a
cinco salas. Typecheck passou. Guia do módulo criado. Bateria completa passou
com 622 passed, 3 warnings em 103,21 s no backend, Ruff check verde e formato
com 171 ficheiros. Vitest com 215 passed em 25 ficheiros. Guard e diff check
passaram. Commit identificado por feat: add immutable room model and browser geometry.

## Tarefa 8 — feita

Tarefa 7 concluída em 2587840. Estrutura do editor, salas, retângulo, L e
desenho livre com grid de 50 cm, réguas e desfazer/refazer. O adaptador lê
a planta antiga para uma Main room implícita, preservando ids. Gravação no
servidor depende das tarefas 17–18 e está ainda indisponível nesta etapa.

RED observado para os novos módulos e para nomes vazios/dimensões inválidas.
Depois passaram nove testes do editor. Três Playwright passaram em 8,1 s
com salas em L a 1440 e 390 px e desenho por toques. Capturas desktop e
390x844 inspecionadas. Teste de largura confirma ausência de scroll lateral.
Guias atualizados. Bateria completa com 622 passed, 3 warnings em 110,25 s
no backend, Ruff verde e formato com 171 ficheiros. Typecheck passou,
Vitest com 219 passed em 27 ficheiros, build em 130 ms, contraste com
86 checks e 0 failures e Playwright com 29 passed em 29,6 s. Guard e
diff check passaram. Commit identificado por feat: build room editor shell and initial shapes.

## Tarefa 9 — feita

Curvas circulares em SVG, seleção e arrasto de cantos e meios das paredes,
campos acessíveis de comprimento, flecha e posição. Inserir cantos preserva
o círculo original. Remover mantém pelo menos três cantos. Desenho livre
ignora toques repetidos e normaliza o sentido horário. Cada arrasto cria
um único passo de histórico. Ctrl+Z, Ctrl+Y e Delete disponíveis fora de inputs.

RED por módulo de edição inexistente, depois cinco testes puros verdes com
retângulos, semicírculo e quarto de círculo. Passaram 14 testes do editor.
Quatro Playwright de paredes passaram em 8,6 s, incluindo arrasto a 1440 e
390 px, formulários no ecrã de telefone e duplo clique sem criar um canto.
Os três testes anteriores de criação de salas também passaram. Axe sem
violações no editor. Captura de parede curva em 390x844 inspecionada.
Decisão conservadora sobre aberturas registada.

Recuperações: a bateria ampliada atingiu o limitador real de login nos testes
de geometria; a segunda corrida revelou leitura antecipada da contagem do staff
ao mudar para as 20:00 (esperava 6, recebeu 1: a contagem inicial ainda era a da
hora anterior). Em ambos os casos foi confirmada a branch impl e executado
git reset --hard 8abad49, preservando patch e diagnóstico na pasta temporária.
Segundo diagnóstico: seatplan-task9-floor-race-s_klqnou. Opção conservadora:
sessão real reutilizada nos testes de geometria e espera explícita pelos dados
das 20:00 no teste do staff. Asserções finais e limitador preservados.

Verificação após essas correções: Playwright 33 passed em 33,8 s; typecheck
passou, Vitest 224 passed em 28 ficheiros, build em 156 ms, contraste 86 checks
e 0 failures. Guard e diff check passaram. Ruff passou e formato com 171
ficheiros. Pytest final: 622 passed, 3 warnings em 114,67 s, com --basetemp
novo, -o addopts= e -p no:cacheprovider, tal como nas tarefas anteriores.
Commit identificado por feat: edit curved room walls and corners.

## Tarefa 10 — feita

Testes RED observados para os módulos de aberturas e norte inexistentes.
RED adicional para vidro que não acompanhava o novo comprimento da parede.
Depois nove testes de paredes/contornos e um de norte passaram. Posição em
arcos medida pelo comprimento do arco, rumo pela normal no meio da abertura.
Foto de vista integra-se com upload e API nas tarefas 13/17; a referência
opening_id só existe após persistir. Bússola opcional consultada em MDN e
W3C, sem biblioteca nova. Campos manuais e direção absoluta têm prioridade.

Três Playwright novos passaram em 9,3 s: formulários a 1440/390, sobreposição
recusada, tags e vistas preservadas, mover/redimensionar/desfazer e rodar o
norte. Axe sem violações. Capturas desktop e telefone inspecionadas. A revisão
visual encontrou os botões de zoom abaixo da área da planta quando o painel
é longo; alinhamento corrigido para os manter junto à planta. Teste adicional
RED/GREEN para definir norte 0° a partir de null; campo vazio distingue ambos.
Bússola física iOS/Android não testada. Referências consultadas:
https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent e
https://www.w3.org/TR/orientation-event/ . A primeira bateria deu 36 E2E verdes;
repete-se frontend após os dois ajustes finais, com pytest ainda em curso.

Pytest final passou com 622 passed, 3 warnings em 138,98 s. Ruff check e
formato passaram (171 ficheiros). Typecheck e 230 Vitest em 31 ficheiros
passaram; build final em 133 ms. Contraste: 86 checks, 0 failures. Guard e
diff check passaram. Última corrida completa Playwright: 36 passed em 32,2 s.
Commit identificado por feat: add room openings and north orientation.

## Tarefa 11 — feita

Elementos fixos e zonas com modelo imutável, ícone/nome, dimensões, forma,
rotação e posição por campos. Paleta por arrasto, toque seguido de colocação
e botão de colocação. Arrastar objetos mantém um passo de desfazer por gesto.
Ao apagar zona, só se limpa a ligação das respetivas mesas; mesas preservadas.
Zonas legadas stage continuam legíveis/editáveis, sem alargar a paleta do spec.

RED observado antes de existir roomObjects e para operações de zonas em falta.
Depois três testes passaram, cobrindo os onze elementos e sete zonas, círculos,
ids, limites dos campos, remoção de ligação e imutabilidade. RED de navegador
com ferramentas ainda desativadas, depois dois testes passaram em 8,5 s a
1440/390 com edição, desfazer/refazer, axe sem violações e sem scroll lateral.
Capturas inspecionadas. Contenção e avisos de sobreposição pertencem à tarefa
16; esta etapa ainda permite colocação fora do contorno, como documentado.

O teste novo de arrasto da paleta falhou inicialmente porque o painel comprido
deslocava a página durante o gesto. Corrigido com scroll independente do painel
no desktop; os três testes passaram em 9,2 s, incluindo drop real e desfazer
de movimento. Captura desktop final inspecionada. Teste RED adicional garante
que nomes legados de zona com 80 caracteres continuam editáveis/movíveis.
Limite preservado em vez de o reduzir. Primeira bateria: 233 Vitest e 39 E2E
verdes. Verificação final após este ajuste de compatibilidade em curso.

Verificação final: Ruff check e formato passaram (171 ficheiros), pytest
622 passed, 3 warnings em 121,93 s; typecheck passou, Vitest 234 passed em 32
ficheiros, build em 137 ms, contraste 86 checks e 0 failures; Playwright
39 passed em 36,2 s. Variante pytest com --basetemp novo, -o addopts= e
-p no:cacheprovider. Guard e git diff --check verdes. Sem bibliotecas novas.
Commit identificado por feat: add fixed room elements and zones.

## Tarefa 12 — feita

Dependência do Sérgio executada por autorização de Martim: identidade, perfil,
slug e localização. API cria rascunhos privados, valida cozinhas/contactos/URLs,
coordenadas/fusos, preserva slug publicado e resolve nomes simultâneos com
índice único e savepoints. GET canónico /owner/restaurants/{vid}, com alias
/profile. Assistente guarda Identity/Location e retoma os valores do servidor.
Cartões de rascunho têm Continue setup. Próximos passos ligam-se nas tarefas
13/19. Sem alterações aos módulos reservados ao Claude.

RED inicial com POST em falta (405), depois dois testes passaram. A bateria
dirigida final deu 28 passed em 3,26 s, incluindo três criações simultâneas,
isolamento, colisão de slug, links publicados fixos, URLs enganadores e campos
inválidos. Geolocalização só após clique confirmada no componente e no browser.
Leaflet 1.9.4 e @types/leaflet instalados; @types/geojson é dependência transitiva
de tipos. npm audit reportou 0 vulnerabilidades na instalação.

Teste novo do assistente detetou estado inicial antigo ao mudar da URL nova
para a persistida; escolha conservadora: chavear pelo perfil carregado. Também
detetou o GIF data: interno do Leaflet ao cancelar mosaicos. Decisão 15 regista
a adição apenas a img-src, sem relaxar scripts/estilos. Mapa carregado por
importação dinâmica, com atribuição OSM e referer só da origem. Fontes primárias:
https://leafletjs.com/reference-1.9.4.html e
https://operations.osmfoundation.org/policies/tiles/ .

Playwright dirigido final: 1 passed em 8,2 s, com criar, guardar, recarregar,
retomar, pin por clique/arrasto, geolocalização e edição de slug. Axe sem
violações na localização. Capturas de perfil/localização desktop e 390x844
inspecionadas. Verificação no deploy fica pendente porque não foi autorizado
deploy. Bateria completa em curso.

Bateria completa final: Ruff check e formato passaram (173 ficheiros), pytest
650 passed, 3 warnings em 114,46 s; typecheck passou, Vitest 235 passed em 33
ficheiros, build em 299 ms (Leaflet em chunk separado), contraste 86 checks
e 0 failures; Playwright 40 passed em 38,8 s. Guard e diff check passaram.
Pytest com --basetemp novo, -o addopts= e -p no:cacheprovider. Commit identificado
por feat: add owner profiles and resumable restaurant location setup.

## Tarefa 13 — feita

Dependência do Sérgio executada: fotos privadas, galeria, capa/ordem/texto,
foto por janela persistida e redimensionamento no browser. Sem novas bibliotecas
Python/JS. Cabeçalhos JPEG/PNG/WebP inspecionados sem descodificador; não é uma
validação integral dos pixels. Limite conservador de dimensões 1600 px no
servidor, alinhado com o upload do browser. Fonte WebP consultada:
https://developers.google.com/speed/webp/docs/riff_container .

RED inicial por endpoints inexistentes, depois nove pytest dirigidos passaram
em 2,51 s: magic bytes, PDF disfarçado, ficheiros truncados/excessivos, dez fotos,
isolamento em todas as operações, ordenação/capa, uma vista por janela e rate
limit 60/h. Primeiro teste de resize RED por módulo inexistente, depois verde.
Dois Playwright dirigidos passaram em 8,6 s: resize real 2400→1600, descrição
persistida, capa/ordem/remover, privacidade e capa no cartão do dono; segundo
resize real 1600→1200 quando o primeiro JPEG passa 800 KB. Um primeiro ficheiro
de ruído RGB continuava acima de 800 KB e foi corretamente recusado: o caso
de fallback usa ruído monocromático que cabe em 1200, mantendo a asserção exata.

Capturas desktop e 390x844 inspecionadas, axe sem violações e sem scroll lateral.
Pré-visualizações privadas usam fetch autenticado e URL blob, libertada ao sair.
Blob permitido só em img-src. Janela sem id mostra pedido para guardar a sala;
com id liga ao editor de foto. Tarefa 17 concluirá essa persistência. Galeria
de rascunho usa private/no-store; caches públicas antigas não são revogáveis.

Bateria completa final: Ruff check e formato passaram (176 ficheiros), pytest
659 passed, 3 warnings em 113,87 s; typecheck passou, Vitest 236 passed em 34
ficheiros, build em 310 ms, contraste 86 checks e 0 failures; Playwright
42 passed em 41,5 s. Guard e diff check passaram. Pytest com --basetemp novo,
-o addopts= e -p no:cacheprovider. Commit identificado por
feat: add private restaurant photo gallery and browser resizing.

## Tarefa 14 — feita

Quatro formas com dimensões/cadeiras do spec; balcão com cadeiras só num lado.
Reutiliza seatPositions sem alterações. Modelo imutável, IDs preservados,
etiquetas únicas por sala e flags/grupos/zonas. Mover/rodar/redimensionar a mesa
transporta as cadeiras e mantém os desvios manuais. Alterar quantidade de
cadeiras redistribui posições com aviso explícito; preserva IDs, etiquetas e
flags das cadeiras mantidas. Remoção de mesas com reservas é tratada nas tarefas
15/17, sem disponibilizar apagar nesta etapa.

RED por módulo inexistente e depois pelas operações de edição ainda ausentes.
Quatro testes puros passaram, incluindo limites, imutabilidade, IDs e balcão.
Dois Playwright passaram em 8,9 s a 1440 e 390: mesa, quantidade, desfazer,
flags/grupo e cadeira individual. Axe sem violações, sem scroll horizontal.
Capturas desktop e telefone inspecionadas. Typecheck corrigiu a construção
duplicada dos campos da cadeira, preservando só o objeto anterior quando existe.

Terceiro Playwright confirmou arrasto de mesa com cadeiras e arrasto individual,
cada um desfeito num passo; três dirigidos passaram em 9,7 s. Bateria final:
Ruff check e formato verdes (176 ficheiros), typecheck verde, Vitest 240 passed
em 35 ficheiros, build em 303 ms, contraste 86 checks/0 failures e Playwright
45 passed em 43,3 s. Pytest: 658 passed e só a falha conhecida concorrente
dos eventos com [201,422], 4 warnings em 114,49 s. Rerun isolado autorizado:
1 passed, 1 warning em 1,07 s. Linha de base considerada verde pela regra de
Martim; eventos intactos. Pytest com --basetemp novo, -o addopts= e
-p no:cacheprovider. Guard e diff check passaram. Commit identificado por
feat: add restaurant tables and individually editable chairs.

## Tarefa 15 — feita

Seleção por Shift, área, lista e modo múltiplo; alinhamentos, distribuição,
duplicação com novos IDs, eliminação protegida, atalhos, rotação e resize por
pegas. Alternativas em botões/campos. IDs de mesas persistidas com estado de
reservas desconhecido não podem ser apagados; oferece indisponibilidade.
Tarefa 17 vai fornecer esse estado e revalidar as referências reais no servidor.
Decisão conservadora 16 documenta a proteção e o Delete com cadeira selecionada.

RED observado por módulo ausente, operações de cópia/área ausentes e resize
ainda inexistente; quatro testes puros passaram. Teste de navegador inicial
RED antes de ligar controlos. Depois quatro Playwright passaram em 10,8 s com
seleção/atalhos e os três testes anteriores de mesas. Teste adicional de rotação
usava coordenadas anteriores à deslocação da página; medição atual corrigiu-o,
mantendo a asserção de 90°. Teste móvel real encontrou a área invisível de uma
cadeira sobre o centro da mesa; após duas tentativas optou-se conservadoramente
por prioridade do corpo da mesa nessa região, mantendo alvos das cadeiras fora
do corpo. O toque longo e os restantes gestos estão novamente em verificação.

Seis testes dirigidos passaram em 15,5 s: dois de seleção/transformação, três
anteriores de mesas e um toque longo real no projeto mobile (390x844, hasTouch).
A prioridade do corpo usa a ordem das camadas SVG, mantendo os elementos
visíveis como alvos, sem sobreposição transparente adicional. Cinco testes
puros finais passaram. Capturas 1440/390 inspecionadas; axe sem violações.

Bateria final: Ruff check e formato verdes (176 ficheiros), pytest 659 passed,
4 warnings em 117,54 s (um aviso da corrida antiga, sem falha); typecheck verde,
Vitest 245 passed em 36 ficheiros, build em 366 ms, contraste 86 checks e
0 failures; Playwright 48 passed em 49,6 s. Guard e diff check verdes.
Pytest com --basetemp novo, -o addopts= e -p no:cacheprovider. Commit identificado
por feat: add room table selection transforms and touch gestures.

## Tarefa 16 — feita

Validação pura Python/TS com os oito códigos do spec: contorno, contenção,
sobreposição, passagem, elementos fixos, norte, vista e mesas. SAT em retângulos
rodados e círculos, tolerância de juntar 2 cm, pegada +45 cm para passagem.
Mesas inativas continuam físicas nos avisos de passagem/elementos fixos; só
pares ativos têm erro de sobreposição. Contacto sem área não é sobreposição.
Contenção também impede atravessar uma reentrância com os cantos dentro.

RED por módulos inexistentes e por contornos/avisos ainda não implementados.
Seis pytest e seis Vitest dirigidos passaram com os mesmos casos de referência:
mesa rodada fora, círculo que cabe onde os cantos do quadrado não cabem, limite
de juntar exato, curva, reentrância, elemento fixo, informação e publicação.
Pureza/imutabilidade verificadas. Módulos reservados ao Claude não foram alterados.

Teste UI RED antes de ligar os erros; depois 1 passed em 8,2 s, com aviso visual,
seleção e centragem a 1440/390 e axe sem violações. O caso usa restaurante novo
para que os avisos legítimos da demo noutra sala não alterem a contagem esperada.
Capturas inspecionadas. Rascunhos geometricamente inválidos ficam renderizáveis;
a persistência/publicação usarão a mesma validação nas tarefas 17/19. Lista
global de problemas com centragem e marca vermelha/ícone na mesa. Editor passou
a carregamento dinâmico para não aumentar o pacote inicial das outras páginas.

Bateria frontend: typecheck verde, Vitest 251 passed em 37 ficheiros, build
em 295 ms, contraste 86 checks/0 failures e Playwright 49 passed em 52,3 s.
O resultado terminal do primeiro pytest perdeu-se na compactação da sessão;
repetiu-se apenas o backend para conservar evidência verificável em log.

Backend confirmado: Ruff check e formato verdes (178 ficheiros), pytest
665 passed, 3 warnings em 109,35 s, com basetemp novo e cache desativada.
Guard e diff check verdes. Commit identificado por feat: validate restaurant
room geometry and focus layout problems. Nenhum ficheiro reservado alterado.
