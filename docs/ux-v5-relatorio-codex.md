# UX v5 — relatório do Codex

Branch: `codex/ux-v5-discovery-staff`, base `c8c75f2`. Só a worktree `seatplan-codex-ux5` foi alterada. Sem push, PR ou merge.

## Checkpoint: descoberta 001, 004, 021, 024, 026

Capturas em `C:\Users\marti\seatplan-screenshots-codex-v5\<ID>.png`. Comparação individual com as referências: barra de contexto, resultados compactos e mapa lado a lado; painel móvel com Apply fixo; cartão e pin numerados correspondentes. Fotos/ilustrações e disponibilidade são dados reais da API.

Percursos: cancelar filtros restaura o contexto e o foco; Apply confirma os rascunhos; limpar termo mantém data/hora/grupo/cidade/acessibilidade; nome/foto abrem a página pública e cada horário leva date/time/party exatos; retorno recupera contexto e vista; fallback de mapa conserva horários e teclado.

Verificação deste lote: typecheck passou; 489 Vitest passaram; build passou; contrast 172/172; 12 Playwright de descoberta passaram (inclui axe, 320 px e fallback de mapa). Ruff passou e 215 ficheiros conformes. A primeira execução pytest encontrou WinError 5 na pasta temporária partilhada; repetição completa com --basetemp exclusivo passou. A execução Playwright completa encontrou seletores antigos do diálogo na jornada móvel: atualizados para Filters/Apply; haverá nova bateria completa no fecho dos lotes.

Em curso: 031, 034, 054; depois 088, 090, 091 e regressão de Eventos. A tabela final e diferenças por captura serão preenchidas no fecho.

## Checkpoint: 031, 034, 054

Página pública com galeria e formulário lado a lado, CTA junto ao nome no telemóvel; When reúne data/grupo/requisitos/horários, distingue seleção de avanço e bloqueia respostas antigas após mudar o contexto. Recuperação com hora original, alternativas concretas e início real do serviço. Galeria privada do preview preservada. Só uma das duas linhas autorizadas de BookingPage.tsx foi alterada.

Capturas 031/034/054 e 054-narrow.png na pasta externa; comparação com as referências realizada. Diferenças justificadas nas decisões: ilustrações do seed, mais horários reais e resumo sem duplicar estado. Vitest: 491 passaram antes de iniciar staff. Playwright: 29 passaram; três falhas revelaram um seletor de título antigo, endereço agora repetido no resumo e galeria escondida no preview. Corrigidos os três; a execução seguinte passou 11/12, restando o seletor ambíguo de endereço, agora delimitado por exact:true. A bateria final volta a verificar tudo.
