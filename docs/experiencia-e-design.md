# SeatPlan: experiência de utilização, fluidez e design (descrição detalhada)

Estado em 2026-11-14. Descreve como cada parte do que está construído **se sente e se vê**, seguindo os mesmos pontos do inventário de funcionalidades (`inventario-de-funcionalidades.md`). Escrito para o Martim. Tudo o que está aqui existe no código; onde algo é um ponto fraco, está dito na secção 14.

---

## 1. A ideia de design: uma planta impressa, não um software azul e branco

Uma planta de lugares é tradicionalmente um cartão afixado à porta de uma sala. O SeatPlan pega nessa calma em vez do aspeto habitual de software:

- **Fundo "linho"** (um bege quente, `#f4efe6`) e **tinta** escura em vez de branco e preto puros. Os cartões e painéis são um tom mais claro (`#fbf8f2`); o chão do mapa é um tom mais fundo, como papel sob o desenho.
- **Verde-garrafa** (`#1f5a48`) significa **"é teu"**: o teu lugar, os botões principais, as confirmações.
- **Latão** (dourado escuro) significa **"repara"**: a sugestão do sistema, o que está retido, os destaques.
- **Ameixa** marca amigos; **tijolo** marca erros; **ardósia** marca acessibilidade.
- **Um anel de foco cor de ferrugem**, usado para mais nada, para o foco do teclado nunca se confundir com um estado.
- **Tipografia de sistema** (sem descarregar nada, funciona offline): os títulos e os números das mesas em **serifa de livro** (Iowan Old Style, Charter, Georgia), com algarismos antigos que dão ar de programa impresso; o texto em **sans humanista** (Avenir Next, Segoe UI), muito legível em ecrãs pequenos; só os códigos usam monoespaçada.
- **Cantos arredondados generosos** (6 a 18 px, cápsulas nos botões e chips), **sombras muito suaves**, muito espaço em branco. Nada grita.
- **Modo escuro a sério**, não uma inversão: o linho passa a verde-preto profundo, a tinta passa a pergaminho quente, e todas as cores de estado ficam mais claras para manter o contraste (verde-menta, latão claro, rosa-ameixa). Segue a preferência do sistema do utilizador (vê-se na captura do teu Chrome: fundo `#121715`, títulos em creme, chips de contorno). 86 verificações automáticas de contraste garantem que nenhum par de cores fica ilegível em nenhum dos modos.

Um único ficheiro (`tokens.css`) define **todos** os valores brutos (cores, espaços de 4 px a 72 px, tamanhos de letra numa escala de 1,2, raios, sombras, camadas, tempos de animação). Qualquer ecrã só lê essas variáveis, por isso o aspeto é coerente em tudo e muda-se numa linha.

---

## 2. A linguagem visual do mapa (o coração da experiência)

O mapa é o mesmo componente em eventos e restaurantes. As regras:

**Nunca só cor.** Cada estado de um lugar ou mesa tem a sua **própria forma, marca ou padrão**, para se distinguir mesmo em escala de cinzentos ou por quem não distingue cores:

| Estado | Como se desenha |
|---|---|
| Livre | Anel aberto |
| Retido (por alguém) | Preenchimento **às riscas** com contorno tracejado |
| Ocupado | Disco cheio com uma **cruz** |
| Meu | Disco cheio com um **visto** e contorno grosso |
| Amigo | Quadrado arredondado com **pontos** |
| Bloqueado | Disco **riscado em cruz** com uma barra, como "sentido proibido" |
| Acessível | Um **crachá de cadeira de rodas**, combinável com qualquer estado |

A legenda do mapa **desenha-se a partir do mesmo código** que o próprio mapa, por isso nunca podem discordar.

**Movimento com significado.** Só existem três animações de lugar, e cada uma explica uma mudança: o **hold** (um "inspirar" rápido quando um lugar fica retido), a **confirmação** (um pequeno "pop" elástico quando passa a ser teu) e o **conflito** (um abanar de cabeça curto quando o lugar que escolheste foi tomado por outra pessoa). O halo da sugestão "respira" devagar duas vezes para chamar o olhar e depois **fica quieto** (para não distrair nem cansar). A primeira pintura **nunca anima**: o mapa só anima os lugares que mudaram. Quem tem "reduzir movimento" ativado no sistema não vê nada mover-se; a mudança continua visível pelo símbolo e é anunciada por voz.

**Gestos naturais.** Um dedo ou o rato **arrasta**, dois dedos **fazem zoom de pinça**, a roda do rato faz zoom à volta do cursor (a mesma distância de roda duplica ou reduz sempre por igual). Há botões de aproximar, afastar e "ver tudo" (nenhum gesto é obrigatório). Um arrasto de menos de 5 px conta como toque, por isso dedos trémulos escolhem na mesma. Cada lugar tem uma área de toque invisível de cerca de 44 px, sem nunca se sobrepor à do vizinho. A primeira vista **cabe a sala inteira**, mas nunca tão pequena que um alvo fique abaixo de 24 px; num telemóvel, em que a sala é grande de mais, abre **centrada no que importa** (a sugestão ou a tua seleção). Os nomes das mesas nunca ficam menores que 12 px no ecrã, mesmo afastado.

**Teclado.** O mapa inteiro é **uma só paragem de Tab**; as setas saltam para o lugar mais próximo naquela direção, Enter ou Espaço escolhe, `+`, `-` e `0` fazem zoom e ver tudo, Esc sai. **Leitor de ecrã:** uma região invisível anuncia o que muda ("Mesa 4, lugar 2 acabou de ser ocupado"), resume rajadas ("12 lugares mudaram") e **não lê as tuas próprias ações como se fossem de outra pessoa**.

**Desempenho:** 60 imagens por segundo medidas a arrastar e fazer zoom com 400 lugares.

---

## 3. Os pequenos momentos que dão fluidez em todo o lado

- **Carregar:** em vez de um círculo a rodar, aparecem **blocos cinzentos com a forma do conteúdo** ("Skeleton"), com texto escondido para leitores de ecrã. Quando os dados mudam (por exemplo, arrastar a hora), **o conteúdo antigo fica no ecrã** até chegar o novo: não pisca.
- **Vazio:** cada lista vazia diz o que fazer ("No restaurants match. Try removing a filter." com botão **Clear filters**), nunca fica em branco.
- **Erro:** mensagem em palavras e botão **Try again**; o erro é anunciado por voz.
- **Botões ocupados:** ao enviar, o botão mostra um indicador e **ignora cliques repetidos** (nada de duplas submissões), mas **mantém o foco do teclado**.
- **Confirmações:** mensagens curtas ("toasts") que começam sempre por uma palavra ("Done", "Problem"), ficam 6 segundos e podem ser fechadas.
- **Diálogos:** o foco entra, Tab fica preso lá dentro, Esc fecha, e o foco **volta ao botão que abriu**.
- **Saltar para o conteúdo:** todas as páginas começam com um atalho invisível para quem usa teclado.
- **Formulários:** etiqueta sempre visível, dica por baixo, erro com ícone (nunca só vermelho) ligado ao campo para leitores de ecrã.
- **Tudo tem 44 px de alvo mínimo** (botões, caixas, chips), a medida de conforto do dedo.
- **Tempo real sem sobressalto:** quando outra pessoa reserva, o mapa atualiza-se **em silêncio e sem perder o que tens selecionado**.

---

## 4. Descobrir um restaurante (a página inicial)

**Primeira impressão:** um título grande em serifa, "Find a table you will love", e por baixo, em cinzento suave, "See the room, the light and the view before you book." É a promessa do produto em duas linhas.

**Pesquisar:** uma caixa grande, com a etiqueta "Restaurant or cuisine" por cima (sempre visível). Escreve-se e **a lista só atualiza depois de uma pausa de 300 ms**: não pisca a cada tecla. Ao lado, dois botões em cápsula: **Near me** e **When?**.

**Onde estás:** "Near me" só pede a localização quando carregas. Se disseres que não, ou o browser não souber, a **lista de cidades já está ali** (não tens de procurar nada) e aparece uma frase simpática a explicar. Quando usas a localização, uma linha diz "Sorted by distance from where you are" com um botão discreto para deixares de a usar. A cidade escolhida **lembra-se** durante a sessão.

**Filtros como cápsulas** que se ligam e desligam, com o estado dito em palavras para leitores de ecrã ("pressed"). As 8 cozinhas mais comuns estão à vista e **"More cuisines"** abre as outras 16; as escolhidas ficam sempre visíveis. Os preços são €, €€, €€€, €€€€ (e leem-se como "price level 2 of 4"). As características dizem-se em palavras: "Sunny tables", "With a view", "Wheelchair accessible", "Terrace". Cada clique **reduz a lista logo**.

**When?** abre um pequeno painel (data, hora, pessoas) já preenchido com valores razoáveis (hoje, 20:00, 2 pessoas), para não começares do zero.

**Os cartões:** a foto à esquerda (16:9, a carregar só quando aparece no ecrã), o nome em serifa sublinhado, "Mediterranean, Vegetarian · €€ · 1.0 km", e por baixo **etiquetas em cápsula latão-claro** com as características em palavras. Quando perguntaste por uma hora, o cartão acrescenta "Free for 2:" e **até três botões com as horas livres mais próximas**: tocar numa abre a página do restaurante **já a meio da reserva**. Se não houver, diz "No free table near 20:00." em vez de calar.

**O mapa:** no computador, a **lista à esquerda (60 %) e o mapa à direita (40 %)**, que fica fixo enquanto se desliza a lista; os pins são círculos verdes e **passar o rato num cartão torna o pin dourado e maior**; tocar num pin leva ao cartão. No telemóvel, só a lista, com um **botão flutuante "Map / List"** no canto. Sem rede para os mosaicos, uma frase explica e a lista continua completa.

**Cabeçalho:** o logótipo (quatro "lugares" à volta de uma mesa) à esquerda, "For restaurant owners" e "Plan an event" à direita; no telemóvel **recolhem-se atrás de um botão "Menu"**.

---

## 5. A página de um restaurante

**Abre com as fotos:** uma capa grande em cantos arredondados com miniaturas ao lado (uma coluna por baixo no telemóvel). Tocar numa foto abre uma **vista em ecrã inteiro**: setas, **deslizar o dedo para o lado**, contador "Photo 2 of 4" com a descrição, Esc para fechar, e o foco volta à miniatura.

**Depois, a informação em camadas:** o nome grande, "Seafood, Portuguese · €€€", a morada, as etiquetas dos destaques; "About" com a descrição; "Opening hours" numa tabela limpa ("Mon 19:00-23:00 / Tue-Sun 12:00-15:00, 19:00-23:00") com os próximos dias fechados e o motivo; "Find us" com um mapa pequeno, **"Open in Google Maps"** (que diz "opens in a new tab") e os contactos como ligações com alvo de 44 px.

**"Book a table"** está **na mesma página**, por baixo: não se sai do contexto para reservar. Se vieste de uma hora escolhida no cartão, a página **desce sozinha até à reserva** e a reserva já começa pronta.

**Para o dono, em pré-visualização:** uma faixa dourada no topo, "Preview: this restaurant is not published yet. Only you can see this page.", e no lugar da reserva uma frase "Booking opens as soon as you publish". As fotos privadas carregam normalmente.

---

## 6. Reservar, ecrã a ecrã

**Estrutura:** um indicador de **5 passos** ("Date and party · Time · Table · Your details · Done") com o atual a verde cheio, os feitos com visto e os que faltam a contorno. Cada passo é **um ecrã, uma pergunta**, com um título claro em serifa. Pensado primeiro para telemóvel.

**1. Data e pessoas.** Campos grandes, a dica "Including children. For more than 8, please call the restaurant." (o limite vem do restaurante real). Duas caixas "Anything we should know?" (mesa acessível; cadeiras altas) com dica por baixo de cada uma. Em "What would you like your table to be like? (optional)": cinco caixas simples (Sunny table, In the shade, With a view, Quiet corner, Away from the toilets) e uma frase de honestidade: **"Wishes never take a table away from a bigger party."** O botão "See free times" é verde cheio.

**2. Hora.** As horas aparecem **agrupadas por serviço** (Lunch, Dinner) como botões, cada um com o estado **em palavras** ("19:30 Available", "20:00 Limited"). As cheias não são becos sem saída: oferecem a **lista de espera**. As horas já passadas nem aparecem (seria uma falsa promessa).

**3. Mesa** (o passo mais rico):
- Em cima, o **cabeçalho do que escolheste** ("Fri 20 Nov at 19:30, 2 people") e, se houver mais de uma sala, **separadores** ("River hall · 5 free", "Quay terrace · 3 free") para mudar de sala sem perder nada.
- O **mapa** mostra a sala **como ela é**: paredes a traço grosso (retas ou curvas), janelas a azul-claro, portas com o arco, elementos fixos em cinzento com o nome, e **manchas de sol amarelo-translúcido com riscas finas** (riscas para não depender de cor). Depois do pôr do sol, um **véu azul-escuro** escurece a sala. Um pequeno ícone de olho marca janelas com vista.
- **O cursor da luz**: um deslizador por baixo do mapa ("See how the light changes during your meal", 19:00 ········ 20:30). Arrastá-lo **repinta só a luz** (sol e noite) numa fração de segundo; a tua mesa, o hold e as atualizações em direto **não se perdem**. Se não houver sol nesse dia ou o restaurante não tiver localização, o controlo simplesmente não aparece (sem prometer o que não pode).
- **Tocar numa mesa** não reserva: **escolhe-a para ver**. Ao lado (ou por baixo, no telemóvel) aparece o **cartão da mesa**: uma linha em latão com a luz ("AFTER DARK"), o título "Table M1 · 1 to 2 people", as frases ("Evening: it will be dark outside · View of the city lights"), a foto da vista se existir, e o botão **Hold this table**. Um aviso invisível para leitores de ecrã diz "Table M1 selected. Use Hold this table to reserve it." Só ao carregar nesse botão a mesa fica retida, com uma **contagem decrescente visível** dos minutos que faltam.
- A **sugestão do sistema** destaca-se num cartão com um "OUR SUGGESTION" em latão, o título "Table M1", as razões em lista ("Exact fit for 2", "Keeps the table for 4 free for a larger party") e dois botões: **Hold table M1** e **Choose for me**. Para grupos grandes pode propor 2 ou 3 mesas juntas.
- A **legenda** explica todos os símbolos em palavras e com o desenho ("Free: tap to hold it for 5 minutes", "Yours: held for you", "Being chosen: someone else is choosing it", "Direct sun: striped areas, the sun reaches the floor", "View: a window with a view worth looking at").
- **Lista "Tables that suit your party"** por baixo, cada mesa com a lotação, etiquetas ("Suggested", "Accessible", "High chair OK"), as frases e um botão "Hold" com o seu nome (acessível). Uma frase honesta: "1 other tables are too small, too big or missing something you need."
- Se **alguém foi mais rápido**: um aviso quente, "Sorry, that table is gone", sem culpa, com **botões para as mesas ainda livres** que servem ao teu grupo.
- No fim, uma **barra colada ao fundo** ("Change time" e "Continue with table M1" / "Pick a table to continue") para o botão principal estar sempre à mão do polegar.

**4. Cadeira (opcional).** "Where would you like to sit?": um mini-mapa só da tua mesa com as cadeiras desenhadas e uma lista de escolha com frases ("Seat 2 · Facing the window"). Uma frase tranquiliza: **"This only tells the restaurant which chair you would like; it does not change your booking."** Três saídas claras: Back to the map, **Skip**, ou "Continue with seat 2". Se a mesa não tiver cadeiras ou não carregarem, o passo **desaparece sozinho** sem incomodar.

**5. Dados e confirmação.** Nome, email, telefone, notas; a contagem do hold continua visível. Ao confirmar, o ecrã agradece pelo nome ("You are booked, Tess"), mostra os dados e dá **o link de gestão sempre visível, com botão de copiar** e um "Open my booking".

---

## 7. Depois de reservar

**O email** (descrito em detalhe na secção 11). **A página de gestão** tem o mesmo tom: o resumo da reserva, depois blocos separados e claros: mudar a hora, "Your chair" (com "Change seat", um mini-mapa das cadeiras, "Save seat", "Remove my choice" e "Keep as it is"), e por último "Cannot make it?" para cancelar, com **diálogo de confirmação** ("Yes, cancel it" a vermelho-tijolo) para ninguém cancelar sem querer. Cada mudança mostra uma confirmação curta. **Lista de espera:** mostra a posição e uma estimativa em minutos com a explicação do cálculo.

---

## 8. A experiência do dono

**Registo.** Um formulário curto e calmo (nome, email, palavra-passe, a caixa de consentimento), código de 6 dígitos, e aterra em "My restaurants". Num ecrã sem restaurantes: "You have no restaurants yet" com a ação clara.

**A lista "My restaurants".** Cartões com a foto de capa, o estado num distintivo em palavras (**Draft** ou **Published**) e uma linha "o que falta". Cada cartão tem as ações: Edit profile, Edit rooms, Opening hours, Review and publish, Dashboard.

**O assistente.** Um indicador de 6 passos, **cada passo grava ao avançar**, por isso se pode sair e voltar (o restaurante fica em rascunho e o assistente retoma no primeiro passo por fazer). Os erros dizem-se ao lado do campo. Na localização, **um mapa onde se toca para pôr o pin e se arrasta para afinar**, com campos de latitude e longitude como alternativa por teclado e uma frase se o mapa não carregar.

**Fotos.** O dono escolhe, a imagem é redimensionada **no próprio browser** antes de subir (leve e rápida), pode escolher a capa, reordenar, e **escrever uma descrição para cada foto**.

**Horário.** Se não há horário, o ecrã **propõe um modelo** em vez de uma página vazia ("Lunch 12:00-15:00 and Dinner 19:00-23:00, Tuesday to Sunday") e **só o grava quando o dono carrega em "Use this"**. Depois mostra o editor completo.

**Rever e publicar.** Uma lista de verificação, cada linha com um círculo ✓ (feito) ou ✗ (por fazer) **e a palavra "Done" ou "To do"**, a explicação e uma ligação "Fix opening hours". O botão **Publish** está desligado até estar tudo pronto e uma frase explica porquê. Depois de publicar: "Casa X is published." com "View public page" e um botão **Unpublish**, com a nota de que as reservas já feitas ficam.

---

## 9. O editor de salas (a experiência mais exigente)

**No computador:** ferramentas numa coluna à esquerda (Shape, Walls, North, Fixed, Zones, Tables, Light), a **tela ao centro** com grelha e réguas, e **propriedades à direita** do que está selecionado. Em cima: o nome da sala, separadores das salas, **Undo / Redo / Save** e um indicador "Unsaved". **No telemóvel:** a tela ocupa o ecrã, as ferramentas ficam numa **barra em baixo com ícones e nome**, e as propriedades **sobem como uma folha** do fundo.

**Desenhar uma sala é tocar e arrastar:** pôr cantos um a um, fechar a forma, arrastar um canto, **puxar o meio de um lado para o curvar** (um arco exato), tocar duas vezes para o endireitar. Um toque duplo não insere um canto por engano (há uma pausa de 350 ms). A área é mostrada em direto.

**Janelas e portas** arrastam-se ao longo da parede (também nas curvas) e redimensionam-se pelas pontas; cada gesto é **um passo de Undo**, nunca dezenas. Os campos da janela (vista, versão noturna, foto, regra do sol) estão num painel claro.

**Norte:** um **dial** que se roda; a tela mostra o resultado.

**Mesas:** colocam-se arrastando da paleta ou tocando; **seleção múltipla** (no telemóvel com **toque longo**, com uma lista acessível como alternativa), **alinhar**, **duplicar**, mover com as setas; **cadeiras** contadas e arrastáveis em torno da mesa.

**Light:** um cursor de hora e um dia, com atalhos "Sunrise · Lunch 13:00 · Sunset · Dinner 20:30"; a planta mostra **as manchas de sol, o véu da noite e um ícone do sol na borda na direção certa**; tocar numa mesa mostra as suas frases; por baixo uma frase explicativa ("On 21 June at 13:00 the sun is in the south...").

**Avisos enquanto se desenha:** uma lista de problemas ("Table T1 is outside the walls"), **cada um com um botão que leva ao sítio**; avisos amarelos e erros a vermelho-tijolo, sempre com palavra e ícone. Não impedem guardar rascunho.

**Segurança do trabalho:** o "Save" mostra o estado; um **rascunho local** guarda tudo se o separador fechar; se **outro separador guardou primeiro**, o ecrã explica o conflito em vez de apagar o trabalho. Uma mesa com reservas **não se deixa apagar** e diz porquê.

---

## 10. O ambiente: como o sistema "fala" sem mentir

A regra de ouro: **o ambiente nunca mente**. Sem norte definido, sem localização, ou com o sol demasiado baixo, o sistema **não diz nada** em vez de adivinhar. Quando fala, usa **frases curtas, concretas e em inglês simples**: "Direct sun until 14:30", "Sunset at 21:05 from your seat", "View of the river", "Near the bar", "In a quiet corner", "Evening: it will be dark outside". No máximo três por mesa para não sobrecarregar. Para a cadeira, só diz "Facing the window" quando há uma janela a menos de 3 metros. O mesmo texto aparece no cartão da mesa, no email e no editor, por isso o dono vê **exatamente o que o cliente vai ler**.

---

## 11. O email

O email que o cliente recebe é uma **coluna única, estreita (560 px), de leitura fácil no telemóvel**, com cantos arredondados:

1. A **foto de capa** do restaurante, larga.
2. "Hello Tess, You're booked at Tagus Terrace."
3. Um pequeno quadro **Date / Time / People / Your table** ("Table R1 · Seat 1 (facing the window)").
4. As **frases do ambiente** numa lista curta.
5. O **mini-mapa da sala** visto de cima: contorno real, janela a azul-claro, a **tua mesa a amarelo**, a cadeira marcada com um grande ponto num anel e a etiqueta **"YOU"**, o título "MAIN ROOM - TABLE R1 - SEAT 1". Tem texto alternativo completo para quem não vê imagens.
6. A morada (com ligação ao mapa) e o telefone.
7. Um botão azul grande **"Manage my booking"** e, por baixo, a ligação por extenso (caso o botão não funcione).
8. Um convite de calendário anexado.

Há sempre **versão só de texto** com a mesma informação. O rodapé explica porque recebeu o email e como deixar de receber.

---

## 12. A experiência do staff

O ecrã é pensado para **olhar de relance durante o serviço**: em cima os **contadores** ("5 Free · 3 Reserved · 2 Seated · 1 Finishing") e o **deslizador do tempo** com as zonas de serviço marcadas; ao centro o mapa; à direita um painel com a mesa selecionada, as próximas chegadas ("Drag a booking onto a table to move it, or select it and use Move") e o "e se". Cada estado de mesa tem o seu **símbolo próprio**, como no resto da app. **Arrastar uma reserva para outra mesa** é a forma mais rápida de a mudar; para quem não arrasta há o diálogo "Move". Cada ação confirma em voz alta e com uma mensagem curta ("Rui Costa moved to table 3."), e **a mesa onde acabaste de agir não é lida de novo como se fosse de outra pessoa**. A **cadeira que o cliente pediu** aparece marcada na mesa, e a legenda explica ("Chair asked for"). O **painel** mostra números simples e a sugestão de overbooking, sempre explicada em palavras e **nunca aplicada sozinha**.

---

## 13. Eventos (a parte da outra equipa)

O **convidado** abre uma página só com o essencial: o título do evento, o sítio, a sala com os lugares e a lista de passos (responder, dizer quem conhece, escolher). As **recomendações** vêm com razões em palavras. Os **amigos** aparecem a ameixa com pontos. Escolher é igual ao restaurante: tocar, reter 5 minutos, confirmar, com o mesmo abanar de cabeça se alguém foi mais rápido. O **organizador** tem separadores (Guests, Settings…), o mapa com nomes reais, a lista dos que não escolheram, cenários que se comparam antes de aplicar, e um aviso explícito antes de qualquer ação que invalide um link. O **link partilhado** e as **contas de convidado** têm o seu próprio fluxo curto (código por email), e o email do lugar traz **uma imagem da sala com o lugar marcado**.

---

## 14. Mobile e computador

- **Mobile-first na reserva:** um ecrã por pergunta, barra de ação colada ao fundo, botões de 44 px, mapa a centrar no que importa, menus recolhidos, botão flutuante Map/List, filtros atrás de um botão, folha de propriedades no editor, toque longo para seleção múltipla.
- **No computador:** aproveita a largura (lista e mapa lado a lado, painel lateral, atalhos de teclado, hover nos cartões), sem inventar um desenho diferente.
- **Dos dois lados** o mesmo vocabulário visual, as mesmas palavras e os mesmos símbolos.

---

## 15. Acessibilidade como experiência, não como lista

Quem usa só teclado tem **atalho para o conteúdo**, **um único Tab para o mapa inteiro** e setas inteligentes. Quem usa leitor de ecrã **ouve o que muda** sem ser inundado e sem ouvir as suas próprias ações repetidas; todas as fotos têm descrição que **o dono escreve**; cada estado tem palavras; cada erro está ligado ao seu campo. Quem tem sensibilidade a movimento **não vê animação nenhuma**. Quem vê pouco tem **dois modos de cor com contraste verificado** e letra que nunca é menor que 12 px no mapa. Cada página nova foi examinada por uma ferramenta automática (axe) **com conteúdo real no ecrã**.

---

## 16. Onde a experiência ainda é mais fraca (honestidade)

- **As fotos de demonstração são desenhos pequenos** (400×225): ficam macias na capa grande. Com fotografias a sério a página ganha muito.
- **No computador, o bloco de filtros ainda ocupa bastante altura** antes dos resultados (agora com as cozinhas dobradas, mas ainda é um bloco). Uma versão em que os filtros ficam numa barra mais compacta melhoraria o "primeiro olhar".
- **O mapa depende dos mosaicos do OpenStreetMap**: sem rede, avisa e a lista funciona, mas fica menos bonito. Não foi verificado no deploy real.
- **Nunca foi testado com pessoas reais** (só com testes automáticos e com a nossa revisão visual): a lista do que ver com os teus próprios olhos (a página inicial, uma reserva completa, o email, o editor no telemóvel) é o passo que falta para validar tudo isto.
- **Só em inglês** (a interface e os emails). Está de acordo com o plano, mas é uma limitação para um público português.
