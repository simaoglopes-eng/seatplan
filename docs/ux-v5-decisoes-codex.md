# UX v5 — decisões do Codex

Base `c8c75f2`, worktree exclusiva `seatplan-codex-ux5`, branch `codex/ux-v5-discovery-staff`.

- **001/021/031:** são usadas fotos reais da API e as ilustrações do seed quando não há fotografias carregadas. Não se substituem por fotografias do mockup nem se inventam bairros, vistas de rio, preços ou capacidades.
- **024:** o endpoint de descoberta oferece acessibilidade, mas não filtro por cadeiras de criança. O painel explica que o pedido de high chair é feito na reserva, sem um filtro fictício.
- **001/021:** sem data escolhida não se anunciam horários disponíveis. As capturas demonstradas usarão contexto escolhido pela interface e horários reais da API.
- **034:** BookingPage.tsx conserva os imports e o controlador. Só serão alteradas as duas linhas autorizadas de renderização de STEP.party e STEP.time.
- **031/034:** a reserva começa com um formulário compacto ao lado da galeria; ao ver horários, data e grupo continuam editáveis dentro de When. A transição interna não acrescenta uma etapa ao indicador. A escolha de horário só avança por uma ação explícita com a hora exata.
- **034:** os serviços são expansíveis e os horários reais não são cortados para imitar a quantidade do mockup. No seed o jantar tem 16 horários, pelo que o cartão é mais alto. O resumo lateral usa nome e endereço reais; a data/grupo atuais estão nos controlos editáveis, evitando um resumo duplicado desatualizado.
- **054:** a captura real demonstra 18:00 fora do serviço, jantar às 19:00 e alternativas reais. O caso das 20:00 perdidas com 19:45/20:15 é testado com a resposta da API simulada em Vitest. Nenhuma disponibilidade é inventada na captura.
- **088/090:** a API da planta de staff entrega zonas e mesas, sem a mesma estrutura de salas do mapa do cliente. Mantém-se a geometria real e a lista equivalente, sem criar nomes fictícios de salas nem tabs inoperantes.
- **024:** Cuisine/Price ficam completamente visíveis antes do rodapé no ecrã de 390×844; Availability continua no corpo com scroll. Apply e Clear filters nunca fazem scroll com os grupos. O texto sobre high chairs explica a limitação real da pesquisa.
- **090/091:** estados não fornecidos como Due soon não são inventados. O cartão usa Confirmed e a hora real da reserva; mudanças de estado são explicitamente imediatas, enquanto o walk-in usa a data/hora consultadas, mostradas no diálogo. Os quatro destinos de staff existentes foram preservados, sem links fictícios para Account ou salas inexistentes.
