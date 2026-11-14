# UX v5 — decisões do Codex

Base `c8c75f2`, worktree exclusiva `seatplan-codex-ux5`, branch `codex/ux-v5-discovery-staff`.

- **001/021/031:** são usadas fotos reais da API e as ilustrações do seed quando não há fotografias carregadas. Não se substituem por fotografias do mockup nem se inventam bairros, vistas de rio, preços ou capacidades.
- **024:** o endpoint de descoberta oferece acessibilidade, mas não filtro por cadeiras de criança. O painel explica que o pedido de high chair é feito na reserva, sem um filtro fictício.
- **001/021:** sem data escolhida não se anunciam horários disponíveis. As capturas demonstradas usarão contexto escolhido pela interface e horários reais da API.
- **034:** BookingPage.tsx conserva os imports e o controlador. Só serão alteradas as duas linhas autorizadas de renderização de STEP.party e STEP.time.
