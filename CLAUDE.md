# REGRAS DE SEGURANÇA E GIT

1. NUNCA adicione (`git add`) ou faça commit de arquivos `.env`, chaves de API, tokens de acesso, senhas ou dados reais de clientes.
2. Todo segredo ou chave deve ser lido via `process.env` e documentado no `.env.example` **sem os valores**. Nunca hardcode um segredo, nem "temporariamente".
3. Antes de qualquer commit, revise os arquivos modificados e confirme que nenhum dado sensível está sendo incluído.
4. Nunca use `git add -f` / `--force` para incluir algo que o `.gitignore` está barrando. Se está ignorado, é intencional.
5. Se um segredo já estiver versionado, **pare e avise** antes de qualquer push. Trate a chave como vazada: ela precisa ser rotacionada.
6. Não faça `git push` sem pedido explícito. Nunca `--force` em branch compartilhada.
7. Segredos de produção vão para as variáveis de ambiente da Stack no Portainer, não para arquivos versionados.

## Dados sensíveis específicos deste projeto

- `api/.env` contém `JWT_SECRET` — quem o obtém forja sessão de qualquer usuário, inclusive administrador.
- O banco SQLite (`api/dev.db` em dev, volume `chamados_db` em produção) guarda hash de senha de todo usuário, as chaves VAPID do Web Push e o conteúdo dos chamados (dados de clientes). Nunca versionar.
- `api/uploads/` (volume `chamados_uploads`) guarda as fotos anexadas aos chamados e os avatares — dado real de cliente. Nunca versionar.

## Relação com o Quality NOC

Este app nasceu da separação do módulo de chamados do Quality NOC e tem repositório próprio
(github.com/Foninhoiuri/Quality-Chamados-app). Os dois são independentes: banco, API, portas e
imagens Docker próprios. Mudanças aqui não devem exigir mudanças no NOC, e vice-versa.

## Versão

A versão do app é derivada do histórico: **cada commit vale 0.1** (`scripts/versao.mjs`), e
o hook `pre-commit` de `.githooks/` grava nos dois `package.json` antes de o commit fechar.
Não edite o campo `version` à mão nem no meio de um commit — quem manda é a contagem.

## Regras de negócio que não se quebram

- Não existe prioridade, prazo/SLA nem atribuição de responsável. Chamado entra na fila; só o
  técnico pega (`/tickets/:id/accept`) ou devolve (`/tickets/:id/release`).
- Chamado não conclui sem `solucao` preenchida no atendimento técnico.
- Horas trabalhadas vêm das idas ao local (`visitas`), contadas pela data da ida.
- **Três fases, três telas**: cada status tem uma `fase` (`aberto` | `andamento` | `concluido`) no
  setting `ticket_statuses`. `aberto` e `concluido` têm UMA coluna cada e não se mexem; colunas novas
  só entram em `andamento`. Config antiga sem `fase` é lida pela posição (ver `comFase`).
- **Categorias de registro** vêm do setting `registro_tipos` (nome + cor). Categoria apagada não apaga
  registro: o que estava nela passa para a primeira da lista.
- Registro tem **título** obrigatório e descrição opcional. Os registros antigos, sem título, usam a
  primeira linha da descrição — não reescreva isso no banco.
- O pino do mapa dos locais vem do **Nominatim (OpenStreetMap)**, chamado pelo servidor. É melhor-
  esforço: sem internet ou sem resultado, o local fica sem pino e o botão “Localizar no mapa” tenta de
  novo. Nunca deixe a falha derrubar o cadastro do local. No formulário, **o pino acompanha o
  endereço**: mudou rua/número/cidade/CEP, ele é recalculado (`POST /geocode`) — pino velho indo
  junto no salvar seria lido pelo servidor como marcado à mão.
- **Ações de fluxo no cartão**: em Abertos é só "pegar". Em andamento, **Finalizar aparece
  sempre** (o serviço pode acabar em qualquer coluna) e, havendo coluna seguinte, vem junto o botão
  de mandar para ela (`proximasEtapas`). Não voltar a pôr seletor de "mover para" — obriga a pessoa
  a escolher entre colunas que ela não conhece. Depois da ação, navegue para a fase nova (`irParaFase`).
- O atendimento técnico é preenchido em **modal por cima** do chamado, com as ações no rodapé fixo.
  O alvo é o celular: botão grande, ao alcance do polegar, conteúdo rolando por baixo.
- **Gestor não mexe em chamado**: ele acompanha. No módulo Chamados tem o mesmo alcance do
  Operador (ver, abrir, comentar, anexar) mais o histórico. Não pega, não move, não atende, não
  conclui, não compartilha e não cancela. Ver `FORA_DO_GESTOR` em `permissions-def.ts`.
- **O ponto é um botão só**, que alterna chegada/saída e salva na hora. Cada ida tem dois
  instantes com data própria (`data`+`inicio`, `fimData`+`fim`) — atendimento que vira a
  noite é comum e somar "hora do mesmo dia" dava 22h de trabalho.
- **A linha do tempo do atendimento (`AtendimentoRegistro`) não se reescreve**: cada texto
  guarda autor e hora. Os campos do Ticket seguem sendo o estado atual; o histórico é como
  se chegou nele. O chamado troca de mão, e sem isso some quem fez o quê.
- **Passar o chamado** (`/tickets/:id/transferir`) mantém horas, itens e textos, põe quem
  saiu como apoio e registra o motivo no histórico. Sem `paraId`, devolve à fila.
- **Compartilhar não divide o atendimento**: quem está junto (`sharedWith`) acompanha e é avisado;
  quem preenche análise, solução e itens continua sendo o responsável que pegou o chamado.
  A exceção é o PONTO: o apoio marca as próprias idas (e só as dele) — ele foi ao local.
- **Tipo de local é opcional e nunca "chuta"**: ao apagar um tipo (`local_tipos`), os locais
  dele ficam sem tipo — nada de mover para a primeira etiqueta, como fazem os registros.
  Um local com a etiqueta errada mente; um local sem etiqueta, não.
- **Cancelado só existe na auditoria**: o chamado some do quadro, do histórico, do dashboard e dos
  relatórios. A linha da auditoria é que guarda título, relato, quem abriu, quem cancelou e o motivo.
- Data de abertura/conclusão só se edita com `ajustar_datas_chamado`. A exceção é o serviço já
  realizado, em que o próprio técnico data o que ele mesmo fez (limite de 90 dias).
