# SeatPlan: o que é e tudo o que já tem (inventário de funcionalidades)

Estado em 2026-11-14, na branch `martim/restaurantes-impl` (commit `3acf3b4`). Escrito para o Martim. Cada ponto descreve o que existe e funciona hoje, não o que estava planeado.

---

## 1. O que é o projeto

SeatPlan é uma aplicação web onde as pessoas **escolhem o seu próprio lugar numa planta 2D ao vivo**. Tem duas áreas que partilham o mesmo núcleo:

- **Eventos** (casamentos, conferências): o convidado abre um link pessoal, diz quem conhece e escolhe um lugar. O organizador vê a sala toda, preenche os que não escolheram e volta a planear mexendo no mínimo de pessoas.
- **Restaurantes** (a parte em que a equipa Martim e Sérgio trabalhou): um **tipo "TheFork"**. O dono cria a conta e o restaurante, desenha a sala num editor, e publica. O cliente procura restaurantes, vê a sala **com a luz do sol, a noite e a vista de cada mesa na hora da reserva**, escolhe a mesa e opcionalmente a cadeira, e recebe um email com a foto e um mapa da sala. O staff gere o serviço ao vivo.

Princípios que valem para tudo:

- A **base de dados impede, por construção, reservar duas vezes o mesmo lugar ou mesa** (restrições UNIQUE em lugares, faixas horárias e "holds").
- Um **otimizador** recomenda lugares e mesas e **explica porquê**. As escolhas humanas e as regras duras (acessibilidade, lugares reservados, tamanho das mesas) nunca são quebradas.
- **O que o ecrã não diz por palavras não conta**: nenhum estado, aviso ou botão depende só da cor.

Divisão da equipa (4 pessoas): **Martim e Sérgio** fazem restaurantes; **Simão e Federico** fazem eventos (os eventos nunca podem partir, por isso os caminhos deles estão protegidos por uma verificação automática).

---

## 2. Tecnologia

| Camada | O que usa |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy; **SQLite** em local e **PostgreSQL** (Neon) na Vercel |
| Frontend | React 18, TypeScript, Vite |
| Mapa de localização | Leaflet 1.9.4 com mosaicos OpenStreetMap (a única dependência nova do projeto) |
| Sol, geometria, PNG dos emails | **Feitos à mão**, sem bibliotecas (posição solar NOAA, geometria de contornos curvos, escritor de PNG) |
| Testes | pytest, Vitest, Playwright (com axe-core para acessibilidade), Ruff |
| Entrega | Vercel (deploy da `main`), GitHub Actions (CI) |

Números atuais: **110 operações de API**, **30 tabelas** na base de dados, cerca de **880 testes de backend, 403 de frontend e 71 de navegador**.

---

## 3. Núcleo partilhado (serve eventos e restaurantes)

- **Contas e sessões.** Organizadores, donos e staff entram com email e palavra-passe (scrypt). Os convidados de eventos têm um sistema próprio de contas.
- **Holds (reserva temporária).** Ao escolher um lugar ou mesa, fica **retido 5 minutos** para a pessoa. Há limites: no máximo 3 mesas por data por pessoa, e os holds nunca cobrem mais de metade das mesas.
- **Atualização ao vivo.** Quando alguém ocupa um lugar, o mapa dos outros atualiza em 1 a 2 segundos (versão por cena + stream de eventos).
- **Mapa de lugares (`SeatMap`).** Um componente único desenha tudo: mesas, cadeiras, zonas, salas, paredes, janelas, sol, noite. Funciona com rato, toque e teclado, e cada estado tem **padrão e forma próprios** (livre, retido, ocupado, meu, amigo, bloqueado, acessível).
- **Emails por fila (outbox).** Os emails nunca saem direto das rotas: vão para uma tabela, com chave de idempotência (nunca se envia duas vezes), tentativas com espera crescente e limpeza de dados pessoais ao fim de 30 dias. Um cron envia de 15 em 15 minutos. Só se envia para endereços permitidos (`EMAIL_ALLOWLIST`).
- **Sistema de design.** Cores, tipografia, espaçamentos, botões, campos, diálogos, estados vazios e de erro, **modo claro e escuro**. Contraste verificado automaticamente (86 verificações).
- **Segurança.** Limites de pedidos por endereço em todas as rotas públicas, tokens pessoais guardados só como hash, cabeçalhos CSP, validação estrita (campos desconhecidos são rejeitados), texto livre limpo, 404 igual para "não existe" e "não é teu", endereços IP guardados só como hash.
- **Acessibilidade.** Alvo WCAG 2.2 AA: teclado em todo o lado, anúncios para leitores de ecrã, alvos de toque de 44 px, scans automáticos (axe) nas páginas principais.

---

## 4. Eventos (a parte da outra equipa; funciona e está protegida)

**Convidado (link pessoal `/e/…`)**
- Vê a sala e cada lugar com o seu estado; lugares acessíveis assinalados.
- Responde **sim / não / talvez**; dizer "não" devolve o lugar.
- **Diz quem conhece** (lista privada). Esses lugares aparecem como "amigo" e influenciam as recomendações.
- **Recomendações** com razões ("junto de 2 pessoas que conhece"). Só usam a lista dele: ninguém consegue saber quem o listou.
- Escolhe um lugar (hold de 5 min), confirma, recebe email. Pode **mudar ou devolver** o lugar até ao prazo do organizador.
- **Privacidade:** o organizador escolhe nome completo, primeiro nome com inicial ("Ana S.") ou anónimo; o convidado pode sempre aparecer como "Guest".

**Organizador (`/organiser/…`)**
- Cria o evento (nome, horas, modo de privacidade, prazo de alterações), desenha a planta no editor.
- Adiciona convidados **um a um ou por CSV** (até 1000, tudo ou nada, com erro por linha). Grupos e famílias que querem ficar juntas.
- Vê o mapa com nomes reais, quem ainda não escolheu, e pode **colocar, mexer ou tirar** qualquer pessoa (as regras duras aplicam-se sempre).
- **Preencher automaticamente** quem não escolheu, sem mexer em quem escolheu; resultado determinístico por semente; cada proposta é um **cenário** que se compara e só se aplica depois.
- **Replanear** depois de cancelamentos, penalizando cada pessoa movida; **desfazer e refazer**; **"e se"**; **verificação exata** (resolve um pedaço pequeno perfeitamente e mede a diferença para o otimizador rápido).
- **No dia:** mapa de mesas com cartões de lugar e exportação CSV.
- **Link partilhado** por evento: qualquer pessoa vê o mapa como visitante e, para escolher lugar, cria uma **conta de convidado** validada por código no email. Limite de quantos podem entrar, link renovável.
- **Contas de convidado:** os seus eventos, mudar de lugar, apagar a conta (RGPD); o email do lugar leva **uma imagem da sala** com o lugar marcado.

---

## 5. Restaurantes: o que o cliente (diner) vê

### 5.1 Descobrir (`/`)
- Título "Find a table you will love". Pesquisa por **nome ou cozinha**, ignorando acentos e maiúsculas ("cafe" encontra "Café").
- **Near me** (pede a localização só ao carregar; se recusada, aparece a lista de **14 cidades** portuguesas com coordenadas fixas) e escolha de cidade que fica guardada na sessão.
- **Filtros:** 24 cozinhas (8 à vista, "More cuisines" para o resto; as escolhidas ficam sempre visíveis), preço € a €€€€, e **Sunny tables, With a view, Wheelchair accessible, Terrace** (todas as marcadas têm de existir).
- **When?** (data, hora, pessoas): cada cartão mostra até **3 horas livres** perto da hora pedida; "Available at that time" esconde quem não tem lugar; tocar numa hora abre a página do restaurante **já com data, hora e pessoas**.
- Resultados 20 de cada vez com **Show more**; ordenados por distância (mostrada como "850 m" ou "3.2 km") ou por nome; sem pin vão para o fim.
- **Lista + mapa** (60/40 no computador, passando o rato num cartão destaca o pin; no telemóvel um botão flutuante Map/List).
- Cartão: foto de capa (carregamento preguiçoso, texto alternativo), nome, cozinhas, preço, distância, características **em palavras**.
- Estado vazio ("No restaurants match. Try removing a filter." com botão Clear filters), erro com "Try again".
- **Cabeçalho comum:** "For restaurant owners" e "Plan an event"; no telemóvel ficam num menu. A página antiga com os links de demonstração passou para `/demo`.

### 5.2 A página do restaurante (`/restaurants/:slug`)
- **Galeria:** capa grande + miniaturas; ecrã inteiro com setas, deslizar com o dedo e Esc; cada foto com texto alternativo.
- Nome, cozinhas, preço, morada, distância se houver localização, **destaques** (sol, vista, terraço, acessível).
- Mapa pequeno com o pin e **"Open in Google Maps"** (link do dono ou pesquisa por coordenadas); telefone (`tel:`), website e Instagram (só links http/https).
- **Horário da semana** numa tabela ("Tue-Sun 12:00-15:00, 19:00-23:00; Mon Closed") e **próximos dias fechados com o motivo**; descrição.
- **"Book a table"** embutido na mesma página.
- Rascunho: só o dono o vê, com a faixa **"Preview: this restaurant is not published yet"** (as fotos privadas carregam com a sessão do dono). Qualquer outra pessoa vê "We cannot find this restaurant".
- O link antigo `/r/:id` **reencaminha** para a página nova (mantém data, hora, pessoas).

### 5.3 A reserva, passo a passo
1. **Data e pessoas.** Tamanhos oferecidos até ao máximo que o restaurante consegue mesmo sentar. Opções: mesa acessível, cadeiras altas e **desejos de ambiente** ("sunny table", "in the shade", "with a view", "quiet corner", "away from the toilets"; sol e sombra não se combinam).
2. **Hora.** Horas por serviço com estado em palavras (Available / Limited / Full). Uma hora cheia permite entrar na **lista de espera**. Horas já passadas nem aparecem.
3. **Mesa**, o passo principal:
   - **Separadores das salas** ("Main room · Terrace") com o número de mesas livres em cada.
   - O mapa desenha **paredes (retas e curvas), janelas, portas, elementos fixos, manchas de sol riscadas e véu de noite**, e um ícone de vista junto às janelas com vista.
   - **Cursor da luz:** um controlo desliza ao longo da estadia e repinta a luz **sem perder mesa, hold nem atualizações ao vivo** (com pausa de 250 ms para não sobrecarregar).
   - **Tocar numa mesa escolhe-a** e mostra o **cartão da mesa**: a luz ("Direct sun until 14:30"), a vista (com foto da vista, se existir), o que há perto ("Near the bar"), se é tranquila; **"Hold this table"** reserva. (Os botões da lista e "Choose for me" reservam num só passo.)
   - **Sugestão** com razões ("Exact fit for 2", "Keeps the table for 6 free for a larger party", "Sunny, as you asked") e, para grupos grandes, **2 a 3 mesas juntas**.
   - Legenda do mapa (sempre com padrões, nunca só cor). Contagem decrescente do hold.
   - Se alguém foi mais rápido: mensagem simpática com as mesas e horas alternativas mais próximas.
4. **Cadeira (opcional):** "Where would you like to sit?", cada cadeira com frase ("Facing the window", "Back to the window"); a reserva é da **mesa inteira**, a cadeira só diz onde a pessoa prefere sentar-se. Pode saltar.
5. **Dados** (nome, email, telefone, notas) e **confirmação** com o link de gestão sempre visível e copiável.

### 5.4 Depois de reservar
- **Email de confirmação** (ver secção 9) e **lembrete** 1 dia antes (ou 2 horas, se reservou em cima da hora).
- **Página de gestão (`/b/…`)**: mudar data/hora (mantém a mesa se ainda servir, senão procura a melhor), mudar o número de pessoas, **mudar a cadeira** ("Change seat" / "Pick a seat" / "Remove my choice") e **cancelar** (com confirmação). Cada alteração envia email e atualiza o convite de calendário (ICS).
- **Lista de espera** com a posição na fila e **estimativa de espera** explicada; quando alguém cancela, o primeiro compatível recebe um email para reservar.

---

## 6. Restaurantes: o que o dono faz

### 6.1 Conta e lista
- **Registo** com nome, email, palavra-passe e consentimento; código de 6 dígitos por email (15 minutos, 5 tentativas, uso único). O mesmo registo para contas já existentes responde igual (não revela se o email existe).
- **"My restaurants":** cartões privados com estado (draft / published), foto de capa e **o que falta** configurar. Isolamento total: ninguém vê os restaurantes de outro dono.

### 6.2 Assistente "Add a restaurant" (6 passos que gravam um a um; dá para sair e voltar)
1. **Identity:** nome, descrição (300), 1 a 3 cozinhas, preço, telefone, website, Instagram, link do Google Maps (validados). O **slug** gera-se do nome (sem acentos, `-2`, `-3` se repetido), editável em rascunho e **fixo depois de publicado**.
2. **Location:** morada + mapa (Leaflet) onde se toca para pôr o pin e se arrasta para afinar; "Use my current location" só ao carregar; campos de latitude e longitude como alternativa por teclado.
3. **Photos:** até **10 fotos**, redimensionadas no browser (JPEG/PNG/WebP, ≤ 800 KB), escolher a capa, ordenar, **descrição de cada foto**; uma foto de vista por janela. Validação dos cabeçalhos da imagem no servidor. Privadas enquanto em rascunho.
4. **Hours:** **modelo inicial** ("Lunch 12:00-15:00 and Dinner 19:00-23:00, Tuesday to Sunday") que só grava quando o dono carrega em "Use this"; serviços por dia, minutos entre horas, **limite de convidados por hora de chegada**, tempos de rotação por tamanho, dias fechados com motivo.
5. **Rooms:** o editor (secção 7).
6. **Review & publish:** lista de verificação com "Done / To do" em palavras e ligação para corrigir cada item. **Publicar** só ativa quando tudo obrigatório está feito, e o servidor volta a verificar tudo. **Unpublish** esconde da pesquisa e fecha reservas novas; **as reservas existentes e os seus links de gestão continuam a funcionar**.

---

## 7. O editor de salas (o grande foco do projeto)

Funciona no **computador** (ferramentas à esquerda, propriedades à direita) e no **telemóvel** (barra de ferramentas em baixo, folha de propriedades a subir). Tem **Undo/Redo**, grelha, zoom e teclado.

| Ferramenta | O que faz |
|---|---|
| **Shape** | Desenha o contorno da sala: lados retos, **curvos** (arcos exatos), em L; arrastar cantos, dobrar um lado, inserir/remover cantos; área entre 4 e 5000 m²; dimensões em unidades reais. |
| **Walls** | **Janelas, portas e paredes envidraçadas** ao longo de um lado (também em lados curvos); entrada principal; **vista** da janela (texto, etiquetas, versão noturna, foto); regra do sol (automático, nunca, ou entre horas). Mover e redimensionar por gesto. |
| **North** | Um dial para indicar para onde aponta o norte. Sem norte o sistema **recusa afirmar sol** (e o editor avisa). |
| **Fixed** | Elementos fixos: bar, cozinha, WC, palco, lareira, toldo, balcão de receção… com nome. |
| **Zones** | Zonas nomeadas (zona da janela, esplanada, canto tranquilo). |
| **Tables** | Mesas redondas e retangulares, lotação mínima/máxima, **acessível**, **cadeira alta**, grupo de junção, **cadeiras** (contar, mover, bloquear), **seleção múltipla, alinhar, duplicar**, atalhos de teclado. |
| **Light** | Escolhe uma data e uma hora (06:00 a 23:45) com atalhos "Sunrise / Lunch 13:00 / Sunset / Dinner 20:30": vê as **manchas de sol, o escurecer**, a direção do sol e as frases de cada mesa. |

Qualidades do editor:
- **Várias salas** (separadores), salas exteriores, restaurantes antigos tratados como uma "Main room" implícita.
- **Validação enquanto se desenha** (a mesma regra no browser e no servidor): mesa fora das paredes, mesas sobrepostas, janela sem parede, janelas sem norte, entre outras. Avisos não impedem guardar rascunho; erros impedem publicar.
- **Guardar com versão:** o PUT é tudo-ou-nada; se outro separador guardou antes, dá conflito (`stale_layout`) **sem perder o trabalho**.
- **Recuperação:** o rascunho local volta se o separador fechar.
- **Mesas com reservas não se apagam** (desativam-se).
- **Teclado e telemóvel:** toque longo para seleção múltipla, escolhas acessíveis em lista.

---

## 8. O motor de ambiente (sol, noite e vista)

Código puro, sem base de dados, testado com casos conhecidos e propriedades:
- **Posição do sol (NOAA):** nascer e pôr do sol, azimute, altura.
- **Luz em cada mesa:** `night`, `sun`, `sunset`, `shade`, `daylight`, `interior`, com regras honestas: sem norte não há sol, sol baixo (≤ 3°) não conta, portas nunca deixam entrar sol, "nunca" e "só entre horas" do dono mandam.
- **Manchas de sol** no chão (paralelogramos por janela, por pedaço em lados curvos), toldos tratados em salas exteriores.
- **Por mesa e por estadia:** minutos de sol, "sol até às 14:30", "sol a partir de…", pôr do sol visto da mesa, hora a que escurece, vista (a menos de 3 m), o que há perto (bar, cozinha, WC, palco, lareira, entrada), tranquilidade.
- **Frases** (máximo 3 por mesa, sempre verdadeiras): "Direct sun until 14:30", "Sunset at 21:05 from your seat", "View of the Tagus river", "Near the bar", "In a quiet corner". Para a cadeira: "Facing / Back to / Side-on to the window".
- **Características dos cartões** (sol, vista, acessível, esplanada) calculadas ao guardar salas e ao publicar.

---

## 9. Emails de restaurante

Confirmação, alteração e lembrete têm todos o mesmo desenho:
1. **Foto de capa** do restaurante.
2. "You're booked at …" com data, hora e pessoas.
3. **"Table 4 · Seat 2 (facing the window)"**.
4. **Frases do ambiente** da reserva.
5. **Mini-mapa da sala** (PNG feito à mão, inline): contorno real (curvo ou em L), janelas a azul, portas, elementos fixos com nome, **a mesa reservada realçada** (todas, se forem mesas juntas) e **a cadeira marcada**. Nunca mostra nomes de outras pessoas.
6. Morada com link para o mapa, telefone.
7. Link de gestão e **convite de calendário (.ics)**.

Também em texto simples. Subject: "Booked: Restaurante, Fri 21 Nov at 20:00". Texto do restaurante é escapado; só links http/https. A fila é idempotente.

---

## 10. Otimizador do restaurante

- **Regras duras (nunca quebradas):** capacidade da mesa, acessibilidade, cadeiras altas, mesas só juntas se partilharem grupo (no máximo 3), sem sobreposição, mesas livres durante toda a estadia, limite de chegadas por hora.
- **Recomendação de mesa** com razões legíveis; desperdício mínimo, zona, menos mesas; mantém a mesa de 6 livre para um grupo grande.
- **Desejos de ambiente** só desempatam e **nunca tiram uma mesa a um grupo maior**; razões "Sunny, as you asked" / "No sunny table is free at 13:00".
- **Verificação exata** em pequena escala para medir a diferença para o ótimo.
- **Re-planear um serviço** (pré-visualizar e aplicar com `plan_id`), **e se** para clientes sem reserva (walk-ins).
- **Reservas escolhidas pelo cliente, com desejos ou já sentadas nunca são movidas.**

---

## 11. Staff (o painel do restaurante em serviço)

- **Piso ao vivo** para uma data e hora (deslizador no tempo): cada mesa Livre / Reservada / Sentada / A terminar, com contadores. Atualiza-se ao vivo.
- **A cadeira pedida pelo cliente** aparece marcada no mapa, para pôr o lugar certo (sem nomes nas cadeiras).
- **Mudar o estado** de uma reserva (sentada, a terminar, concluída, não compareceu, cancelada); concluir/cancelar liberta a mesa; cancelar envia email e oferece a mesa à lista de espera.
- **Walk-ins:** sentar a melhor mesa para a estadia toda, ou escolher à mão; "e se" quando não há mesa.
- **Mover reservas** (arrastar e largar, ou diálogo "Move") e **juntar mesas** para grupos grandes, com as mesmas regras dos clientes.
- **Painel (dashboard):** pessoas esperadas e realmente sentadas, **utilização por serviço**, **taxa de não comparência** (90 dias) e uma **sugestão de overbooking** (só sugestão; o sistema nunca faz overbooking sozinho).
- **Horário:** serviços, tempos de rotação, dias fechados; mudar não move reservas existentes.

---

## 12. Dados de demonstração (tudo inventado)

- **Casa Lumen** (o antigo): 18 mesas em 4 zonas, reservas de hoje e dos próximos 3 dias, duas semanas de histórico (com algumas faltas) para o painel ter dados. Agora com perfil público.
- **Tagus Terrace** (Cais do Sodré): parede de vidro a sul, vista do rio, pôr do sol e uma esplanada.
- **Pátio das Laranjeiras** (Príncipe Real): pátio exterior com toldos e uma sala com lareira.
- **Miradouro 7** (Graça): sala curva com janelas a poente sobre a cidade.
- **Tasca do Bairro** (Alfama): sala pequena e sossegada, sem vista.
- As fotos são **desenhos gerados por código** (`seed/demo_photos.py`, que é a fonte registada); nenhuma imagem de terceiros. Os restaurantes ficam em sítios reais de Lisboa para o sol e as distâncias fazerem sentido.
- Contas de demonstração: organizador, staff, e links prontos para cada área.

---

## 13. Qualidade e verificação

- **Backend:** ~880 testes (regras, segurança, privacidade, optimizadores, emails, ambiente, descoberta, migração), todos com a sua base de dados isolada. **Corrido também em PostgreSQL 16:** só falharam 2 testes de tempo por a máquina estar ocupada.
- **Frontend:** 403 testes (componentes, funções puras, ecrãs com a API simulada).
- **Navegador (Playwright):** 71 testes em computador e telemóvel, incluindo o editor, a reserva com ambiente, descoberta, dono (criar, publicar, encontrar) e **scans de acessibilidade com cartões reais**.
- **Desempenho medido:** mapa com ambiente para 60 mesas e 120 cadeiras abaixo de 300 ms; descoberta com 100 restaurantes abaixo de 500 ms (os testes ajustam o limite à velocidade da máquina na altura).
- **CI** (GitHub Actions): lint, testes, build, auditoria de dependências e deteção de segredos em cada PR.
- **Guardas automáticas:** os caminhos dos eventos não podem ser alterados; ninguém faz push sem ordem.
- **Documentação:** guias de utilizador (convidado, organizador, dono, cliente, staff), contrato da API, OpenAPI exportado da aplicação, modelo de dados, registo de decisões, registo de riscos, relatório de testes, notas de segurança.

---

## 14. O que ainda NÃO está feito ou tem limites

- **Fotos de demonstração:** são desenhos pequenos (400×225); para mostrar a restaurantes a sério convém fotografias com licença livre.
- **Ensaio num telemóvel físico** (bússola, gestos) e **verificar os mosaicos do mapa com os cabeçalhos de segurança no deploy real** (não houve deploy, nunca foi autorizado).
- **Planeador do staff** não pesa os desejos por cliente: limita-se a **não mexer** em reservas com desejos (seguro, mas menos otimizado).
- **Ponto de recuperação do editor a cada 30 s** (o rascunho local existe, mas com outra regra).
- **Código no GitHub:** o trabalho está só local; nada foi enviado nem foi aberto PR. O repositório do Simão é **público**.
- Em **PostgreSQL** os testes de tempo dependem do estado da máquina (não dos dados: o mapa só faz 29 consultas).

---

## 15. Os números do trabalho

- **59 commits** na `martim/restaurantes-impl` à frente da `main`; **281 ficheiros**, cerca de **31 mil linhas** acrescentadas.
- **Plano de 40 tarefas (0 a 39): todas feitas e verificadas**, mais melhorias de experiência (escolher a mesa antes de a reservar, cozinhas dobradas, cadeira marcada no mapa do staff, planeador a respeitar desejos) e correções de revisão (fotos de rascunho na pré-visualização, cadeira no mapa do email com mesas juntas).
