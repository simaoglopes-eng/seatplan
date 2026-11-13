# Restaurantes: plataforma de descoberta, dono do restaurante e sala com ambiente

Data: 2026-11-13. Visão: Martim (dupla dos restaurantes com o Sérgio).
Estado: rascunho detalhado para aprovação, versão 2.

## 0. Como ler este documento

- **[decisão do Claude]** marca uma escolha que o Martim não fez e que pode
  ser revista. Tudo o resto foi dito por ele ou é consequência direta do
  código existente.
- "Construtor" = quem implementa (pessoa ou agente de código).
- Caminhos de ficheiros são relativos à raiz do repositório.
- Todos os endpoints vivem debaixo de `/api` (`backend/app/main.py` faz
  `include_router(..., prefix="/api")`). Nas tabelas abaixo escreve-se o
  caminho completo.
- Cada secção termina com **Critérios de aceitação**: o trabalho dessa secção
  está feito quando todos são verdade e têm teste.

### Glossário

| Termo | Significado |
|---|---|
| Dono | Pessoa com conta que cria e gere um ou mais restaurantes |
| Cliente | Pessoa que procura restaurantes e reserva (sem conta) |
| Sala | Um espaço desenhado de um restaurante (sala principal, esplanada, piso 1) |
| Contorno | O polígono que forma as paredes de uma sala, com lados retos ou curvos |
| Abertura | Janela, porta ou parede envidraçada colocada num lado do contorno |
| Elemento fixo | Objeto não reservável (bar, cozinha, WC, coluna, toldo, ...) |
| Ambiente | O que se calcula para uma mesa a uma data e hora: luz, sol, vista, o que está perto |
| Mancha de sol | Área do chão onde o sol bate através de uma janela num dado momento |

## 0.1 Como construir isto: regras para o agente de código

Esta secção é para quem implementa (o Claude no Claude Code). Lê-a antes de
qualquer tarefa. O objetivo é andar depressa **sem** partir o que existe nem
acumular código que ninguém percebe na apresentação.

**De onde vem cada regra** (verificado em 2026-11-13 na documentação oficial):

- **[Oficial]** recomendado na documentação da Anthropic:
  [Best practices](https://code.claude.com/docs/en/best-practices),
  [Common workflows](https://code.claude.com/docs/en/common-workflows),
  [Subagents](https://code.claude.com/docs/en/sub-agents),
  [Model config](https://code.claude.com/docs/en/model-config),
  [Commands](https://code.claude.com/docs/en/commands).
- **[Superpowers]** método do plugin "superpowers" instalado nesta máquina
  (skills `superpowers:*`). Não é da Anthropic; é compatível com a
  documentação oficial, mas é uma escolha de método.
- **[Equipa]** regra deste projeto (combinada com o Martim ou decisão do
  Claude para este trabalho).

### Fluxo geral

1. **Spec antes de código, e construir numa sessão nova.** [Oficial] A
   documentação recomenda "entrevistar até poder escrever o spec" e depois
   "começar uma sessão nova para construir a partir dele". Este documento é
   esse spec. Para cada parte grande, usar o **plan mode** (o Claude planeia
   sem editar até aprovares).
2. **Plano em tarefas pequenas, cada uma com commit.** [Superpowers + Equipa]
   O plano de implementação (skill `superpowers:writing-plans`) parte cada
   secção em tarefas pequenas que mudam poucos ficheiros e acabam num commit.
   A documentação oficial só diz "mudanças em incrementos pequenos e
   testáveis"; o commit por tarefa é regra nossa, para os PRs serem fáceis de
   rever.
3. **Uma sessão principal, `/clear` entre tarefas não relacionadas.**
   [Oficial] A documentação diz que hoje o contexto raramente se esgota e que
   **um subagente não dá respostas melhores** (pode até ser mais lento),
   exceto como revisor que não viu o código ser escrito. Por isso: a tarefa é
   feita na sessão principal; entre tarefas sem relação, `/clear`; numa
   sessão longa, `/compact` com um foco.
   - Alternativa [Superpowers]: `superpowers:subagent-driven-development`
     (um subagente por tarefa, com revisão entre tarefas). Funciona, mas gasta
     mais; usar só se a sessão principal começar a perder o fio.
4. **Paralelo só quando é independente, cada um na sua worktree.** [Oficial]
   Sessões em paralelo só para trabalho que não depende uma da outra, cada uma
   com a sua cópia do repositório: `claude --worktree <nome>`. [Equipa] No
   máximo 2-3 ao mesmo tempo, e ficheiros partilhados (`models.py`,
   `migrate.py`, `SeatMap.tsx`, `api/types.ts`, `docs/CONTRACT.md`) nunca são
   mexidos por duas sessões ao mesmo tempo.
5. **Modelos.** [Oficial] O Opus é o modelo por defeito e "trata bem a maior
   parte do código"; o Sonnet custa menos em trabalho de rotina; existe o modo
   **`opusplan`** (Opus a planear em plan mode, Sonnet a executar), que encaixa
   bem neste projeto. Para bugs difíceis de perceber a causa, a documentação
   aponta o Fable. Ajusta-se o esforço com `/effort` e, para um pedido pontual
   de raciocínio profundo, escreve-se `ultrathink` (as frases "think hard" ou
   "be thorough" não fazem nada de especial).
   - [Equipa] Sugestão: `opusplan` por defeito; Sonnet sozinho para tarefas
     mecânicas (formulários, textos, testes de UI); Opus nas partes difíceis
     (geometria dos arcos e do sol, reservas em simultâneo, segurança das
     contas e fotos).
6. **Nada de inventar APIs.** [Equipa] Se não está neste spec nem no código,
   pergunta-se ou regista-se como decisão em `docs/decisions-log.md`.

### Regras garantidas pela ferramenta (não só escritas)

[Oficial] A documentação distingue instruções que o Claude **pode** ignorar
(texto, CLAUDE.md) de regras que a ferramenta **garante** (hooks, regras de
permissão, CI). Escrever "IMPORTANTE" em maiúsculas "provavelmente não
resolve". Por isso, antes da primeira tarefa:

- **Criar um `CLAUDE.md` curto** na raiz do repositório (o repositório ainda
  não tem): os comandos de teste e lint (tabela abaixo), "nunca trabalhar na
  `main`", "não mexer nos ficheiros dos eventos" e o caminho deste spec. Só o
  que o Claude não consegue descobrir lendo o repositório; nada de descrever a
  arquitetura (já está nos `READ_ME_FIRST.md`). [Oficial: manter curto, com os
  comandos]
- **Regras de permissão `deny`** em `.claude/settings.json` para editar os
  ficheiros dos eventos (`frontend/src/pages/events/**`,
  `frontend/src/pages/editor/**`, `frontend/src/pages/join/**`,
  `frontend/src/pages/account/**`, `backend/app/events_service/**`,
  `backend/app/routers/events.py`, `backend/app/routers/attendee.py`, ...).
  Assim é impossível partir os eventos por engano. [Oficial: regras de
  permissão; a lista é Equipa]
- **Hook `Stop`** que corre `ruff check` e `npm run typecheck` e não deixa o
  Claude dar a tarefa por terminada enquanto falharem. [Oficial: exemplo da
  documentação]
- **CI verde** antes de qualquer merge (`.github/workflows/ci.yml` já corre
  tudo). [Oficial: CI como verificação final]
- A skill `update-config` ajuda a configurar os hooks e as permissões.

### Em cada tarefa

1. **Pedido específico.** [Oficial] Dizer que ficheiros, qual o sintoma ou o
   objetivo, as restrições ("sem bibliotecas novas") e como fica "feito".
   Modelo no fim desta secção.
2. **Ler antes de mexer.** [Oficial: "o Claude começa cada tarefa a ler o
   código"; Equipa: em especial] o `READ_ME_FIRST.md` da pasta, as secções
   do spec citadas e o código vizinho. Seguir os padrões existentes
   (`extra="forbid"`, `PlainText`, `ApiError`, 404 para "não é teu").
3. **Testes primeiro.** [Superpowers: `superpowers:test-driven-development`;
   Oficial só para bugs: "escreve um teste que falha a reproduzir o bug,
   depois corrige"] Escrever o teste, vê-lo falhar, implementar, vê-lo passar.
   Obrigatório nas funções puras (geometria, sol, ambiente, validação do
   editor, optimizador) e nas regras de segurança.
4. **Mudança pequena e focada.** [Equipa] Não refatorar outras coisas "de
   passagem".
5. **Verificar com provas antes de dizer "feito".** [Oficial: "dá ao Claude
   uma verificação para correr" e "pede provas: o comando que correu e o
   resultado"; existe `/verify`] Comandos (Windows, a partir da raiz):

   | O quê | Comando |
   |---|---|
   | Lint backend | `cd backend; ..\.venv\Scripts\ruff check .` |
   | Formato backend | `cd backend; ..\.venv\Scripts\ruff format --check .` |
   | Testes backend (só o módulo) | `cd backend; ..\.venv\Scripts\python -m pytest tests/test_<módulo>.py -q` |
   | Testes backend (todos) | `cd backend; ..\.venv\Scripts\python -m pytest -q` |
   | Tipos frontend | `cd frontend; npm run typecheck` |
   | Testes frontend | `cd frontend; npm test` |
   | Build | `cd frontend; npm run build` |
   | Contraste | `cd frontend; npm run contrast` |
   | Browser (Playwright) | `cd frontend; npm run e2e` |

   [Equipa] Durante a tarefa, só o teste do módulo; antes do commit, tudo o que
   a tarefa pode ter afetado; antes do PR, tudo.
6. **Ver a interface a funcionar.** [Oficial: screenshot do browser ao lado do
   que se queria] Abrir a app em local (`/run`) e testar o fluxo no tamanho de
   browser e de telemóvel (390 x 844). No editor de sala isto é obrigatório.
7. **Atualizar a documentação** que a tarefa tornou falsa (`READ_ME_FIRST.md`,
   `docs/api.md`, `docs/data-model.md`, `docs/decisions-log.md`). [Equipa]
8. **Commit** na branch da tarefa. [Equipa]

### Debugging

1. **Reproduzir primeiro.** [Oficial] Dar ao Claude o comando que reproduz o
   problema; de preferência transformá-lo num teste que falha.
2. **Corrigir o rumo cedo.** [Oficial] `Esc` para o Claude a meio; `Esc` duas
   vezes (ou `/rewind`) volta atrás. **Depois de duas correções falhadas,
   `/clear` e escrever um pedido melhor**, em vez de uma terceira tentativa.
3. **Uma hipótese de cada vez.** [Superpowers: `superpowers:systematic-debugging`]
   Mudar uma coisa, confirmar com o teste.
4. **Proibido** [Equipa]: apagar ou desligar testes, esconder erros com
   `try/except`, mudar o teste para bater com um resultado errado.
5. O teste que reproduziu o bug fica no repositório. [Equipa]

### Revisão e auditoria

- **Revisão por quem não viu o código ser escrito.** [Oficial] `/code-review`
  revê o diff num subagente novo que não viu a conversa; uma segunda sessão é
  "o revisor independente mais fácil". Correr antes de cada PR.
- **`/security-review`** [Oficial: o comando existe; Equipa: quando usar] nos
  PRs que mexem em contas e login, isolamento entre donos, fotos e endpoints
  públicos. Verificar sempre: 404 igual para "não existe" e "não é teu";
  limites de pedidos; validação das fotos pelos bytes; nada de SQL montado à
  mão; nenhum nome de cliente em respostas públicas.
- **Bateria completa no fim de cada fase** (dias 1, 5 e 8 da secção 13).
  [Equipa]
- **Rever a revisão:** verificar cada comentário antes de o aplicar.
  [Superpowers: `superpowers:receiving-code-review`]

### Git e PRs [Equipa]

- Nunca trabalhar na `main`; uma branch por tarefa ou grupo pequeno
  (`martim/...`, `sergio/...`).
- PRs pequenos, com o que muda, como testar e que secção do spec cumprem.
- CI verde e revisão do outro membro da dupla antes do merge.

### Modelo de pedido para cada tarefa

```
Tarefa N do plano docs/superpowers/plans/<plano>.md: <título>.
Spec: docs/superpowers/specs/2026-11-13-restaurantes-plataforma-design.md, secções <x.y>.
Lê primeiro: <READ_ME_FIRST.md da pasta>, <ficheiros>.
Não mexer em: <ficheiros>. Sem bibliotecas novas além das do spec.
Feito quando: <critérios de aceitação>; mostra os comandos de verificação que correste e o resultado.
Testes primeiro. Commit na branch <branch>.
```

### Notas do ambiente local (Windows)

- O projeto pede Python 3.12; nesta máquina há Python 3.13 e a instalação e o
  arranque funcionaram. Se aparecer um erro estranho de dependências,
  experimentar com 3.12 antes de mexer no código.
- Comandos com `\` e `.venv\Scripts\` (não `.venv/bin/`).
- O Playwright precisa de `npx playwright install chromium` uma vez.
- Depois de mudar o modelo de dados, apagar `backend/seatplan.db` e correr de
  novo o seed (`python -m app.seed.run` com `DEMO_MODE=1`).

### Idioma

A aplicação e os documentos do repositório estão todos em inglês. **A
interface nova também fica em inglês e as rotas novas também**, para ficar
coerente com o resto da app e com os testes existentes. Os exemplos de texto
de interface abaixo vêm em inglês. **[decisão do Claude]**

## 1. Intenção e porquê

O SeatPlan nasceu para eventos (escolher o lugar num casamento ou numa
conferência). A equipa quer levar a mesma ideia para restaurantes: uma
plataforma de reservas **como o TheFork**, mas onde o cliente **escolhe
exatamente a mesa** (e, se quiser, a cadeira onde se senta) e **sabe como vai
ser essa mesa à hora da reserva**: se apanha sol, se já é noite, o que se vê
da janela, se fica ao lado da casa de banho.

Isto só é possível porque **o dono desenha a sua sala** de forma muito
intuitiva, no telemóvel ou no browser: a forma da sala (com paredes curvas),
as janelas, para onde está virada cada parede, o que se vê de cada janela, os
elementos fixos e onde ficam as mesas e as cadeiras. **O editor de sala é o
grande foco do trabalho.** Tudo o que o cliente vê sai do que o dono
desenhou.

Contexto: trabalho universitário (Introdução à Programação, Nova SBE). Há 10
dias. Este plano é da dupla dos restaurantes, Martim e Sérgio. O Martim quer
tudo ao detalhe; o prazo não é motivo para cortar funcionalidades, mas é
motivo para fazer as coisas pela ordem certa (secção 13).

## 2. O que já existe e se reaproveita

Base: branch `main`, commit `767fbb6`. A vertical de restaurantes funciona
hoje para **um** restaurante de demonstração.

| Já existe | Onde | Como se reaproveita |
|---|---|---|
| Página de reserva em 5 passos (`STEP = party, time, table, details, done`) | `frontend/src/pages/restaurant/BookingPage.tsx`, `useBookingFlow.ts`, `StepParty.tsx`, `StepTime.tsx`, `StepTable.tsx`, `StepDetails.tsx`, `Confirmation.tsx` | É o miolo da nova página pública do restaurante (secção 9). Ganha preferências, salas, ambiente e escolha de cadeira |
| API pública de reserva | `backend/app/routers/restaurants.py`: `GET /api/r/{vid}`, `/slots`, `/map`, `POST /hold`, `DELETE /hold/{id}`, `POST /bookings` | Continua a ser a API da reserva; os pedidos e respostas ganham campos novos, sem perder os antigos |
| Mapa do cliente com estados de mesa (`taken`, `held`, `too_small`, `blocked`, `free`) e recomendação | `backend/app/restaurant_service/map_view.py` (`build_map`) | Ganha salas, contorno, aberturas, elementos fixos e ambiente por mesa |
| Garantia "sem reservas duplicadas" | PK `(table_id, date, slot_index)` em `table_slots` (`models.py`), holds por slot | Não muda. A reserva continua a ser por mesa |
| Gestão da reserva e lista de espera | `/b/:token`, `routers/bookings.py`, `manage_flow.py`, `waitlist.py` | Ganha a cadeira escolhida |
| Painel do staff (Floor, Dashboard, Optimise, Schedule) | `/staff/:venueId`, `routers/staff.py`, `StaffPage.tsx` | Passa a ser o painel do dono, protegido por dono |
| Horário (serviços, tempos de mesa, dias fechados) | `GET/PUT /api/staff/{vid}/schedule`, `StaffSchedule.tsx`, `schedule_edit.py` | É o passo "Horário" do assistente do dono |
| Optimizador | `backend/app/optimiser/restaurant_model.py` (`TableSpec`, `PartySpec`, `ScoreBreakdown`), `restaurant_assign.py` (`recommend_table`, `assign_service`, `whatif_walkin`) | Ganha preferências de ambiente (secção 8.6) |
| Editor de planta (zonas, mesas, cadeiras, desfazer/refazer) | `frontend/src/pages/editor/` (`layoutModel.ts`, `useHistory.ts`, `useUnsavedGuard.ts`, `EditorCanvas.tsx`, `PropertiesPanel.tsx`) e `PUT /api/venues/{id}/layout` com `core/layout.py` (`save_layout`) | **Não se mexe** (os eventos usam-no). O editor novo copia as ideias e reaproveita os módulos puros |
| Cadeiras à volta da mesa | `frontend/src/seatmap/seatPositions.ts` | Gera as cadeiras no editor novo |
| Mapa SVG partilhado (zoom, pan, teclado, leitor de ecrã) | `frontend/src/seatmap/SeatMap.tsx` (props `tables`, `seats`, `zones`, `mode`, `selectable`, `selectedId`, `onSelect`, `highlight`, `marked`, ...), `MapLayers.tsx`, `glyphs.tsx` | Ganha camadas novas: contorno, aberturas, elementos fixos, manchas de sol, noite |
| Emails pela outbox com imagem PNG inline | `backend/app/mail/outbox.py` (`enqueue(..., image_png=...)`), `providers.py` (`cid:seatmap`), `mail/seat_picture.py` (`PictureRoom`, `render_seat_picture`) | O email do restaurante passa a levar o mini-mapa da sala com a mesa e a cadeira |
| Emails do restaurante | `backend/app/restaurant_service/emails.py` (`queue_confirmation`, `queue_change`, `queue_cancellation`, `queue_reminder`) | Ganham foto, ambiente, cadeira e mini-mapa |
| Registo com código por email, limites anti-abuso | `backend/app/events_service/accounts.py` (`count_code_send`, `count_code_check`, `_new_code_row`, `_check_code`, `may_show_code`, `check_new_password`), tabela `email_codes` | Modelo para o registo de donos |
| Login de organizador | `POST /api/auth/login`, `GET /api/auth/me` (`routers/auth.py`); token em `sessionStorage` (`frontend/src/api/client.ts`) | É o login do dono |
| Migração repetível | `backend/app/seed/migrate.py` (`NEW_COLUMNS`, `NEW_INDEXES`) + teste a partir do esquema antigo (`tests/test_migrate_guest_accounts.py`, `tests/fixtures/schema_2026_11_10.*.sql`) | Mesmo padrão para as colunas novas |

**O que não existe:** registo de donos, vários restaurantes por dono com
isolamento, perfil público, fotos, localização, pesquisa, salas com paredes e
janelas, ambiente, página pública por slug. E hoje o papel `staff` vê todos os
restaurantes (`venue_access.load_for_staff`, issue 9 em
`docs/team/issues.md`).

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**

1. Um dono cria conta, cria o restaurante com todos os detalhes e publica-o.
2. Um dono desenha uma ou mais salas: forma com paredes retas e curvas,
   janelas, portas, paredes envidraçadas, norte, elementos fixos, zonas,
   mesas e cadeiras. Descreve a vista de cada janela e corrige o sol à mão
   quando o cálculo não chega. Funciona no browser e no telemóvel.
3. Um cliente encontra restaurantes por nome, perto de si, tipo de cozinha,
   faixa de preço, características ("tem mesas com sol", "tem vista",
   "acessível") e disponibilidade.
4. Na página do restaurante, o cliente vê a sala ao vivo **e o ambiente de
   cada mesa à data e hora que escolheu**, escolhe a mesa e, se quiser, a
   cadeira onde se senta (só indicativa), e reserva.
5. O cliente recebe um email com os detalhes, a foto do restaurante, o
   ambiente previsto e um mini-mapa com a mesa e a cadeira marcadas.
6. Tudo o que já funciona continua a funcionar: reservas sem duplicados,
   painel do staff, optimizador, eventos. Todos os testes atuais continuam a
   passar.

**Não-objetivos**

- Pagamentos, depósitos, cartões.
- Avaliações e comentários.
- API do Google Business Profile (exige negócio verificado e aprovação da
  Google). Fica um campo com o link do Google Maps. **[decisão do Claude]**
- Conta de cliente (reservar continua a ser com email + link de gestão).
  **[decisão do Claude]**
- Aplicação nativa. É uma web app responsiva.
- 3D e sombras projetadas por prédios. O sol é calculado só a partir da
  orientação da janela; o dono corrige à mão.
- Reserva de cadeiras à unidade e mesas partilhadas entre grupos diferentes
  (resposta do Martim, secção 14).

**Anti-objetivos (falhar mesmo que "funcione")**

- **Editor difícil.** Se um dono não consegue desenhar uma sala retangular de
  10 m x 7 m com 2 janelas e 8 mesas em menos de 5 minutos no telemóvel,
  falhámos.
- **Ambiente a mentir.** Dizer "sol" quando à hora escolhida já é noite, ou
  "vista para o rio" numa mesa encostada à parede do fundo. Na dúvida, não
  afirmar.
- **Partir o que existe:** reservas duplicadas, nomes de outros clientes
  visíveis ao público, um dono a ver ou mexer no restaurante de outro.
- **Partir os eventos** (trabalho do Simão e do Federico): o editor
  `/editor/:venueId`, `PUT /api/venues/{id}/layout` e tudo o que os eventos
  usam ficam iguais.

## 4. Estrutura da plataforma

Uma só plataforma. A página inicial passa a ser a descoberta de restaurantes.
**[decisão do Claude, proposta na conversa]**

### 4.1 Rotas do frontend

| Rota | Quem | Página | Ficheiro novo (sugestão) |
|---|---|---|---|
| `/` | público | Descoberta (secção 9.1) | `pages/discover/DiscoverPage.tsx` |
| `/restaurants/:slug` | público | Página do restaurante e reserva (9.2) | `pages/restaurant-public/RestaurantPage.tsx` |
| `/owner/sign-up` | público | Registo de dono (5.1) | `pages/owner/OwnerSignUpPage.tsx` |
| `/owner/sign-in` | público | Login de dono (reaproveita `Login.tsx` com destino `/owner`) | — |
| `/owner` | dono | Os meus restaurantes (5.2) | `pages/owner/OwnerHomePage.tsx` |
| `/owner/new` | dono | Assistente de criação (5.3) | `pages/owner/NewRestaurantWizard.tsx` |
| `/owner/:venueId/profile` | dono | Perfil, fotos, localização | `pages/owner/ProfilePage.tsx` |
| `/owner/:venueId/hours` | dono | Horário (embrulha `StaffSchedule`) | `pages/owner/HoursPage.tsx` |
| `/owner/:venueId/rooms` | dono | **Editor de sala** (secção 6) | `pages/room-editor/RoomEditorPage.tsx` |
| `/owner/:venueId/dashboard` | dono | O painel do staff atual (`StaffPage`) | reaproveita |
| `/demo` | público | A página inicial de demonstração atual (`Home.tsx`) | movida |
| `/r/:venueId`, `/b/:token`, `/staff/:venueId`, `/editor/:venueId`, `/e/...`, `/j/...`, `/my/...`, `/organiser/...` | — | Continuam como estão | — |

`/r/:venueId` continua a funcionar e passa a redirecionar para
`/restaurants/:slug` quando o restaurante tem slug e está publicado.

### 4.2 Cabeçalho comum

Em todas as páginas públicas novas: logótipo SeatPlan (leva a `/`), à direita
"For restaurant owners" (leva a `/owner` se tiver sessão, senão
`/owner/sign-in`) e "Plan an event" (leva a `/demo`, onde estão os links de
eventos). Em mobile, os dois links ficam num menu.

### 4.3 O que muda para os eventos

Só a página inicial (que passa para `/demo`). Os testes que abrem `/` à
procura dos links de demonstração (`frontend/src/pages/Home.test.tsx`,
`demoLinks.test.ts`, os testes Playwright em `frontend/e2e/`) passam a abrir
`/demo`. O construtor confirma com `grep` todos os sítios que navegam para
`/`.

**Critérios de aceitação (4)**

- `/` mostra a descoberta; `/demo` mostra a página antiga com os mesmos links.
- Todos os testes atuais passam depois da mudança de rota.
- Nenhum ficheiro em `pages/events/`, `pages/editor/`, `pages/join/`,
  `pages/account/` é alterado por esta secção.

## 5. Dono do restaurante: conta, lista, assistente e perfil

### 5.1 Conta de dono

**Modelo:** um dono é uma linha em `organisers` com `role = "organiser"`. Não
há papel novo. A mesma conta pode ter eventos e restaurantes. "Owner" é só o
nome que a interface usa. **[decisão do Claude]**

**Registo em dois passos** (mesmo padrão das contas de convidado):

| Passo | Endpoint | Corpo | Resposta |
|---|---|---|---|
| 1. Pedir código | `POST /api/owner/register` | `{name, email, password, consent: true}` | `202 {signup_id, code_shown?}` |
| 2. Confirmar | `POST /api/owner/verify` | `{email, code, signup_id}` | `201 {token, user: {id, name, email}}` |

- `name` 1-120 (`PlainText`), `email` (`EmailStr`, normalizado com
  `accounts.normalise_email`), `password` com as regras de
  `accounts.check_new_password`, `consent` tem de ser `true`.
- O código vai para `email_codes` com `purpose = "owner"` (cabe nos 10
  caracteres da coluna), `password_hash` em scrypt e `name` guardados na linha,
  como faz o registo de convidados. A conta `organisers` só é criada quando o
  código está certo.
- Limites: os mesmos de `accounts.count_code_send`, `count_app_send` e
  `count_code_check`.
- Em modo demo (`DEMO_MODE=1`) o código pode ser mostrado no ecrã, com a mesma
  regra de `accounts.may_show_code`.
- **Email já registado:** a resposta é igual à de um email novo (202), para
  não revelar quem tem conta; o email enviado diz "You already have an account,
  sign in here". **[decisão do Claude]**
- O token devolvido é o mesmo tipo de sessão do login de organizador
  (`security.create_session_token`), guardado como hoje em `sessionStorage`.

**Login:** `POST /api/auth/login` existente. A página `/owner/sign-in`
reaproveita `pages/Login.tsx` com destino `/owner`.

**Isolamento (resolve a issue 9 para restaurantes):**

- `venue_access.load_for_staff` muda: um organizador vê só os seus
  restaurantes; o papel `staff` vê só restaurantes com `venues.is_demo = true`.
  Tudo o resto responde 404, igual a "não existe".
- Todos os endpoints `/api/owner/...` e `/api/staff/...` passam por esta regra.
- Teste obrigatório: o dono A não consegue ler nem alterar nada do restaurante
  do dono B (perfil, salas, fotos, horário, painel, reservas), e a conta
  `staff` de demonstração não vê restaurantes reais.

### 5.2 Os meus restaurantes (`/owner`)

- Lista de cartões, um por restaurante: foto de capa (ou um padrão se não
  tiver), nome, estado (`Draft` ou `Published`), barra "Setup 4 of 6 done", e
  botões **Edit profile**, **Edit rooms**, **Opening hours**, **Dashboard**,
  **View public page** (só se publicado).
- Botão principal **Add a restaurant** → `/owner/new`.
- Estado vazio: "You have no restaurants yet. Add your first one: it takes
  about 10 minutes."
- Endpoint: `GET /api/owner/restaurants` →
  `[{public_id, slug, name, status, cover_url, setup: {done, total, missing: [codes]}}]`.

### 5.3 Assistente "Add a restaurant" (`/owner/new`)

Barra de progresso com 6 passos, botões **Back** e **Save and continue**.
Cada passo grava no servidor ao continuar, por isso o dono pode sair e voltar
mais tarde (o restaurante fica em rascunho). Ao reabrir, o assistente começa no
primeiro passo por fazer.

**Passo 1. Identity**

| Campo | Regra | Obrigatório |
|---|---|---|
| Name | 1-120, `PlainText` | sim |
| Short description | 0-300, `PlainText`, contador de caracteres | não |
| Cuisines | 1 a 3 de uma lista fixa (abaixo) | sim |
| Price range | 1 a 4 (€, €€, €€€, €€€€), com a legenda "per person: under 15 €, 15-30 €, 30-60 €, over 60 €" | sim |
| Phone | como `StepDetails` valida telefones hoje | não |
| Website | começa por `https://` ou `http://`, até 200 | não |
| Instagram | `@` opcional + `[A-Za-z0-9._]{1,30}` | não |
| Google Maps link | o host tem de ser `google.com`/`www.google.com` com caminho `/maps`, ou `maps.app.goo.gl`, ou `goo.gl` com caminho `/maps` | não |

Lista de cozinhas (chaves em inglês, rótulos na UI): `portuguese`, `seafood`,
`petiscos`, `italian`, `pizza`, `japanese`, `sushi`, `chinese`, `indian`,
`nepalese`, `brazilian`, `mexican`, `burgers`, `steakhouse`, `fish`,
`mediterranean`, `french`, `thai`, `korean`, `african`, `vegetarian`, `vegan`,
`brunch`, `fusion`. **[decisão do Claude: a lista]**

Ao continuar pela primeira vez: `POST /api/owner/restaurants {name}` cria o
`Venue` (`kind="restaurant"`, `status="draft"`, `width=1000`, `height=700`,
`organiser_id` = dono) e devolve `{public_id, slug}`. Depois
`PATCH /api/owner/restaurants/{vid}/profile` com os restantes campos.

**Slug:** gerado do nome (minúsculas, sem acentos via `unicodedata`, espaços →
`-`, só `[a-z0-9-]`, máximo 60). Se já existir, junta `-2`, `-3`, ...
Editável no perfil enquanto o restaurante está em rascunho; fixo depois de
publicar, para os links partilhados não partirem. **[decisão do Claude]**

**Passo 2. Location**

- Campo "Address" (texto livre, 1-200) e um mapa (Leaflet + OpenStreetMap)
  centrado em Lisboa (38.7223, -9.1393), zoom 13.
- O dono toca/clica no mapa para pôr o pin e arrasta-o para afinar. Botão
  "Use my current location" (geolocalização do browser, só quando clicado).
- Por baixo do mapa: "Pin at 38.71234, -9.14321. The sun on your tables is
  worked out from this point, so place it on your building."
- Fuso horário: seletor com `Europe/Lisbon` (por defeito), `Atlantic/Madeira`,
  `Atlantic/Azores` e "Other..." (campo de texto validado com
  `known_time_zone`, que já existe em `routers/venues.py`).
- Sem geocodificação automática da morada (nenhum serviço externo).
  **[decisão do Claude]**

**Passo 3. Photos**

- Zona de arrastar e soltar + botão "Add photos" (no telemóvel abre a galeria
  ou a câmara).
- Até 10 fotos da galeria. Aceita JPEG, PNG e WebP até 15 MB no ficheiro
  original. **O browser reduz cada foto** antes de enviar: lado maior até
  1600 px, JPEG qualidade 0.82, com um `<canvas>`. Se o resultado passar
  800 KB, volta a reduzir para 1200 px.
- Cada foto mostra uma miniatura, um campo "Describe the photo" (texto
  alternativo, 0-150, recomendado), "Set as cover" e "Remove". A ordem muda por
  arrastar ou pelos botões "Move left/right" (alternativa acessível).
- A primeira foto passa a capa automaticamente se não houver capa.

**Passo 4. Opening hours**

Embrulha o componente `StaffSchedule.tsx` existente (serviços, tempos de mesa,
dias fechados), com os mesmos endpoints `GET/PUT /api/staff/{vid}/schedule`.
Se o restaurante não tiver serviços, propõe um modelo: "Lunch 12:00-15:00 and
Dinner 19:00-23:00, Tuesday to Sunday", com um botão "Use this".

**Passo 5. Rooms**

Abre o editor de sala (secção 6) dentro do assistente. Ao guardar, volta ao
assistente.

**Passo 6. Review and publish**

- Lista de verificação, cada item com ✓ ou ✗ e um link para o corrigir:
  nome, cozinha, preço, localização, pelo menos 1 foto (recomendado, não
  obrigatório), pelo menos 1 serviço no horário, pelo menos 1 sala com pelo
  menos 1 mesa, nenhum erro no editor (6.9), norte definido em todas as salas
  com janelas.
- Botão **Publish** ativo só quando todos os itens obrigatórios estão feitos.
- `POST /api/owner/restaurants/{vid}/publish` → `200 {status: "published", url}`
  ou `422 {problems: [{code, message, fix_url}]}`. O servidor volta a
  verificar tudo; o browser não é fonte de verdade.
- `POST /api/owner/restaurants/{vid}/unpublish` volta a rascunho. As reservas
  já feitas mantêm-se; só deixa de aparecer na pesquisa e deixa de aceitar
  reservas novas.

### 5.4 Endpoints do dono (resumo)

| Método e caminho | Faz |
|---|---|
| `GET /api/owner/restaurants` | Lista os do dono |
| `POST /api/owner/restaurants` | Cria em rascunho |
| `GET /api/owner/restaurants/{vid}` | Perfil completo (para editar) |
| `PATCH /api/owner/restaurants/{vid}/profile` | Atualiza campos do perfil (só os enviados) |
| `POST /api/owner/restaurants/{vid}/photos` | Envia uma foto (5.5) |
| `PATCH /api/owner/restaurants/{vid}/photos/{photo_id}` | Muda texto alternativo |
| `PUT /api/owner/restaurants/{vid}/photos/order` | `{photo_ids: [...], cover_id}` |
| `DELETE /api/owner/restaurants/{vid}/photos/{photo_id}` | Apaga |
| `GET /api/owner/restaurants/{vid}/rooms` | Salas para o editor (6.10) |
| `PUT /api/owner/restaurants/{vid}/rooms` | Guarda todas as salas (6.10) |
| `GET /api/owner/restaurants/{vid}/ambience-preview?date=&time=` | Ambiente para o editor (7.6) |
| `POST /api/owner/restaurants/{vid}/publish` / `unpublish` | Publicar / despublicar |

Todos exigem sessão (`CurrentOrganiser`) e o restaurante tem de ser do dono
(404 em caso contrário). Todos os modelos pydantic usam `extra="forbid"`, como
manda o contrato.

### 5.5 Fotos

- **Envio:** `POST /api/owner/restaurants/{vid}/photos` com JSON
  `{kind: "gallery" | "view", opening_key?: str, content_type, data_base64, alt_text}`.
  JSON com base64 porque o projeto não tem `python-multipart` e as funções da
  Vercel aceitam até 4.5 MB por pedido. **[decisão do Claude]**
- **Validação no servidor:** depois de descodificar, no máximo 800 KB; o tipo
  é verificado pelos primeiros bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`,
  WebP `RIFF....WEBP`), nunca pela extensão nem pelo `content_type` declarado;
  no máximo 10 fotos `gallery` por restaurante e 1 foto `view` por janela.
- **Guardar:** na tabela `venue_photos` (bytes na base de dados). Evita um
  serviço de ficheiros novo; se ficar lento, troca-se por Vercel Blob sem mudar
  a API. **[decisão do Claude]**
- **Servir:** `GET /api/photos/{photo_public_id}` devolve os bytes com o
  `Content-Type` guardado e `Cache-Control: public, max-age=31536000, immutable`
  (o id muda se a foto mudar). Só responde se o restaurante estiver publicado
  ou se quem pede for o dono; senão 404.
- **Limite:** 60 envios por hora por dono (`security.rate_limit`).

**Critérios de aceitação (5)**

- Um dono novo regista-se com código, entra, cria um restaurante, preenche os
  6 passos e publica; o restaurante aparece na pesquisa.
- Publicar falha com a lista de problemas certa quando falta localização,
  horário ou mesas.
- Um ficheiro PDF renomeado para `.jpg` é recusado com 422.
- O dono A recebe 404 em todos os endpoints do restaurante do dono B.
- A conta `staff` da demo só vê restaurantes `is_demo`.

## 6. Editor de sala (o grande foco)

Rota `/owner/:venueId/rooms`. **Editor novo, só para restaurantes**, na pasta
`frontend/src/pages/room-editor/`. Copia as ideias do editor de eventos
(layout imutável, desfazer/refazer com `useHistory`, aviso de alterações por
guardar com `useUnsavedGuard`, painel lateral acessível) e reaproveita módulos
puros (`seatPositions.ts`, `useHistory.ts`, `useUnsavedGuard.ts`) importando-os,
sem os alterar. **O editor de eventos fica exatamente como está.**
**[decisão do Claude]**

### 6.1 Unidades, coordenadas e orientação

- **1 unidade = 1 cm.** A sala de demonstração atual (1000 x 700) passa a ler-se
  como 10 m x 7 m. As salas de eventos não mudam e não mostram metros.
- Coordenadas do ecrã: `x` para a direita, `y` para baixo, origem no canto de
  cima à esquerda de cada sala. Cada sala tem as suas coordenadas.
- Os pontos do contorno são guardados **no sentido dos ponteiros do relógio no
  ecrã**. O servidor normaliza ao guardar: calcula a área com sinal (fórmula
  do laço) e, se o sentido estiver ao contrário, inverte a ordem e troca o
  sinal das curvaturas.
- Comprimentos mostrados em metros com duas casas decimais e vírgula
  ("6,40 m") **[decisão do Claude]**; os campos aceitam vírgula ou ponto.

### 6.2 Disposição do ecrã

**Browser (largura ≥ 1024 px):**

```
┌────────────────────────────────────────────────────────────────────┐
│ ← Back to my restaurants   Casa do Rio · Rooms        [Undo][Redo] │
│ [Main room] [Terrace] [+ Add room]                [Save] • Unsaved │
├──────────┬──────────────────────────────────────────┬──────────────┤
│ Tools    │                                          │ Properties   │
│ ▸ Shape  │              canvas (SVG)                │ (o que está  │
│ ▸ Walls  │   grelha 50 cm, réguas, bússola          │ selecionado) │
│ ▸ North  │                                          │              │
│ ▸ Fixed  │                                          │ ou a lista   │
│ ▸ Zones  │                                          │ de itens da  │
│ ▸ Tables │                                          │ sala         │
│ ▸ Light  │                                          │              │
│ ▸ Preview│                                          │              │
├──────────┴──────────────────────────────────────────┴──────────────┤
│ 70,0 m² · zoom 100% · grid on · 2 warnings (show)                  │
└────────────────────────────────────────────────────────────────────┘
```

**Telemóvel (largura < 1024 px):** canvas em ecrã inteiro; barra de
ferramentas em baixo com ícones e nome (Shape, Walls, North, Fixed, Zones,
Tables, Light, Preview); ao selecionar algo, sobe uma **folha de propriedades**
do fundo (meia altura, puxável para altura inteira); Save, Undo e Redo no topo;
separadores das salas num seletor no topo.

### 6.3 Ferramenta "Shape": contorno da sala

**Começar uma sala nova** (diálogo ao carregar em "+ Add room" ou na primeira
vez):

- Nome da sala (1-60, por defeito "Main room").
- "Indoor" ou "Outdoor (terrace)".
- Forma inicial:
  - **Rectangle:** campos largura e comprimento em metros (por defeito
    10 x 7).
  - **L-shape:** largura total, comprimento total, e o tamanho do canto
    recortado.
  - **Draw it myself:** desenhar à mão (abaixo).

**Desenhar à mão:** tocar/clicar num ponto cria o primeiro canto; cada toque
seguinte cria o canto seguinte, com uma linha elástica até ao cursor e o
comprimento em metros ao lado. Fechar tocando no primeiro canto ou carregando
em "Close shape". Com a grelha ligada, os cantos encaixam de 50 em 50 cm; com
Shift (browser), os lados encaixam a 0°, 45° e 90°.

**Editar o contorno:**

| Gesto | Resultado |
|---|---|
| Arrastar um canto (círculo de 44 px de área tátil) | Move o canto; os dois lados mostram o novo comprimento |
| Tocar no ponto do meio de um lado (losango) | Cria um canto novo nesse sítio |
| Arrastar o ponto do meio na perpendicular | **Curva o lado** (arco). O valor da curvatura aparece em cm ("Bulge 80 cm") |
| Duplo toque no ponto do meio | Volta a pôr o lado reto |
| Selecionar um canto + Delete (ou "Remove corner" na folha) | Apaga o canto (mínimo 3 cantos) |
| Selecionar um lado | Painel: comprimento editável ("6,40 m"), "Straight / Curved", curvatura em cm |

Mudar o comprimento de um lado no painel move o canto final na mesma direção
e mantém o resto. Tudo é desfazível.

**Modelo do contorno** (JSON guardado em `rooms.outline`):

```json
{
  "points": [
    {"x": 0,    "y": 0,   "curve": 0},
    {"x": 1000, "y": 0,   "curve": 0},
    {"x": 1000, "y": 700, "curve": 120},
    {"x": 0,    "y": 700, "curve": 0}
  ]
}
```

- `curve` é a **flecha** do lado que vai deste ponto ao seguinte: a distância
  em cm entre o meio da linha reta e o meio do arco. `0` = reto. Positivo =
  curva para fora da sala; negativo = para dentro. **[decisão do Claude]**
- O arco é o arco de circunferência que passa pelos dois cantos e pelo ponto a
  `curve` cm do meio da corda. Raio `r = (c²/4 + s²) / (2s)` com `c` a corda e
  `s` a flecha.
- Regras (servidor e browser): 3 a 60 pontos; `|curve| ≤ c/2` (no máximo meio
  círculo); o contorno não se cruza a si próprio (para verificar, cada arco é
  aproximado por 16 segmentos); área entre 4 m² e 5000 m².
- Uma função pura partilhada `outlineToPolygon(outline, segmentsPerArc)` (TS)
  e `outline_polygon(outline, segments_per_arc)` (Python) devolve o polígono
  aproximado. É usada para desenhar, para "está dentro?", para a área e para
  a imagem do email.

### 6.4 Ferramenta "Walls": janelas, portas, paredes envidraçadas

- Tocar num lado do contorno abre o menu "Add on this wall": **Window**,
  **Door**, **Glass wall** (ocupa o lado todo).
- Uma abertura desenha-se em cima do lado: janela = traço azul claro duplo,
  porta = arco de abertura, parede envidraçada = traço azul em todo o lado.
- Arrastar a abertura ao longo do lado muda a posição; as pegas das pontas
  mudam a largura (mínimo 40 cm, nunca passa os cantos). Em lados curvos, a
  posição é medida ao longo do arco.
- Painel de uma **janela** (ou parede envidraçada):

| Campo | Regra |
|---|---|
| Width | 40 cm até ao comprimento do lado |
| Window top height | altura da parte de cima da janela ao chão, 100-500 cm, por defeito 220 (serve para o comprimento da mancha de sol, 7.3) |
| Faces | só leitura, calculado: "Faces south-west (225°)", ou "Set north first" |
| View | texto curto, 0-80 ("Tagus river and the bridge") |
| View tags | 0-3 de: `river`, `sea`, `street`, `garden`, `courtyard`, `monument`, `city`, `hills`, `pool`, `square` |
| View at night | texto, 0-80, opcional ("The bridge lit up") |
| View photo | 1 foto opcional tirada desta janela (5.5, `kind="view"`) |
| Sun | **Work it out for me** (por defeito) / **Never gets direct sun** / **Only between** HH:MM e HH:MM |

- Painel de uma **porta**: largura e "Main entrance" (sim/não). A entrada
  principal conta como "perto da entrada" (7.5).
- Validação: aberturas no mesmo lado não se sobrepõem.

### 6.5 Ferramenta "North": orientação

- Uma bússola grande sobre a planta. O dono roda a agulha (arrastar à volta,
  ou campo "North is at ___°", ou botões de 15°) até apontar para o norte real.
- Ajuda: "Stand in the room, open your phone's compass, and turn the needle
  so it matches." No telemóvel, se o browser der orientação do dispositivo
  (`DeviceOrientationEvent` com `webkitCompassHeading` ou `absolute`), aparece
  o botão "Use my phone's compass" (pede autorização no iOS). **[decisão do
  Claude: opcional, só se disponível]**
- Guarda-se em `rooms.north_deg` (0-359, ou `null` = por definir).
  Definição: o ângulo, no sentido dos ponteiros do relógio, entre "para cima no
  ecrã" e o norte real.
- **Rumo** de uma direção do ecrã `(dx, dy)` (com `y` para baixo):
  `angulo_ecra = atan2(dx, -dy)` em graus no sentido dos ponteiros do relógio a
  partir de "para cima"; `rumo = (angulo_ecra - north_deg) mod 360`.
  Exemplo de teste: `north_deg = 0`, direção `(0, -1)` → rumo 0 (norte);
  `north_deg = 90`, direção `(1, 0)` → rumo 0.
- A direção para onde uma janela olha é a **normal para fora** do lado no
  meio da janela (num lado curvo, a normal do arco nesse ponto).

### 6.6 Ferramenta "Fixed": elementos fixos

Paleta: `bar`, `kitchen` (cozinha aberta), `wc`, `column`, `stairs`, `plant`,
`stage` (música ao vivo), `fireplace`, `tv`, `host_stand` (receção),
`awning` (toldo ou guarda-sol, só faz sentido em salas exteriores).
**[decisão do Claude: a lista]**

- Arrastar da paleta para a planta (browser) ou tocar no tipo e depois tocar
  na planta (telemóvel).
- Cada um tem forma (`rect` ou `circle`), tamanho em cm, rotação e um rótulo
  opcional (0-40). Desenho: cinzento neutro com um ícone e o nome.
- Não se reservam e o cliente não os pode escolher.
- Afetam o ambiente: "perto de" (7.5) e o toldo faz sombra (7.4).

### 6.7 Ferramenta "Zones"

Igual ao editor atual (retângulos com nome e tipo `general`, `window`,
`terrace`, `bar`, `quiet`, `vip`, `accessible`), agora dentro de uma sala. As
zonas continuam a alimentar a preferência de zona do optimizador.

### 6.8 Ferramenta "Tables": mesas e cadeiras

- Paleta com 4 tipos, que correspondem às formas que já existem:

| Na interface | `shape` | Tamanho por defeito | Cadeiras por defeito |
|---|---|---|---|
| Round table | `round` | 90 cm de diâmetro | 4 |
| Square table | `rect` com `w = h` | 80 x 80 cm | 4 |
| Long table | `rect` | 160 x 80 cm | 6 |
| Counter | `row` | 300 x 50 cm | 5 (só de um lado) |

- Colocar: arrastar da paleta, ou tocar no tipo e depois na planta.
- Mover: arrastar. Rodar: pega de rotação por cima da mesa (encaixe de 15°;
  Alt no browser desliga o encaixe) ou campo "Rotation".
- Redimensionar: pegas nos cantos ou campos em cm.
- Número de cadeiras: botões − / + (1 a 20). As cadeiras são geradas por
  `seatPositions.ts` e podem depois ser arrastadas uma a uma.
- Painel da mesa: label ("Table 1", numeração automática, editável, única na
  sala), min e max de pessoas (por defeito 1 e o número de cadeiras),
  "Wheelchair accessible", "Room for a high chair", "Can be joined with"
  (grupo para juntar mesas), "Available for booking" (ver abaixo).
- Painel de uma cadeira: label ("1", "2", ...), "Accessible", "Blocked".
- Seleção múltipla: Shift+clique ou retângulo de seleção (browser); toque longo
  ativa o modo de seleção múltipla (telemóvel). Com várias mesas:
  **Align left/centre/right/top/middle/bottom**, **Distribute evenly**,
  **Duplicate**, **Delete**.
- Atalhos (browser): setas movem 1 cm, Shift+setas 10 cm, `R` roda 15°,
  `Ctrl+D` duplica, `Delete` apaga, `Ctrl+Z` / `Ctrl+Y` (e `Ctrl+Shift+Z`)
  desfazem e refazem, `Esc` limpa a seleção.
- **Mesas com reservas:** uma mesa que tem reservas (passadas ou futuras) não
  se pode apagar, porque `table_slots` e `bookings` apontam para ela. O botão
  "Delete" diz "This table has bookings. Make it unavailable instead." e
  oferece o interruptor **Available for booking** (coluna nova
  `tables.is_active`). Uma mesa inativa não aparece ao cliente e não entra no
  optimizador, mas continua no painel do staff para as reservas antigas.
  **[decisão do Claude]**

### 6.9 Validação enquanto se desenha

Calculada no browser a cada mudança (funções puras, testadas) e repetida no
servidor ao guardar e ao publicar.

| Código | Nível | Quando | Mensagem |
|---|---|---|---|
| `outline_invalid` | erro | contorno cruzado, < 3 cantos, curva maior que meio círculo | "The walls cross each other." |
| `table_outside` | erro | o centro ou qualquer canto da mesa está fora do contorno | "Table 4 is outside the walls." |
| `tables_overlap` | erro | duas mesas ativas sobrepõem-se (exceto mesas do mesmo grupo de juntar, que podem tocar-se mas não sobrepor mais de 2 cm) | "Tables 3 and 4 overlap." |
| `tight_passage` | aviso | as áreas "mesa + 45 cm de cadeiras" de duas mesas sobrepõem-se | "Little room to walk between tables 3 and 4." |
| `fixture_overlap` | aviso | uma mesa sobrepõe um elemento fixo | "Table 2 overlaps the bar." |
| `no_north` | erro ao publicar | a sala tem janelas e `north_deg` é `null` | "Set north so we can work out the sun." |
| `window_no_view` | info | janela sem texto de vista | "Add what guests see from this window." |
| `no_tables` | erro ao publicar | nenhuma sala tem mesas ativas | "Add at least one table." |

- **Erros** não impedem guardar (é um rascunho), mas impedem publicar e
  aparecem a vermelho na planta (contorno da mesa a vermelho e ícone ⚠).
- **Avisos** e **info** aparecem na barra de baixo ("2 warnings (show)"), que
  abre a lista; cada item, ao clicar, seleciona e centra o objeto.
- Mesas e cadeiras como polígonos: mesa redonda = círculo; `rect`/`row` =
  retângulo rodado. Sobreposição por separação de eixos (retângulos) e
  distância ao centro (círculos). "Está dentro?" por raio para o polígono do
  contorno (6.3).

### 6.10 Guardar, versões e rascunho local

- **Formato** (`GET` e `PUT /api/owner/restaurants/{vid}/rooms`), tudo de uma
  vez, numa só transação, com a mesma semântica de "upsert por id, insere por
  key, apaga o que falta" de `core/layout.save_layout`:

```json
{
  "base_version": 7,
  "rooms": [
    {
      "id": 12, "key": "r1", "name": "Main room", "is_outdoor": false,
      "north_deg": 200, "outline": {"points": [ ... ]}, "position": 0,
      "openings": [
        {"id": 3, "key": "o1", "side": 0, "offset": 120, "width": 180,
         "kind": "window", "top_height": 220, "is_main_entrance": false,
         "view_text": "Tagus river", "view_tags": ["river"],
         "night_view_text": "", "sun_rule": "auto",
         "sun_from": null, "sun_until": null}
      ],
      "fixtures": [
        {"id": 5, "key": "f1", "kind": "bar", "shape": "rect",
         "x": 50, "y": 500, "w": 300, "h": 80, "rotation": 0, "label": ""}
      ],
      "zones": [ {"id": 1, "key": "z1", "name": "Window", "kind": "window",
                  "x": 0, "y": 0, "w": 1000, "h": 200} ],
      "tables": [
        {"id": 40, "key": "t1", "zone_key": "z1", "label": "Table 1",
         "shape": "round", "x": 100, "y": 60, "w": 90, "h": 90, "rotation": 0,
         "min_party": 1, "max_party": 4, "is_accessible": false,
         "high_chair_ok": true, "combine_group": null, "is_active": true,
         "seats": [ {"id": 200, "key": "s1", "label": "1", "x": 145, "y": 40,
                     "is_accessible": false, "is_blocked": false} ]}
      ]
    }
  ]
}
```

- Resposta do `PUT`: o mesmo formato com ids reais, a nova `version` e
  `problems` (lista da 6.9).
- **Versão:** `venues.layout_version` (inteiro) sobe a cada gravação. Se
  `base_version` for diferente da atual, a resposta é
  `409 {code: "stale_layout"}` e o editor diz "This layout was changed in
  another tab or device. Reload to see the latest version (your changes will
  be kept as a local draft)." **[decisão do Claude]**
- **Mesa com reservas apagada:** 409 com a lista das mesas, como
  `put_layout` já faz.
- **Rascunho local:** a cada mudança (com 2 s de espera) e a cada 30 s, o
  layout é guardado em `localStorage` na chave
  `seatplan.roomDraft.<venueId>`, com a `base_version`. Ao abrir o editor, se
  houver um rascunho mais recente do que a versão do servidor, aparece
  "You have unsaved changes from <data>. Restore them?" (Restore / Discard).
  Leituras e escritas dentro de `try/catch` (modo privado).
- **Limites:** até 5 salas, 200 mesas, 1000 cadeiras, 60 aberturas e 100
  elementos fixos por sala, 50 zonas por sala.
- **Neighbours:** ao guardar, o servidor reconstrói `seat_neighbours` como
  `save_layout` já faz.

### 6.11 Restaurantes que já existem (migração sem reescrever dados)

As tabelas `tables`, `seats` e `zones` ganham `room_id` opcional. Um
restaurante cujas mesas têm `room_id` vazio é apresentado pela API como tendo
**uma sala implícita** "Main room", com contorno retangular
`venue.width x venue.height`, `north_deg = null`, sem aberturas nem elementos
fixos. Na primeira gravação no editor novo, essa sala é criada a sério e as
mesas passam a apontar para ela. Assim a migração não reescreve dados (como
`migrate.py` exige) e a demo continua a funcionar no primeiro arranque.
**[decisão do Claude]**

### 6.12 Acessibilidade do editor

- O canvas fica escondido dos leitores de ecrã, como hoje (`EditorCanvas.tsx`).
- O painel lateral tem uma lista de tudo o que existe na sala ("Walls: 4
  sides", "Windows", "Fixed items", "Tables"), e cada item tem um formulário
  com todos os campos. Tudo o que se faz a arrastar também se faz por
  formulário: criar sala retangular por medidas, adicionar janela a um lado
  por número e posição em cm, adicionar mesa com x/y em cm.
- Foco visível, alvos de 44 px no toque, cores do `design-system.md`, nenhum
  estado só por cor (erros com ícone).

**Critérios de aceitação (6)**

- No telemóvel (Playwright 390 x 844 com toque), um dono cria uma sala
  retangular 10 x 7 m, curva um lado, põe 2 janelas, define o norte, põe um bar
  e 8 mesas, guarda, recarrega a página e vê exatamente o mesmo.
- Desfazer e refazer funcionam em todas as ferramentas.
- Uma mesa fora das paredes aparece a vermelho e impede publicar.
- Dois separadores a gravar o mesmo restaurante: o segundo recebe 409
  `stale_layout` e não perde o trabalho (fica em rascunho local).
- Apagar uma mesa com reservas é recusado e oferece "Available for booking".
- O restaurante de demonstração atual abre no editor novo com uma sala
  implícita e grava sem erros.
- `/editor/:venueId` e `PUT /api/venues/{id}/layout` não mudam (os testes de
  eventos passam).

## 7. Ambiente: o motor de cálculo

### 7.1 Módulo puro

Pacote novo `backend/app/ambience/`, puro (sem base de dados, sem rede),
testado à parte, como o optimizador:

| Ficheiro | Função | Faz |
|---|---|---|
| `solar.py` | `sun_position(lat, lng, when_utc) -> SunPosition(azimuth_deg, altitude_deg)` | Posição do sol (algoritmo da NOAA, abaixo) |
| `solar.py` | `sun_times(lat, lng, day, tz) -> SunTimes(sunrise, sunset, solar_noon)` | Nascer, pôr e meio-dia solar em hora local; `None` se o sol não nasce ou não se põe nesse dia |
| `geometry.py` | `outline_polygon`, `point_in_polygon`, `side_normal`, `bearing`, `rect_corners`, ... | Geometria plana em cm |
| `light.py` | `window_has_sun(window, sun, local_time) -> bool` | Regra da 7.3 |
| `light.py` | `sun_patches(room, sun) -> list[Polygon]` | Manchas de sol no chão (7.3) |
| `table.py` | `table_ambience(room, table, seats, moment, stay) -> TableAmbience` | O resultado por mesa (7.5) |
| `phrases.py` | `phrases(ambience) -> list[str]` | As frases curtas em inglês (7.5) |

As classes de entrada são dataclasses congeladas (`AmbienceRoom`,
`AmbienceOpening`, `AmbienceFixture`, `AmbienceTable`, `AmbienceSeat`) que o
serviço preenche a partir das linhas da base de dados, como
`occupancy.table_specs` faz para o optimizador.

### 7.2 Posição do sol (NOAA)

Implementar as equações da NOAA ("General Solar Position Calculations"), só
com `math`:

1. Ano fracionário: `γ = 2π/365 · (dia_do_ano − 1 + (hora_utc − 12)/24)` (366
   em anos bissextos).
2. Equação do tempo (minutos):
   `eqtime = 229.18 · (0.000075 + 0.001868 cos γ − 0.032077 sin γ − 0.014615 cos 2γ − 0.040849 sin 2γ)`.
3. Declinação (radianos):
   `decl = 0.006918 − 0.399912 cos γ + 0.070257 sin γ − 0.006758 cos 2γ + 0.000907 sin 2γ − 0.002697 cos 3γ + 0.00148 sin 3γ`.
4. Tempo solar verdadeiro (minutos): `tst = hora_utc·60 + eqtime + 4·longitude`.
   Ângulo horário: `ha = tst/4 − 180` (graus).
5. Zénite: `cos φ = sin(lat) sin(decl) + cos(lat) cos(decl) cos(ha)`.
   Altitude = `90 − φ`.
6. Azimute (graus a partir do norte, sentido dos ponteiros do relógio), por
   `atan2` para não ter problemas de quadrante:
   `az = atan2(sin(ha), cos(ha)·sin(lat) − tan(decl)·cos(lat)) + 180`.
7. Nascer e pôr do sol: ângulo horário com zénite 90.833°;
   `nascer_utc_min = 720 − 4·(longitude + ha₀) − eqtime`,
   `pôr_utc_min = 720 − 4·(longitude − ha₀) − eqtime`.

**Testes obrigatórios** (Lisboa, 38.7223 N, −9.1393; tolerância ±3 minutos
nas horas e ±1° nos ângulos; confirmar os valores na NOAA Solar Calculator ao
escrever os testes):

| Caso | Esperado (aproximado) |
|---|---|
| 21 jun 2026, nascer e pôr (hora local, WEST) | ~06:12 e ~21:05 |
| 21 dez 2026, nascer e pôr (hora local, WET) | ~07:51 e ~17:18 |
| 21 jun 2026, meio-dia solar | ~13:38 local, altitude ~74.7°, azimute ~180° |
| 21 dez 2026, meio-dia solar | altitude ~27.9°, azimute ~180° |
| 21 jun 2026, 23:00 local | altitude < 0 |
| Tromsø (69.65 N, 18.96 E), 21 jun | o sol não se põe (`sunset is None`) |

### 7.3 Sol numa janela e mancha de sol

**Uma janela tem sol** num momento `t` se:

1. a regra da janela é `auto`, ou `between` e `t` está entre `sun_from` e
   `sun_until` (hora local); `never` → nunca;
2. a altitude do sol é **maior do que 3°** (abaixo disso, prédios e horizonte
   tapam quase sempre) **[decisão do Claude]**;
3. a diferença entre o azimute do sol e o rumo para onde a janela olha é no
   máximo **80°** **[decisão do Claude]**;
4. a sala tem `north_deg` definido (sem norte, não se afirma sol: anti-objetivo
   "ambiente a mentir").

Com a regra `between`, os pontos 2 e 3 continuam a valer (o dono diz quando
pode haver sol; a física diz se há).

**Mancha de sol no chão** de uma janela com sol:

- Direção dos raios no chão: o vetor horizontal que aponta **para longe do
  sol** (rumo `azimute + 180°`), convertido para o ecrã com `north_deg`.
- Comprimento horizontal da mancha: `d = top_height / tan(altitude)`, limitado
  a 600 cm.
- A mancha é o paralelogramo `A, B, B + d·r, A + d·r`, com `A` e `B` as pontas
  da janela e `r` o vetor dos raios. Em paredes envidraçadas curvas, a janela
  é aproximada pelos 16 segmentos do arco, com uma mancha por segmento.
- A mancha é cortada pelo contorno da sala ao desenhar (`clipPath` no SVG). No
  cálculo de "a mesa tem sol", basta testar pontos dentro do paralelogramo e do
  contorno.

**Salas exteriores** (`is_outdoor`): não usam janelas. Com altitude > 3°, toda
a sala tem sol, exceto debaixo de elementos `awning` (sombra). À noite: "Under
the stars". **[decisão do Claude]**

### 7.4 Luz de uma mesa num momento

A mesa é testada em 5 pontos: o centro e os 4 cantos (círculo: centro e 4
pontos no raio). Pela ordem, a primeira regra que serve:

| Luz (`light`) | Regra |
|---|---|
| `night` | o momento está antes do nascer ou depois do pôr do sol |
| `sun` | 2 ou mais dos 5 pontos estão numa mancha de sol (exterior: fora de todos os toldos) |
| `sunset` | faltam até 45 minutos para o pôr do sol, a mesa está a menos de 3 m de uma janela, e essa janela olha entre 200° e 340° (poente) **[decisão do Claude]** |
| `shade` | sala exterior debaixo de toldo, de dia |
| `daylight` | a menos de 3 m de uma janela ou parede envidraçada, sem sol direto |
| `interior` | nenhuma das anteriores |

### 7.5 Ambiente de uma mesa para uma reserva

`table_ambience` recebe o momento de início e a estadia (início e fim, em
passos de 15 minutos) e devolve:

```json
{
  "light": "sun",
  "sun_minutes": 75,
  "sun_until": "14:30",
  "sun_from": null,
  "sunset_at": "21:05",
  "dark_at": null,
  "view": {"text": "Tagus river", "tags": ["river"], "night_text": "",
           "photo_url": "/api/photos/ab12...", "distance_cm": 140},
  "near": ["bar"],
  "quiet": false,
  "features": ["sun", "view"],
  "phrases": ["Direct sun until 14:30", "View of the Tagus river", "Next to the bar"]
}
```

- `light`: a luz no início da reserva (7.4).
- `sun_minutes`: minutos da estadia com `light = sun`, contados de 15 em 15.
- `sun_until`: se começa com sol e o sol acaba durante a estadia, a hora em que
  acaba; `sun_from`: se começa sem sol e o sol chega durante a estadia.
- `sunset_at`: hora do pôr do sol se calhar durante a estadia (ou até 45 min
  depois do início).
- `dark_at`: igual, quando a reserva começa de dia e acaba de noite.
- `view`: a janela mais próxima a **menos de 2 m** da borda da mesa, se tiver
  texto ou etiquetas de vista; à noite usa `night_text` se existir; senão
  `null`. **[decisão do Claude: 2 m]**
- `near`: elementos fixos `bar`, `kitchen`, `wc`, `stage`, `fireplace`, `tv`,
  `host_stand` e portas de entrada principal a menos de **3 m**, borda a borda.
- `quiet`: verdadeiro se não há nenhum `bar`, `kitchen`, `wc`, `stage`, `tv` nem
  entrada principal a menos de 5 m.
- `features`: o que conta para preferências e filtros (`sun`, `shade`, `view`,
  `quiet`, `away_from_wc`, `sunset`). `sun` se `sun_minutes ≥ 30`; `shade` se
  `sun_minutes = 0` e não é noite; `away_from_wc` se não há `wc` a menos de 5 m.
- `phrases`: 1 a 3 frases, pela ordem luz → vista → perto de:

| Situação | Frase |
|---|---|
| sol toda a estadia | "Direct sun for your whole meal" |
| sol que acaba | "Direct sun until 14:30" |
| sol que chega | "Sun reaches this table at 13:15" |
| pôr do sol | "Sunset at 21:05 from your seat" |
| escurece durante | "It gets dark at 21:05" |
| noite | "Evening: it will be dark outside" |
| luz natural | "Bright, by a window" |
| exterior à noite | "Under the stars" |
| vista | "View of the <view text>" ou, só com etiquetas, "River view" |
| perto de | "Next to the bar", "Near the toilets", "By the fireplace" |
| sossegado | "In a quiet corner" |

**Frase para a cadeira escolhida** (secção 9.4): com o vetor da cadeira para o
centro da mesa e o vetor da cadeira para o meio da janela da vista: ângulo
≤ 60° → "Facing the window"; ≥ 120° → "Back to the window"; senão
"Side-on to the window".

### 7.6 Onde o ambiente aparece na API

- `GET /api/r/{vid}/map` (secção 9.3) inclui `ambience` em cada mesa e, em cada
  sala, `sun_patches` (polígonos em cm) e `sun` (`sunrise`, `sunset`,
  `azimuth`, `altitude`) para o momento pedido.
- `GET /api/r/{vid}/ambience?date=&time=&party=` (novo, leve): só
  `{rooms: [{id, sun_patches, night}], tables: [{id, light, phrases}]}`, para o
  cursor de hora do cliente sem recarregar o mapa todo. Mesmo limite de
  leituras (`READ_LIMIT`).
- `GET /api/owner/restaurants/{vid}/ambience-preview?date=&time=` usa o
  rascunho **guardado** e devolve o mesmo formato, para a ferramenta "Light"
  do editor (6.2). Para pré-visualizar sem gravar, o editor também pode
  calcular no browser: o construtor pode portar `solar.py` para TS se quiser
  pré-visualização instantânea (fica ao critério dele).
- O resultado é calculado a cada pedido (sem cache); é só matemática e uma
  sala tem no máximo 200 mesas.

### 7.7 Ferramenta "Light" do editor (pré-visualização)

- Data (por defeito hoje) e um cursor de hora das 06:00 às 23:45, de 15 em 15
  minutos, com botões "Sunrise", "Lunch 13:00", "Sunset", "Dinner 20:30".
- A planta mostra as manchas de sol em amarelo translúcido com padrão de
  riscas finas (não só cor), escurece a sala com um véu azul-escuro depois do
  pôr do sol e mostra o sol como um ícone na borda da planta, na direção
  certa.
- Ao tocar numa mesa: as frases (7.5) para esse momento.
- Uma frase por baixo: "On 21 June at 13:00 the sun is in the south (180°),
  74° high. Sunset at 21:05."

**Critérios de aceitação (7)**

- Os testes da 7.2 passam.
- Janela virada a sul, 21 de junho às 13:00: tem sol; a mesma janela virada a
  norte: não tem; às 23:00: `night`.
- Janela com regra `never`: nunca tem sol; regra `between 12:00-15:00`: às
  16:00 não tem sol mesmo virada a sul.
- Sala sem norte: nenhuma mesa tem `sun`, e o editor mostra `no_north`.
- Uma mesa a 1 m de uma janela com vista tem `view`; a 4 m não tem.
- Uma reserva das 13:00 às 14:30 numa mesa onde o sol sai às 14:00 dá
  "Direct sun until 14:00" e `sun_minutes = 60`.

## 8. Optimizador e preferências

### 8.1 Preferências que o cliente pode escolher

No passo 1 da reserva, chips opcionais: **Sunny table**, **In the shade**,
**With a view**, **Quiet**, **Away from the toilets**. "Sunny" e "In the
shade" excluem-se. Chaves: `sun`, `shade`, `view`, `quiet`, `away_from_wc`.

### 8.2 Alterações ao optimizador

- `TableSpec` ganha `features: frozenset[str] = frozenset()` (calculado pelo
  serviço para a estadia, a partir de `ambience.features`).
- `PartySpec` ganha `prefs: frozenset[str] = frozenset()`.
- `recommend_table`: a ordenação passa a ser por
  `(balde_de_desperdício, −preferências_cumpridas, desperdício, ...)`, com
  `balde = 0` se o desperdício ≤ 2 lugares, `1` caso contrário. Assim uma
  preferência ganha a uma mesa um pouco maior, mas um casal que quer sol não
  recebe uma mesa de 8. **[decisão do Claude]**
- `_explain` ganha razões: "Sunny, as you asked (sun until 14:30)", "Has a
  view of the river, as you asked", "Quiet corner, as you asked"; e quando não
  dá: "No sunny table is free at 13:00".
- `ScoreBreakdown` ganha `prefs_met` e `prefs_wanted`; `key()` passa a
  `(covers_seated, −wasted_seats, zone_prefs_met, prefs_met)`. A nova
  componente vem **no fim**, por isso nada do que o optimizador já garante
  muda e os testes de propriedades atuais continuam válidos.
- `whatif_walkin` e `assign_exact` passam as preferências mas sem mudar a
  regra.
- As regras duras (tamanho, acessibilidade, cadeira de bebé, escolhas humanas
  nunca mexidas) continuam a mandar.

### 8.3 Onde as preferências viajam

- `GET /api/r/{vid}/map?...&prefs=sun,view`
- `HoldIn` ganha `prefs: list[PrefKey] = []` (no máximo 5), usado quando o
  cliente carrega em "Choose for me".
- `BookingIn` ganha `prefs` (guardadas na reserva, aparecem ao staff).

**Critérios de aceitação (8)**

- Todos os testes atuais de `test_optimiser_restaurant_*.py` passam sem
  alteração.
- Teste novo: com duas mesas livres de 4 lugares, uma com `sun` e outra sem, um
  grupo de 2 que pede `sun` recebe a mesa com sol em primeiro.
- Teste novo: um grupo de 2 que pede `sun`, com uma mesa de 2 sem sol e uma de
  8 com sol, recebe a de 2 primeiro (balde).

## 9. Cliente: descoberta, página do restaurante e reserva

### 9.1 Descoberta (`/`)

**Topo:**

- Título: "Find a table you will love". Subtítulo: "See the room, the light and
  the view before you book."
- Campo de pesquisa "Restaurant or cuisine" (procura no nome e nas cozinhas).
- Botão **Near me** (pede a localização ao browser só quando carregado). Se for
  recusado ou não existir: seletor "Choose a city" com Lisboa, Porto, Braga,
  Coimbra, Aveiro, Faro, Évora, Setúbal, Cascais, Sintra, Leiria, Viseu,
  Funchal, Ponta Delgada, com coordenadas fixas no código. **[decisão do
  Claude]** A última escolha fica em `sessionStorage`.
- Linha opcional "When?": data, hora e pessoas. Se preenchida, os cartões
  mostram as próximas horas livres e o filtro "Available" fica ativo.

**Filtros** (chips; em mobile, numa folha "Filters"): cozinhas (várias),
preço (€ a €€€€, várias), **Sunny tables**, **With a view**, **Wheelchair
accessible**, **Terrace**, e "Available at that time" (só com "When?").

**Resultados:**

- Browser: lista à esquerda (60%), mapa à direita (40%) com um pin por
  restaurante; passar o rato sobre um cartão destaca o pin.
- Telemóvel: lista por defeito, botão flutuante "Map" / "List".
- Cartão: foto de capa (16:9, `loading="lazy"`, texto alternativo), nome,
  cozinhas, preço, distância ("850 m" ou "3.2 km"), ícones das características
  (sol, vista, acessível, esplanada) com texto, e, com "When?", até 3 botões de
  horas livres que levam à página do restaurante com data, hora e pessoas já
  escolhidas.
- Ordenação: distância (com localização), senão nome.
- Paginação: 20 de cada vez, botão "Show more".
- Vazio: "No restaurants match. Try removing a filter." com o botão "Clear
  filters".
- Mapa: OpenStreetMap com Leaflet 1.9.4, sem `react-leaflet` (um componente
  pequeno `LeafletMap.tsx` que cria o mapa num `useEffect`), atribuição
  "© OpenStreetMap contributors" visível. **[decisão do Claude]**

**API:** `GET /api/restaurants`

| Parâmetro | Regra |
|---|---|
| `q` | 0-80; comparação sem acentos e sem maiúsculas no nome e nas cozinhas |
| `lat`, `lng` | opcionais, juntos |
| `cuisine` | repetível, das chaves da 5.3 |
| `price` | repetível, 1-4 |
| `features` | repetível: `sun`, `view`, `accessible`, `terrace` |
| `date`, `time`, `party` | opcionais, juntos |
| `limit` (1-50, por defeito 20), `offset` | paginação |

Resposta: `{items: [{slug, public_id, name, cuisines, price_level, cover_url,
cover_alt, address, lat, lng, distance_m, features, next_times}], total}`.

- Só restaurantes `published`.
- `venues.search_text` (nome + cozinhas, sem acentos, minúsculas) é atualizado
  ao gravar o perfil; a pesquisa faz `LIKE` com parâmetro (nunca SQL montado
  à mão).
- `features` por restaurante calculadas **ao gravar as salas e ao publicar** e
  guardadas em `venues.features` (JSON):
  - `sun`: alguma janela com regra diferente de `never`, a olhar entre 90° e
    270° (de nascente a poente pelo sul), numa sala com norte; ou uma sala
    exterior.
  - `view`: alguma janela com texto ou etiquetas de vista.
  - `accessible`: alguma mesa ativa acessível.
  - `terrace`: alguma sala exterior.
- Distância: fórmula de haversine em Python depois dos outros filtros. Chega
  para algumas centenas de restaurantes. **[decisão do Claude]**
- Disponibilidade (`next_times`, filtro "Available"): usa a função que já
  calcula as horas do dia (`availability.day_summary`) só para os resultados
  da página atual (no máximo 20), e devolve as 3 horas livres mais próximas da
  hora pedida.
- Limite: `READ_LIMIT` por endereço, como os outros endpoints públicos.

### 9.2 Página do restaurante (`/restaurants/:slug`)

**Cabeçalho:**

- Galeria: foto de capa grande e miniaturas; tocar abre uma vista em ecrã
  inteiro com setas e swipe; `Esc` fecha.
- Nome, cozinhas, preço, morada, distância (se houver localização).
- Mapa pequeno com o pin e o botão "Open in Google Maps" (o link do dono, ou um
  link de pesquisa com as coordenadas).
- Telefone (link `tel:`), website, Instagram.
- Horário da semana numa tabela simples ("Tue-Sun: 12:00-15:00, 19:00-23:00;
  closed Monday") e os próximos dias fechados com o motivo.
- Descrição.
- Destaques do ambiente do restaurante: "Sunny tables at lunch", "River
  view", "Terrace" (das `features`).

**API:** `GET /api/restaurants/{slug}` → perfil público + `public_id` +
`rooms_summary` (nomes das salas) + `schedule` + `max_party` + `photos`. 404 se
não existe ou está em rascunho (exceto para o dono, que vê uma faixa "Preview:
this restaurant is not published yet").

**Reservar:** a secção "Book a table" embute o fluxo atual (`BookingPage` /
`useBookingFlow`) com as mudanças da 9.3 e 9.4, usando o `public_id` com a API
`/api/r/{vid}/...` que já existe. Se o URL trouxer `?date=&time=&party=` (vindo
da descoberta), o fluxo começa com isso preenchido (o fluxo atual já aceita
`LinkAnswers` com data e pessoas; acrescenta-se a hora).

### 9.3 Passo "Table" com salas e ambiente

**Resposta de `GET /api/r/{vid}/map`**, compatível com a atual: os campos de
hoje (`width`, `height`, `zones`, `tables`, `seats`, `recommended`,
`slot_status`, ...) **continuam iguais**, e juntam-se:

```json
{
  "rooms": [
    {"id": 12, "name": "Main room", "is_outdoor": false, "north_deg": 200,
     "outline": {"points": [ ... ]}, "width": 1000, "height": 700,
     "openings": [ ... sem campos internos ... ],
     "fixtures": [ ... ],
     "sun": {"sunrise": "06:12", "sunset": "21:05", "azimuth": 180.2, "altitude": 74.1},
     "sun_patches": [[{"x": 100, "y": 0}, {"x": 280, "y": 0}, {"x": 300, "y": 90}, {"x": 120, "y": 90}]],
     "night": false}
  ]
}
```

e em cada mesa `room_id`, `is_active` e `ambience` (7.5). As mesas inativas
não são enviadas ao cliente.

**Interface:**

- Separadores das salas por cima do mapa ("Main room · Terrace"), com o número
  de mesas livres em cada.
- O `SeatMap` ganha camadas novas (componentes novos em `seatmap/`, ligados por
  props opcionais, para os eventos não mudarem): **contorno** (paredes como
  traço grosso, com arcos via `A` do SVG path), **aberturas** (janelas a azul
  claro, portas com arco), **elementos fixos** (cinzento com ícone e nome),
  **manchas de sol** (amarelo translúcido com riscas, cortadas pelo contorno),
  **véu de noite** e um **ícone de vista** junto às janelas com vista.
- Cartão de ambiente: ao focar ou tocar numa mesa, aparece junto ao mapa (em
  mobile, por baixo) com "Table 4 · 2-4 people", as frases do ambiente, a foto
  da vista (se houver) e o botão "Hold this table".
- **Cursor de hora da refeição:** por baixo do mapa, de início a fim da
  estadia, de 15 em 15 minutos ("13:00 → 14:30"). Arrastar chama
  `GET /api/r/{vid}/ambience` (com 250 ms de espera entre pedidos) e atualiza
  manchas, véu e frases, sem mudar a mesa escolhida. Rótulo: "See how the light
  changes during your meal". Reaproveita o padrão de `TimeScrubber.tsx`.
- Legenda (`MapKey.tsx`) ganha: sol (padrão de riscas amarelas), noite, vista,
  e os elementos fixos.
- Recomendação: o cartão "Our suggestion" já existente mostra as razões novas
  (8.2).
- Tudo o que hoje existe neste passo continua: hold de 5 minutos, contagem
  decrescente, conflito 409 com alternativas, atualização ao vivo pelo
  `useLive`, lista de mesas por baixo do mapa (que ganha as frases de
  ambiente).

### 9.4 Escolher a cadeira (opcional)

Depois de o hold ter sucesso, antes de "Your details":

- Título: "Where would you like to sit? (optional)".
- O mapa faz zoom à mesa (já existe `usePanZoom` com "zoom to this seat") e
  mostra as cadeiras da mesa como selecionáveis, cada uma com a frase da
  cadeira ("Seat 2 · Facing the window").
- Tocar numa cadeira marca-a ("You will sit here"); tocar noutra muda; "Skip"
  segue sem cadeira. Cadeiras `is_blocked` não são escolhíveis.
- **Só indicativo:** não há hold nem verificação contra outras reservas; a
  mesa inteira já é do grupo.
- O `seat_id` vai em `BookingIn` (novo campo `seat_id: int | None`). O servidor
  verifica que a cadeira pertence a uma das mesas do hold (senão 422).
- Guardado em `bookings.chosen_seat_id`.

**Onde a cadeira aparece:** ecrã "Done" ("Table 4 · Seat 2, facing the
window"), página de gestão `/b/:token` (com a opção "Change seat", que faz
`PATCH /api/b/{token}` com `seat_id`), email (9.5 e 10), painel do staff
(`SelectionPanel.tsx`: "Guest chose seat 2"; mapa do staff com a cadeira
marcada com o padrão `marked` que o `SeatMap` já tem).

### 9.5 Ecrã "Done"

Igual ao atual (resumo, link de gestão com Copy), mais: nome do restaurante,
mesa e cadeira, as frases do ambiente previsto e um mini-mapa (o mesmo
`SeatMap`, só leitura, com a mesa e a cadeira destacadas).

**Critérios de aceitação (9)**

- Pesquisa por "tagus" (sem acento, minúsculas) encontra "Tagus Terrace".
- Com localização, os resultados vêm ordenados por distância.
- Filtro "Sunny tables" só devolve restaurantes com `features.sun`.
- A partir de um cartão com hora livre, a reserva abre com data, hora e pessoas
  preenchidas.
- O mapa da reserva desenha paredes curvas, janelas, bar e manchas de sol, e o
  cursor de hora muda as manchas.
- O cliente escolhe a cadeira 2, confirma, e vê "Seat 2" no ecrã final, na
  página de gestão, no email e no painel do staff.
- Uma `seat_id` de outra mesa dá 422.
- Duas pessoas a reservar a mesma mesa ao mesmo tempo: só uma consegue (teste
  atual continua a passar).

## 10. Email de confirmação

Muda `restaurant_service/emails.py` (`queue_confirmation`, `queue_change`,
`queue_reminder`) e os modelos em `mail/templates.py`.

- **Assunto:** "Booked: <restaurant>, <Fri 21 Nov> at <20:00>".
- **Corpo HTML**, por esta ordem:
  1. Foto de capa do restaurante (imagem remota com URL absoluto
     `PUBLIC_BASE_URL + /api/photos/<id>`, largura 600, texto alternativo).
     **[decisão do Claude: remota, porque o provider só suporta uma imagem
     inline (`cid:seatmap`)]**
  2. "You're booked at <restaurant>" + data, hora, número de pessoas.
  3. "Table 4 · Seat 2 (facing the window)".
  4. As frases do ambiente para a reserva ("Direct sun until 14:30", "View of
     the Tagus river").
  5. **Mini-mapa** inline (`cid:seatmap`): a sala vista de cima com a mesa
     escolhida destacada e a cadeira marcada.
  6. Morada com link para o mapa, telefone.
  7. Link de gestão e o convite de calendário (`.ics`, já existe).
- **Corpo de texto:** a mesma informação sem imagens.
- **Mini-mapa:** `mail/seat_picture.py` ganha uma versão para restaurantes:
  `PictureRoom` aceita um contorno (polígono já aproximado, 6.3), aberturas
  (janelas como linha azul clara grossa) e elementos fixos (cinzento claro); a
  mesa escolhida em cor de destaque e a cadeira escolhida com um anel. Nenhum
  nome de outras pessoas, e as outras mesas todas iguais (como já acontece nos
  eventos). Com várias salas, desenha só a sala da mesa e o nome da sala por
  cima.
- A imagem viaja como hoje: base64 em `email_outbox.image_png`, limpa pela
  retenção existente.

**Critérios de aceitação (10)**

- Uma reserva confirmada põe na outbox um email com a foto, a mesa, a cadeira,
  as frases do ambiente e o PNG do mini-mapa.
- Com `EMAIL_PROVIDER=console`, o email aparece na consola com todos os
  campos.
- Teste: o PNG tem a sala com o contorno curvo e a cadeira marcada, e não tem
  texto com nomes de clientes.

## 11. Modelo de dados

Nomes finais e tipos ficam ao critério do construtor, desde que respeitem
isto.

**Colunas novas em tabelas existentes** (entram em `NEW_COLUMNS` de
`seed/migrate.py`, com os mesmos valores por defeito que em `models.py`):

| Tabela | Coluna | Tipo / regra |
|---|---|---|
| `venues` | `slug` | VARCHAR(60), único quando não nulo (índice em `NEW_INDEXES`) |
| `venues` | `status` | VARCHAR(12) NOT NULL DEFAULT `'published'` (os restaurantes existentes ficam publicados; os novos nascem com `'draft'` no código) |
| `venues` | `is_demo` | BOOLEAN NOT NULL DEFAULT FALSE (o seed marca os de demonstração) |
| `venues` | `description` | VARCHAR(300) NOT NULL DEFAULT `''` |
| `venues` | `cuisines` | JSON (lista), DEFAULT `'[]'` |
| `venues` | `price_level` | INTEGER |
| `venues` | `address` | VARCHAR(200) NOT NULL DEFAULT `''` |
| `venues` | `lat`, `lng` | FLOAT |
| `venues` | `phone`, `website`, `instagram`, `google_maps_url` | VARCHAR com os limites da 5.3 |
| `venues` | `search_text` | VARCHAR(400) NOT NULL DEFAULT `''` |
| `venues` | `features` | JSON, DEFAULT `'{}'` |
| `venues` | `layout_version` | INTEGER NOT NULL DEFAULT 0 |
| `venues` | `published_at` | data e hora UTC |
| `tables` | `room_id` | INTEGER REFERENCES rooms (id), nulo |
| `tables` | `is_active` | BOOLEAN NOT NULL DEFAULT TRUE |
| `seats`, `zones` | `room_id` | INTEGER REFERENCES rooms (id), nulo |
| `bookings` | `chosen_seat_id` | INTEGER REFERENCES seats (id), nulo |
| `bookings` | `prefs` | JSON (lista), DEFAULT `'[]'` |

**Tabelas novas** (criadas por `db.create_all`):

| Tabela | Colunas |
|---|---|
| `rooms` | `id`, `venue_id` (FK, índice), `name` (60), `is_outdoor`, `north_deg` (nulo), `outline` (JSON), `position` |
| `room_openings` | `id`, `room_id` (FK, índice), `side`, `offset`, `width`, `kind` (`window`, `door`, `glass_wall`), `top_height`, `is_main_entrance`, `view_text` (80), `view_tags` (JSON), `night_view_text` (80), `sun_rule` (`auto`, `never`, `between`), `sun_from`, `sun_until` (TIME, nulos) |
| `room_fixtures` | `id`, `room_id` (FK, índice), `kind`, `shape`, `x`, `y`, `w`, `h`, `rotation`, `label` (40) |
| `venue_photos` | `id`, `public_id` (índice, único), `venue_id` (FK, índice), `kind` (`gallery`, `view`), `opening_id` (FK nulo), `content_type`, `data` (bytes), `width`, `height`, `alt_text` (150), `position`, `is_cover`, `created_at` |

**Migração:** seguir o padrão do último commit: acrescentar a `NEW_COLUMNS` e
`NEW_INDEXES`, guardar o esquema atual (`767fbb6`) como fixture nova em
`backend/tests/fixtures/` e escrever um teste que migra a partir dele em SQLite
(e em Postgres quando `SEATPLAN_TEST_POSTGRES` existe), como
`tests/test_migrate_guest_accounts.py`. Nenhum dado é reescrito (6.11).

**Documentação:** atualizar `docs/data-model.md`, `docs/api.md`,
`docs/openapi.json` (exportado pela app) e acrescentar uma entrada em
`docs/decisions-log.md` por cada desvio a `docs/CONTRACT.md`.

## 12. Restrições transversais

- **Stack:** a mesma (React 18 + TypeScript + Vite; FastAPI + SQLAlchemy;
  SQLite local, Postgres na Vercel). Regras do `docs/CONTRACT.md`: pydantic com
  `extra="forbid"`, SQL só com parâmetros, `PlainText` para todo o texto livre,
  404 igual para "não existe" e "não é teu".
- **Dependências novas:** só `leaflet@1.9.4` (e `@types/leaflet` para
  desenvolvimento). A posição do sol, a geometria e o PNG são feitos à mão,
  como já é costume no projeto. Nada novo em Python.
- **Content-Security-Policy** (`vercel.json`): acrescentar a `img-src`
  `https://tile.openstreetmap.org` (os mosaicos do mapa). Os mosaicos levam
  `referrerPolicy: "strict-origin-when-cross-origin"` na camada do Leaflet,
  porque a política de uso do OpenStreetMap pede um referer e o site usa
  `no-referrer`; assim só vai a origem, nunca o caminho (os links pessoais
  `/e/` e `/b/` nunca aparecem em páginas com mapa). **Verificar no deploy
  real**; se os mosaicos forem recusados, documentar e usar outro servidor de
  mosaicos gratuito. **[decisão do Claude]**
- **Privacidade:** o público nunca vê nomes, emails ou notas de outros clientes
  (o mapa só tem estados); as fotos de restaurantes em rascunho não são
  públicas.
- **Acessibilidade:** objetivo WCAG 2.2 AA como o resto da app; correr
  `npm run contrast` e os testes axe nas páginas novas (descoberta, página do
  restaurante, editor, registo de dono).
- **Desempenho:** a descoberta responde em menos de 500 ms com 100
  restaurantes de teste em local; o mapa da reserva com o ambiente em menos de
  300 ms para 60 mesas.
- **Testes:** todos os atuais passam; cada módulo novo traz os seus (pytest
  para o backend, vitest para funções puras e componentes, Playwright para os
  fluxos). Funções puras de geometria têm testes com casos conhecidos e
  testes de propriedades com `hypothesis` (já é dependência de
  desenvolvimento): por exemplo, um retângulo rodado de 0° a 360° tem sempre a
  mesma área; um ponto no centro de um contorno convexo está sempre dentro.

## 13. Ordem de construção e divisão (10 dias)

**Divisão** (Martim e Sérgio; a ajustar entre os dois) **[decisão do Claude]**:

- **Martim:** editor de sala (6), motor de ambiente (7), optimizador (8), passo
  "Table" com salas e ambiente e escolha de cadeira (9.3, 9.4), mini-mapa do
  email (parte de 10).
- **Sérgio:** contas de dono e isolamento (5.1), "My restaurants", assistente,
  perfil e fotos (5.2-5.5), descoberta (9.1), página do restaurante (9.2),
  modelo de dados e migração (11), resto do email (10).

**Dia 1 (os dois, juntos de manhã):** fechar os contratos antes de trabalhar em
paralelo: modelo de dados (11), formato de `rooms` (6.10), formato do
`ambience` (7.5) e da resposta do mapa (9.3). Escrever isso em
`docs/CONTRACT.md` / `docs/decisions-log.md`. Tarde: Sérgio no modelo de dados
e migração; Martim em `ambience/solar.py` e `geometry.py` com testes.

| Dia | Martim | Sérgio |
|---|---|---|
| 1 | Contratos; `solar.py`, `geometry.py` com testes | Contratos; modelos, migração e teste de migração |
| 2 | Editor: estrutura, salas, ferramenta Shape (contorno reto e curvo) | Registo de dono, isolamento (`load_for_staff`), `/owner` |
| 3 | Editor: Walls (aberturas), North, Fixed | Assistente: Identity, Location (Leaflet), slug |
| 4 | Editor: Tables (cadeiras, seleção múltipla, alinhar), Zones | Fotos (envio, validação, servir, ordenar) |
| 5 | Editor: validação, guardar com versão, rascunho local, telemóvel | Horário no assistente, Review & publish, `features` |
| 6 | `light.py`, `table.py`, `phrases.py`; ferramenta Light no editor | Descoberta: API e página (lista, filtros, mapa, Near me) |
| 7 | Mapa da reserva com salas e camadas novas; cursor de hora | Página do restaurante (galeria, info, horário, embutir reserva) |
| 8 | Preferências no optimizador; escolha de cadeira; staff com cadeira | Email com foto e ambiente; gestão com cadeira |
| 9 | Mini-mapa do email; Playwright do editor e da reserva | Dados de demonstração; Playwright do dono e da descoberta |
| 10 | Correções, docs, testes, deploy, ensaio da demo | Correções, docs, testes, deploy, ensaio da demo |

**Branches e PRs** (regra da equipa): uma branch por tarefa
(`martim/<tarefa>`, `sergio/<tarefa>`), PR para a `main`, o outro revê. Os
ficheiros partilhados (`models.py`, `migrate.py`, `SeatMap.tsx`,
`api/types.ts`) mudam em PRs pequenos e rápidos para evitar conflitos.

**Restaurantes de demonstração:** inventados (nomes, fotos, salas), em sítios
reais de Lisboa para o sol e as distâncias fazerem sentido. Nunca nomes,
marcas ou fotos de restaurantes reais. Fotos: geradas ou de bancos com
licença livre, com a fonte anotada no seed. **[decisão do Claude]** Proposta:

| Nome | Sítio | O que mostra |
|---|---|---|
| Tagus Terrace | Cais do Sodré, junto ao rio | Parede envidraçada a sul, vista para o rio, pôr do sol |
| Pátio das Laranjeiras | Príncipe Real | Esplanada exterior com toldos, sala interior com lareira |
| Miradouro 7 | Graça, piso alto | Janelas a poente com vista da cidade, sala curva |
| Tasca do Bairro | Alfama | Sala pequena e sossegada, sem vista, só luz natural |
| Casa Linho (o atual) | — | A demo de hoje, `is_demo`, com sala implícita |

## 14. Respostas do Martim (2026-11-13)

1. **Mesa ou lugar?** A reserva é da mesa inteira para o grupo; o cliente
   pode indicar a cadeira onde se senta, só para mostrar, e isso aparece no
   email (9.4).
2. **Quem faz?** Martim e Sérgio (restaurantes). Simão e Federico ficam fora
   deste plano.
3. **Foco:** o editor de sala do dono é o mais importante.
4. **Tempo:** 10 dias; fazer tudo, ao detalhe.

## 15. O que fica ao critério do construtor

- Nomes de ficheiros, componentes, tabelas, colunas e endpoints, desde que o
  comportamento descrito se mantenha.
- O desenho exato dos arcos e das manchas de sol no SVG.
- Se a pré-visualização do ambiente no editor é calculada no browser (porta
  de `solar.py` para TS) ou no servidor.
- Cores e ícones, dentro de `docs/design-system.md`.
- Textos de interface, desde que digam o mesmo que os exemplos.

## 16. Riscos conhecidos

| Risco | O que fazemos |
|---|---|
| O editor no telemóvel fica difícil (gestos a competir: arrastar mesa vs. mover a planta) | Um dedo em objeto = mover objeto; um dedo no vazio = mover a planta; dois dedos = zoom. Testar cedo (dia 5) num telemóvel real |
| Mosaicos do OpenStreetMap recusados por causa do referer ou da CSP | Ver 12; testar no deploy no dia 6 |
| Fotos na base de dados ficam pesadas na Vercel/Neon | Limites da 5.5; plano B Vercel Blob sem mudar a API |
| Cálculo do sol errado (fusos, mudança de hora) | Testes da 7.2 com datas de verão e de inverno; usar `zoneinfo` como `clock.py` |
| Conflitos de merge em ficheiros partilhados | Contratos no dia 1; PRs pequenos; quem mexe em `SeatMap.tsx` avisa |
| Partir os eventos | Editor novo separado; `SeatMap` só com props opcionais novas; correr todos os testes em cada PR (o CI já o faz) |
