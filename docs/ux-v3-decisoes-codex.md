# UX v3 — decisões do Codex

Base: `f2cea55`, branch `codex/ux-v3-discovery-ops`, worktree exclusiva `C:/Users/marti/seatplan-codex-ux`.

- **001, 021:** pesquisa/contexto numa superfície própria, ambiente numa segunda linha; cartões horizontais também no telemóvel para mostrar a primeira ficha sem uma capa ocupar o ecrã. Tokens existentes, sem fontes nem dependências novas.
- **006, 007:** copy de descoberta separada dos rótulos partilhados com a página pública. `FEATURE_LABELS` mantém compatibilidade com o trabalho da Claude; descoberta usa “Has sunny tables” e “Tables with a view”. A disponibilidade de luz da mesa só é confirmada na reserva.
- **001, 021:** o antes é capturado na base branca `f2cea55`; as referências originais ux-v2 são guardadas separadamente. Todas as imagens ficam fora do Git.
- **Verificação:** os testes usam a UI e os links públicos já existentes como fronteira. A instrução de modo autónomo substitui pedidos de confirmação durante o trabalho.
- **009–010:** durante refresh, conservam-se cartões e horas anteriores, mas estas são botões desativados. Os links só reaparecem para a resposta correspondente ao contexto vigente; o servidor continua a validar o slot ao entrar na reserva.
- **014:** guardam-se apenas critérios e posição no sessionStorage da tab; disponibilidade é sempre novamente pedida à API. O regresso restaura até 25 páginas de 20 resultados, limite conservador para não provocar uma sequência ilimitada de pedidos a partir de storage danificado.
- **024–025:** contexto num diálogo próprio; filtros numa gaveta independente. Cabeçalho e rodapé não rolam. A gaveta não anima a entrada para evitar contraste transitório durante leitura/teste e manter foco estável.
- **026, 029–030:** tocar num pin em mobile mantém o mapa aberto e apresenta resumo; desktop desloca/foca a ligação do cartão. A numeração permanece ligada ao ID do restaurante na lista atual.
