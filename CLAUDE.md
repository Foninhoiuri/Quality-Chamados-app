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

## Regras de negócio que não se quebram

- Não existe prioridade, prazo/SLA nem atribuição de responsável. Chamado entra na fila; só o
  técnico pega (`/tickets/:id/accept`) ou devolve (`/tickets/:id/release`).
- Chamado não conclui sem `solucao` preenchida no atendimento técnico.
- Horas trabalhadas vêm das idas ao local (`visitas`), contadas pela data da ida.
