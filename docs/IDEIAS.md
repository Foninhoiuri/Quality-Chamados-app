# Ideias futuras — Quality Chamados

Backlog do que **não** foi construído ainda. Cada ideia traz o problema, a proposta e o
que precisa mudar para sair do papel.

---

## Pedidos da operação — fila de trabalho (25/09/2026)

Pedidos diretos de quem usa o app, separados por bloco. **Quando um item ficar pronto, apague
a linha**; quando um bloco esvaziar, apague o bloco.

### A. Chamados — telas e cartão

- [ ] Botão "Abrir chamado" nas três telas: Abertos, Em andamento e Concluídos.
- [ ] Cartão do chamado mostra o usuário com avatar em pílula (foto + nome), igual aos Registros.
- [ ] Concluídos mostram as fotos do chamado, igual às telas de Abertos e Em andamento.
- [ ] Adicionar mais fotos ao chamado em qualquer etapa (aberto, andamento, concluído).
- [ ] **Remover troca de item / compra** do atendimento e tudo ligado a isso (tela, API,
      relatório). A função não vai mais ser usada. Atenção: os itens já gravados em chamados
      antigos não se apagam do banco — só deixam de aparecer/ser pedidos.

### B. Chamados — serviço já realizado

- [ ] O serviço já realizado usa o mesmo menu de ida e volta (ponto) do atendimento normal.
- [ ] Duração informada em relógio (`2:50`), não em decimal (`2.5`) — o seletor de relógio
      grava em horas por baixo.

### C. Locais

- [ ] Ao criar/editar local no menu de Locais, mostrar o mapa na tela ao lado do formulário
      (só desktop; no celular não precisa).

### E. Relatórios

- [ ] Gerar por **ano** e **total** (além do período atual).
- [ ] Tempo médio dos chamados.
- [ ] Chamados por tipo de local: mostrar o total de chamados de cada tipo.
- [ ] Pedidos de controle por local.
- [ ] Cada aba ganha uma descrição do que mostra (hoje há aba que só diz "por dia").

### F. Dashboard e navegação

- [ ] Sidebar no desktop agrupada por seção: Dashboard | Chamados | Registros e Controles & Tags.

### G. Registros

- [ ] Visita técnica como registro: onde foi (local cadastrado ou um local temporário, só
      texto) e o horário — de que horas a que horas, **ou** só quanto tempo durou.

### H. Usuários

- [ ] Senha temporária visível enquanto estiver em uso (até a pessoa trocar). Verificar se
      hoje ela some antes disso — a regra em `CLAUDE.md` já diz que deveria ficar.

---

## O que falta no app — lista de ideias

Ordenado pelo que mais muda o dia da operação. Cada item diz o problema primeiro; sem
problema claro, a ideia não vale o código.

> **Já construídos** (18/09/2026): uso sem sinal (fila de envio), backup do banco e das
> fotos, e os testes das regras que não podem quebrar. A numeração abaixo pulou esses três.
> **Descartadas** (25/09/2026): #4 Custo e faturamento e #5 Catálogo de peças — dependiam da
> troca de item/compra no atendimento, que sai do sistema.

### 1. Comprovação do atendimento (assinatura e anexos que não são foto)

**Problema:** a única prova do serviço é a foto e o texto do técnico. Quando o síndico
contesta ("ninguém veio", "não foi isso que combinamos"), não há o que mostrar.

**Proposta:** assinatura do responsável no local, colhida com o dedo na tela ao concluir
(nome + assinatura + hora), e anexos de qualquer tipo no chamado — orçamento em PDF, nota
fiscal, vídeo curto do defeito.

**Muda:** `Ticket.assinatura` (imagem + nome + timestamp) e uma tabela `Anexo`
(ticketId, nome, tipo, tamanho, caminho); o upload já existe, falta aceitar outros tipos
com limite de tamanho; a assinatura entra no PDF do relatório.

### 2. Chamados programados (preventivas)

**Problema:** manutenção periódica é combinada por contrato e hoje depende de alguém
lembrar de abrir o chamado.

**Proposta:** agendamento por local — "toda primeira segunda do mês, limpeza das câmeras" —
que cria o chamado sozinho na data, já na fila, marcado como preventivo.

**Muda:** tabela `Agendamento` (local, título, descrição, recorrência, ativo), um job no
boot da API varrendo o que venceu, e um filtro "preventivo × corretivo" nos relatórios —
misturar os dois distorce qualquer média.

### 3. Acompanhamento pelo solicitante, sem conta

**Problema:** quem abriu o chamado (síndico, zeladoria) liga para saber o andamento, porque
não tem como ver.

**Proposta:** link público por chamado, com token, mostrando só o essencial — situação,
data de abertura, o que foi feito, fotos finais — e um aviso automático quando conclui.

**Muda:** `Ticket.tokenPublico`, uma rota pública de leitura com rate limit e uma página
sem login. Aviso por e-mail exige SMTP configurado; por WhatsApp, um provedor.

### 6. Chamado parado

**Problema:** um chamado pego e esquecido não aparece em lugar nenhum; só some da vista.

**Proposta:** marcar na tela (e avisar quem coordena) o chamado sem nenhum movimento há
mais de X dias — sem virar prazo contratual, que este app não tem de propósito. É higiene
de fila, não SLA.

**Muda:** cálculo no `/stats/overview` e um selo no cartão; o X fica em Configurações.

### 9. Busca global

**Problema:** achar "aquele chamado do portão do Jardim" exige lembrar em qual das três
telas ele está.

**Proposta:** uma busca só (Ctrl+K no desktop, lupa no celular) varrendo chamados, locais e
registros, com o resultado levando direto ao lugar certo.

**Muda:** rota `/busca?q=` no servidor e um diálogo no front.

### 11. Importar locais de planilha

**Problema:** começar em um cliente novo é digitar dezenas de condomínios à mão.

**Proposta:** importação de CSV com pré-visualização e conferência antes de gravar,
reaproveitando o CEP para o pino do mapa.

### 12. Confirmar a ida pelo GPS

**Problema:** "Cheguei agora" marca a hora, mas não onde.

**Proposta:** com a permissão de localização, comparar a posição com o pino do local e
registrar a distância na ida — vira prova quando o relatório de horas é cobrado.

### 13. Terminar a ajuda "Como funciona"

**Feito:** o menu da conta abre a ajuda, filtrada pela permissão de quem lê, com as três
telas de chamado (Abertos, Em andamento, Concluídos) e o caminho que liga as três.

**Falta:** escrever as seções de Registros, Locais, Relatórios, Usuários e permissões,
Dashboard e Configurações, no mesmo formato (`src/lib/ajuda.ts` — texto, passos e nota,
cada tópico com a permissão que o faz existir). Depois disso, vale um atalho de ajuda
dentro de cada tela, levando direto à seção dela.

---

## Reincidência: identificar e contabilizar problema que volta

### O problema

Hoje cada chamado é uma ilha. Se o portão da garagem do Condomínio Jardim quebra três vezes
no mês, aparecem três chamados concluídos "no prazo" — o relatório parece ótimo e ninguém vê
que a solução não resolveu. Reincidência é o indicador de **qualidade** do atendimento, que
horas e quantidade de chamados não mostram.

### Definição proposta

Um chamado é **reincidente** quando, dentro de uma janela configurável (padrão **30 dias**)
depois da conclusão de outro chamado, é aberto um novo chamado com:

1. o **mesmo local**, **e**
2. o **mesmo assunto** — ver "Como saber que é o mesmo problema" abaixo.

Reabrir um chamado concluído também conta como reincidência (é o caso mais explícito).

### Como saber que é o mesmo problema

Título livre não serve para comparar ("portão não abre" × "garagem travada"). Três caminhos,
do mais simples ao mais esperto — dá para começar pelo 1 e somar os outros depois:

1. **Categoria + item/equipamento (recomendado para começar)**
   - Novo cadastro simples de **categorias** (Portão, Interfone, CFTV, Controle de acesso,
     Rede, Elétrica…) e, opcionalmente, **item do local** ("Portão garagem", "Eclusa bloco B").
   - O operador escolhe a categoria ao abrir; o técnico pode corrigir no atendimento.
   - Reincidência = mesmo local + mesma categoria (+ mesmo item, quando houver) na janela.
   - Vantagem: número confiável e fácil de explicar ao cliente.

2. **Vínculo manual "é o mesmo problema de…"**
   - Ao abrir, o sistema mostra *"Chamados recentes neste local"* (últimos 30 dias). O operador
     marca "é reincidência de CH-0123" com um clique.
   - Cobre o que a categoria não pega e já educa a equipe a olhar o histórico antes de abrir.

3. **Sugestão automática por texto (fase posterior)**
   - Comparar palavras do título/descrição com os chamados recentes do mesmo local
     (similaridade simples de termos) e **sugerir** — nunca marcar sozinho — a reincidência.

### Onde aparece

- **No formulário de abertura:** aviso *"Este local teve 2 chamados de Portão nos últimos
  30 dias (CH-0101, CH-0117)"* antes de salvar.
- **No card e no detalhe do chamado:** selo "Reincidente · 3ª vez" com link para os anteriores.
- **Para o técnico:** a solução e as ações tomadas dos chamados anteriores aparecem no
  atendimento — é o que evita repetir o mesmo serviço que não resolveu.
- **No relatório mensal**, nova seção *Reincidência*:
  - taxa de reincidência do mês (`reincidentes ÷ concluídos`);
  - top locais e top categorias com mais retorno;
  - por técnico: quantos chamados que ele concluiu voltaram na janela (indicador de qualidade,
    a ser usado com cuidado — o problema pode ser do equipamento, não do serviço);
- **No dashboard:** cartão "Reincidências no mês" com a lista dos casos abertos.

### O que muda no sistema

| Parte | Mudança |
|---|---|
| Banco | tabela `Categoria` (id, nome, ativo); em `Ticket`: `categoriaId`, `itemLocal` (texto), `reincidenciaDeId` (chamado anterior), `reincidenciaAuto` (bool: detectada ou marcada à mão) |
| Configurações | janela de reincidência em dias (padrão 30) e cadastro de categorias (gestor) |
| API | ao criar/reabrir chamado, procurar o concluído mais recente do mesmo local + categoria dentro da janela e preencher `reincidenciaDeId`; rota `GET /tickets/:id/historico-local` para o aviso na abertura |
| Relatório | seção de reincidência descrita acima, também no CSV (coluna "Reincidência de") |
| Permissões | `gerenciar_categorias` (gestor); marcar/desmarcar reincidência fica com quem edita o chamado |

### Cuidados

- Chamado **preventivo/agendado** (manutenção periódica) não deve contar — precisa de um tipo
  "preventiva" ou de uma categoria excluída da contagem.
- A janela e a regra precisam aparecer no próprio relatório ("reincidência = mesmo local e
  categoria em até 30 dias"), senão o número vira discussão.
- Mudar a janela não deve reescrever o passado sem aviso: recalcular é uma ação explícita.
