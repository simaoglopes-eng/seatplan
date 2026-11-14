# UX v3 — pedidos à Claude

Sem alterações diretas nos ficheiros partilhados ou atribuídos à outra metade.

| Captura | Ficheiro / dependência | Pedido / limite concreto |
|---|---|---|
| 087 | `frontend/src/pages/Login.tsx` | Quando `next` aponta para `/staff/:venueId`, título “Sign in to open the service floor”; manter o destino interno seguro e os erros no formulário. Ficheiro reservado à Claude. |
| 090 | `frontend/src/pages/restaurant/SelectionPanel.tsx` | Trocar “Guest chose seat …” por “Chair requested: …”. A cadeira de restaurante é um pedido; o painel pertence à metade da reserva. |
| 070 | Metadados privados do restaurante | O floor devolve mesas/reservas/serviços, sem nome nem timezone do restaurante. Usa-se a leitura pública existente para nome quando disponível; num rascunho não se deve inventar um nome nem alargar permissões. Um futuro contrato privado deve trazer estes metadados. Sem mudança de backend neste lote. |
| Regressão de reserva | `frontend/e2e/restaurant.spec.ts:54` / fluxo da reserva | Na segunda bateria do Lote 1, o teste “a diner picks a chair and sees it on the confirmation” não encontrou “Where would you like to sit”. Tinha passado na primeira bateria, sem alterações ao fluxo de reserva por esta branch. Não foi corrigido fora do âmbito. Log: `%TEMP%/seatplan-ux-lote1b-e2e-final.log`. |
