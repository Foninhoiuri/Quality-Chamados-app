# Ideias futuras — Quality Chamados

Backlog do que **não** foi construído ainda. Cada ideia traz o problema, a proposta e o
que precisa mudar para sair do papel.

---

## Ajustes visuais que ficaram para a próxima rodada

Pequenos, mas reais — anotados durante a faxina visual de setembro/2026:

- **Pontinho de novidade no Dashboard e nas telas do menu da conta.** Hoje o ponto vermelho da
  barra cobre Abertos, Em andamento, Concluídos e Registros (`GET /novidades`). Faltam
  Relatórios, Locais, Usuários e Auditoria — exigiria o servidor devolver também o "mais
  recente" dessas áreas, e um ponto no próprio avatar quando algo mudar lá dentro.
- **Mapa: agrupar pinos próximos.** Com muitos locais no mesmo bairro as plaquinhas se
  sobrepõem. O caminho é agrupar por proximidade no zoom baixo (um número no lugar de várias
  plaquinhas) e abrir ao aproximar.
- **Ida ao local pelo GPS.** O técnico já está no local quando registra a ida: dava para
  oferecer "usar minha localização" e marcar a chegada/saída com um toque, em vez de digitar.
- **Colunas de Em andamento arrastáveis no celular.** Hoje o arrastar entre colunas é só no
  desktop; no celular se troca pelas abas e pelo botão de etapa. Um "mover para…" por toque
  longo no cartão resolveria os casos fora da ordem.
- **Tema claro nos gráficos.** As cores das séries (vermelho/verde) foram escolhidas no escuro;
  no claro elas funcionam, mas ganhariam com um tom mais fechado.

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
  atendimento — é o que evita repetir a mesma troca que não resolveu.
- **No relatório mensal**, nova seção *Reincidência*:
  - taxa de reincidência do mês (`reincidentes ÷ concluídos`);
  - top locais e top categorias com mais retorno;
  - por técnico: quantos chamados que ele concluiu voltaram na janela (indicador de qualidade,
    a ser usado com cuidado — o problema pode ser do equipamento, não do serviço);
  - itens trocados que não resolveram (mesmo item trocado 2× no mesmo local).
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
