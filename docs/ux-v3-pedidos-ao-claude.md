# UX v3 — pedidos à Claude

Sem alterações diretas nos ficheiros partilhados ou atribuídos à outra metade.

| Captura | Ficheiro / dependência | Pedido / limite concreto |
|---|---|---|
| 087 | `frontend/src/pages/Login.tsx` | Quando `next` aponta para `/staff/:venueId`, título “Sign in to open the service floor”; manter o destino interno seguro e os erros no formulário. Ficheiro reservado à Claude. |
| 090 | `frontend/src/pages/restaurant/SelectionPanel.tsx` | Trocar “Guest chose seat …” por “Chair requested: …”. A cadeira de restaurante é um pedido; o painel pertence à metade da reserva. |
| 088 (staff num rascunho) | Metadados do floor | A entrada do dono usa o perfil privado existente e identifica também rascunhos. O floor do staff não inclui nome/timezone; sem perfil público, mantém ID e aviso de relógio do dispositivo. Se for necessário operar rascunhos como staff, fornecer estes metadados no contrato autorizado. Sem mudança de backend neste lote. |
| Histórico — passou no fecho | `frontend/e2e/restaurant.spec.ts:54` / fluxo da reserva | Na segunda bateria do Lote 1, o teste da cadeira não encontrou “Where would you like to sit”. Passou nas execuções posteriores e na fatia final, sem alterações ao fluxo da reserva nesta branch. Mantém-se o registo da tentativa em `%TEMP%/seatplan-ux-lote1b-e2e-final.log`; não é uma falha aberta do fecho. |
| 089–091 | `frontend/src/pages/restaurant/WhatIf.tsx` | O componente partilhado ainda usa “right now” nas respostas, incluindo quando a referência é outro dia/hora. A operação coloca um contexto explícito e fixo no diálogo, mas a copy interna deve passar a “at the selected time” na metade que detém esse ficheiro. |
| Regressão acumulada | `frontend/e2e/restaurant.spec.ts:16` | Bateria de 79 testes num único backend: 78 passaram; a reserva não encontrou “Choose for me” porque o mapa mostrou “Too many attempts. Please wait a moment.”. Não se aumentou nem se contornou o limite da API. Validar isolamento/orçamento de pedidos da bateria integrada. Log: `%TEMP%/seatplan-ux-final-e2e.log`; trace preservado fora do repositório. |
