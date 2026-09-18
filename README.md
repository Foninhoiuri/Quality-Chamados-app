# Quality Chamados

Central de chamados da Aexecutiva · Quality Work, separada do Quality NOC. Mesmo padrão
visual do NOC (vermelho + cinza escuro, tema claro/escuro) — só o que o atendimento precisa:

- **Login** com configuração inicial (cria o primeiro administrador), troca de senha obrigatória
  no primeiro acesso, bloqueio de força bruta e sessão de 12 h.
- **Quatro perfis**:
  - **Administrador** — tudo, inclusive perfis, permissões e sistema;
  - **Gestor** — **acompanha**: vê todos os chamados e o histórico, abre chamado, comenta e cuida de
    relatórios, locais, registros e usuários. No chamado em si tem o alcance de um Operador — não pega,
    não move, não atende, não conclui e não cancela chamado de ninguém;
  - **Técnico** — pega o chamado da fila, preenche o atendimento, conclui, compartilha com outro
    técnico e lança serviço já realizado;
  - **Operador** — atendente: abre chamado, relata o que aconteceu, anexa foto, define local e faz registros.

  Matriz de permissões, exceções por usuário e escopo por local.
- **Fila, sem atribuição**: todo chamado entra sem responsável e os técnicos são avisados. O técnico
  **pega** o chamado (que vai para "Em atendimento"); quem pegou — ou quem corrige atendimento — pode
  **devolver à fila**. Dá para **compartilhar** o chamado com outros técnicos: eles acompanham e recebem
  os avisos, mas quem preenche o atendimento continua sendo o responsável.
- **Serviço já realizado**: o técnico esteve no local por outro motivo e resolveu algo — registra o que
  fez (até 90 dias atrás) e o chamado nasce concluído, sem passar pela fila.
- **Cancelar**: o chamado sai do quadro e não volta; título, relato, quem abriu, quem cancelou e o motivo
  ficam na **auditoria**. Quem abriu cancela o próprio chamado enquanto ninguém o pegou.
- **Atendimento técnico** dentro do chamado: análise, possível solução, solução (obrigatória para
  concluir), ações tomadas, idas ao local (início/saída ou tempo), itens trocados/comprados e fotos finais.
- **Registros**: linha do tempo de acontecimentos e solicitações que não são chamados — **título**
  (o que se lê na lista), descrição opcional, data/hora, quem solicitou, local e **quem registrou em
  destaque**. As **categorias são configuráveis** (nome e cor). Qualquer registro pode virar chamado.
- **Dashboard**: em aberto, na fila, em atendimento, comigo e concluídos na janela escolhida —
  **7 dias por padrão**, com 15 e 30 a um clique —, abertos × concluídos por dia, um **anel** com o
  total do período dividido por situação (fila, cada coluna de andamento e concluídos), fila por
  tempo de espera e últimos registros.
- **Filtros** de chamado em um painel só (local, técnico, coluna, quem abriu, período com datas
  escolhidas), recolhido por padrão para a tela do celular ficar limpa, com etiquetas do que está
  filtrando.
- **Três telas, uma por fase do chamado** — é também a barra de navegação do celular:
  - **Abertos** (`/abertos`) — a fila. É onde o chamado nasce;
  - **Em andamento** (`/andamento`) — o quadro do que está sendo atendido. **Só aqui existem colunas
    configuráveis** (Aguardando peça, Aguardando cliente…): as outras duas fases são uma coluna cada;
  - cada cartão tem **uma ação só, com o nome do que vai acontecer**: “Pegar chamado”, “Mover para
    <próxima coluna>” ou “Finalizar chamado”. Feita a ação, **a tela vai atrás do chamado** para a
    fase nova;
  - **Concluídos** (`/concluidos`) — recém-concluídos e histórico na **mesma lista**, semana a semana
    (setas) ou tudo de uma vez. Dá para ler o chamado inteiro ali, arquivar e devolver aos concluídos.
    O histórico antigo exige a permissão `ver_arquivados`.
- **Registros exportam sozinhos**, em PDF e CSV — separados do relatório de chamados.
- **Relatório mensal** por local ou geral: quantidade de chamados, **horas trabalhadas** (por técnico
  e por local), itens usados, registros, tempo médio, por dia, por técnico, lista completa — em
  **PDF** (um arquivo para enviar) e **CSV**.
- **Locais**: tela dividida em **lista + mapa**, com um pino por local trazendo o nome e o número de
  chamados. O mapa aparece sempre — sem nenhum pino, ele pede a localização do navegador para abrir
  na região de quem está usando. O cadastro é curto e na ordem certa: **abreviação, nome e CEP**, que
  preenche rua e cidade (ViaCEP); o endereço aceita **sugestões tipo GPS** e o pino pode ser
  posicionado à mão, arrastando o mapa sob um alfinete fixo. A observação fica atrás de um botão.
  Há ainda três contagens por local (ativos, em andamento, total) e **cadastro embutido** em qualquer
  formulário que peça um local.
- **Auditoria** imutável e **notificações** (sino, pop-up do navegador e Web Push com o app fechado),
  com escolha, por usuário, de **sobre o que ser avisado**.
- **Funciona sem sinal**: chegada/saída, atendimento e comentário feitos sem rede ficam
  guardados no aparelho e sobem quando a conexão volta, com aviso do que está pendente.
- **Feito para o celular**: modais em folha de rodapé com a ação principal ao alcance do polegar,
  filtros recolhidos, quadro de Em andamento em abas, matriz de permissões por perfil, relatório em
  acordeão, tabelas viram cartões e o topo das telas guarda o secundário atrás dos três pontinhos.
- Ideias ainda não construídas (ex.: **reincidência**) em [docs/IDEIAS.md](docs/IDEIAS.md).

## Rodar em desenvolvimento

Dois terminais, a partir da raiz do repositório:

```bash
cd api
npm install
cp .env.example .env      # em dev funciona como está
npx prisma db push        # cria o banco SQLite (api/prisma/dev.db)
npm run dev               # API em http://localhost:3002
```

```bash
npm install
npm run dev               # painel em http://localhost:5174
```

Abra <http://localhost:5174>: na primeira vez aparece a tela de **configuração inicial** para
criar o administrador. As portas são diferentes das do NOC (5173/3001), então os dois rodam
lado a lado.

## Testes

```bash
cd api
npm test          # sobe a API contra um SQLite temporário e checa as regras críticas
```

Cobrem o que quebra em silêncio: senha temporária, conclusão sem solução, chamado
concluído fechado para edição, alcance do Gestor, cancelamento saindo dos relatórios e
horas de chamado compartilhado sem duplicação.

## Backup

O serviço `backup` do `docker-compose.yml` copia o banco (`VACUUM INTO`) e as fotos uma vez
por dia para `BACKUP_DIR`, guardando as últimas `BACKUP_MANTER` cópias e avisando por
`BACKUP_WEBHOOK` quando falha. Aponte `BACKUP_DIR` para um disco **fora** deste servidor.
Para rodar na hora: `cd api && npm run backup`.

## Deploy (Portainer)

`docker-compose.yml` com `api` (Fastify + Prisma + SQLite em volume) e `web` (nginx servindo o
build e repassando `/api/` para a API).

1. Uma vez por servidor: `docker network create proxy`
2. **Stacks → Add stack → Repository**, apontando para este repositório (*Compose path* `docker-compose.yml`).
3. Em **Environment variables**, preencha o que está como OBRIGATÓRIO em `.env.example`
   (`JWT_SECRET`, `WEB_ORIGIN`). Nunca em arquivo versionado.
4. No Cloudflare Tunnel, aponte o Public Hostname para `http://IP-DO-HOST:3021`
   (ou a porta definida em `APP_PORT`).

## Estrutura

```
api/                      # backend
  prisma/schema.prisma    # User, Role, Permission, Local, Ticket, TicketComment, Registro, AuditLog, Setting…
  src/server.ts           # rotas: setup, auth, locais, usuários, perfis, chamados, atendimento, registros, dashboard, relatório
  src/permissions-def.ts  # permissões e perfis-semente (aplicados a cada boot)
  src/bootstrap.ts        # cria/atualiza permissões, perfis e configurações
  src/notify.ts           # sino + Web Push
  src/uploads.ts          # fotos em disco (api/uploads)
src/
  pages/                  # Dashboard, Chamados (as três fases), Registros, Relatorios, Locais,
                          # Usuarios, Auditoria, Configuracoes
  components/             # Layout, AtendimentoTecnico, CompartilharChamado, LocalSelect, MapaLocais,
                          # PhotoInput, Login, Setup, ui.tsx, chamados/ListaConcluidos…
  lib/                    # api.ts, store.ts (Zustand), tickets.ts (fases), registros.ts,
                          # relatorioPdf.ts, types.ts
docs/IDEIAS.md            # backlog (reincidência)
```
