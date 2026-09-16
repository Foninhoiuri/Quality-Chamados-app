# Quality Chamados

Central de chamados da Aexecutiva · Quality Work, separada do Quality NOC. Mesmo padrão
visual do NOC (vermelho + cinza escuro, tema claro/escuro) — só o que o atendimento precisa:

- **Login** com configuração inicial (cria o primeiro administrador), troca de senha obrigatória
  no primeiro acesso, bloqueio de força bruta e sessão de 12 h.
- **Quatro perfis**:
  - **Administrador** — tudo, inclusive perfis, permissões e sistema;
  - **Gestor** — coordena a operação: todos os chamados, relatórios, locais, registros e usuários;
    corrige atendimento e devolve chamado à fila;
  - **Técnico** — pega o chamado da fila, preenche o atendimento e conclui;
  - **Operador** — atendente: abre chamado, relata o que aconteceu, anexa foto, define local e faz registros.

  Matriz de permissões, exceções por usuário e escopo por local.
- **Fila, sem atribuição**: todo chamado entra sem responsável e os técnicos são avisados. O técnico
  **pega** o chamado (que vai para "Em atendimento"); quem pegou — ou admin/gestor — pode **devolver à fila**.
- **Atendimento técnico** dentro do chamado: análise, possível solução, solução (obrigatória para
  concluir), ações tomadas, idas ao local (início/saída ou tempo), itens trocados/comprados e fotos finais.
- **Registros**: linha do tempo de acontecimentos e solicitações que não são chamados (data/hora,
  quem solicitou, o quê, local), com opção de virar chamado.
- **Dashboard**: em aberto, na fila, em atendimento, comigo, concluídos na semana; abertos × concluídos
  (14 dias), quadro por coluna, fila por tempo de espera, últimos registros.
- **Chamados**: quadro kanban com colunas configuráveis, arrastar entre colunas, fotos, comentários,
  histórico, busca e filtros (todos / meus / na fila).
- **Relatório mensal** por local ou geral: quantidade de chamados, **horas trabalhadas** (por técnico
  e por local), itens usados, registros, tempo médio, por dia, por técnico, lista completa — com
  **impressão** e **exportação CSV**.
- **Locais** (clientes / condomínios / filiais), **auditoria** imutável e **notificações** (sino,
  pop-up do navegador e Web Push com o app fechado).
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
  pages/                  # Dashboard, Chamados, Registros, Relatorios, Locais, Usuarios, Auditoria, Configuracoes
  components/             # Layout, AtendimentoTecnico, PhotoInput, Login, Setup, ui.tsx…
  lib/                    # api.ts, store.ts (Zustand), tickets.ts, registros.ts, types.ts
docs/IDEIAS.md            # backlog (reincidência)
```
