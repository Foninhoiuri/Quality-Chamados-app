# Mudanças — Quality Chamados

O que foi entrando no app, da mais recente para a mais antiga. Serve para acompanhar o que
mudou sem ler o histórico do git, e para saber o que precisa ser conferido depois de subir.

---

## 22/09/2026 — o atendimento virou a tela do técnico

O chamado em andamento passa a ser **resumo**; quem trabalha trabalha dentro do
atendimento. Antes o botão de marcar chegada aparecia duas vezes na mesma tela e dava
dúvida sobre qual estava valendo.

- **"Marcar minha chegada agora" abre o atendimento** — é o primeiro gesto de quem chega
  no local. No chamado ele continua como atalho no rodapé, e some do corpo (que agora só
  mostra, com "no local desde…" quando a ida está aberta).
- **"Idas ao local" ficou recolhido**, logo abaixo do botão de chegada, com o total do
  lado. Ele só é aberto quando o relógio precisa de conserto ou para lançar uma ida que
  ninguém marcou na hora.
- **Os textos ficam juntos**: a solução à vista e, na mesma caixa, uma linha que abre
  análise, possível solução e ações tomadas — com a contagem do que já está escrito.
- **Fotos no celular em dois botões**: "Tirar foto" abre a câmera direto, "Galeria" pega o
  que já existe. No computador dá para **arrastar as fotos** para dentro da caixa.
- **No cartão de Em andamento, "Atendimento" é o botão grande** e "Finalizar" encolheu —
  continua vermelho, mas deixa de ser o que a mão encontra primeiro. Atender é o que se faz
  o dia inteiro; finalizar acontece uma vez.
- **O endereço no chamado ocupa menos**: ele usa a largura toda e os botões (GPS e copiar)
  ficam embaixo, pequenos. Antes quebrava em cinco linhas.

---

## 22/09/2026 — cores por estado, fotos de antes e depois, serviço na abertura

### Cada estado do chamado tem a sua cor

**Âmbar espera, azul está sendo feito, verde terminou** — e agora é a mesma cor em todo
lugar: a etiqueta da movimentação recente, o anel do dashboard, os gráficos, o cabeçalho
das colunas do quadro, as abas do celular e a situação no relatório.

Antes "aberto" e "em andamento" saíam os dois vermelhos. O motivo: neste tema a paleta
`sky` foi trocada pelo vermelho da marca, então o azul de "em andamento" virava vermelho
sem ninguém perceber. O vermelho volta a ser o que era: a cor das ações, não de um estado.

### As fotos do técnico agora são duas

**"Antes de começar"** (como encontrou) e **"Depois"** (como deixou), lado a lado no
atendimento. As fotos de quem abriu o chamado continuam em separado, no corpo do chamado.
É o par antes/depois que sustenta o serviço numa conversa meses depois.

### "O que precisa ser feito", na abertura

Quem já sabe o serviço escreve na hora de abrir, e o texto aparece em destaque dentro do
chamado até ele terminar — é a instrução que o técnico lê antes de sair. **É uma permissão
nova** ("Abrir chamado já dizendo o que precisa ser feito"), ligada por padrão para
Administrador e Técnico; dá para ligar em qualquer perfil na tela de permissões.

### Miudezas que economizam toque

- **Atendimento direto do cartão** em Em andamento (o botão da chave de boca): era preciso
  abrir o chamado e clicar mais duas vezes.
- **O aviso de localização bloqueada virou botão**: tocar nele pede a permissão de novo. Se
  o bloqueio for definitivo, o aviso passa a dizer onde desfazer (o cadeado do navegador).
- **Local só com CEP agora entra no mapa** — "Localizar no mapa" recusava sem rua e cidade,
  embora a busca saiba achar pelo CEP.
- **No cartão do local, dois botões em vez de um link**: "Ver no mapa" leva ao ponto no mapa
  da própria tela, e "Google Maps" abre lá fora, que é o que inicia a navegação no carro.
- **Tipos de local têm sigla** (COND, COM, OBRA): é ela que aparece dentro do chamado, ao
  lado do nome do prédio.
- Na lista de locais do chamado, cada um aparece como **ABREV - Nome**.

---

## 22/09/2026 — tipos de local

Locais agora têm **tipo** — condomínio, comercial, residencial, obra — e a lista é editável
na própria tela, em "Tipos de local" (três pontinhos, no celular), do mesmo jeito que as
colunas de Em andamento e as categorias de registro: arrasta para reordenar, renomeia no
lugar, escolhe a cor.

A etiqueta aparece no cartão do local e vira filtro em cima da lista, com a contagem de
cada uma. **Tipo é opcional**: local sem etiqueta é normal, e quando um tipo é apagado os
locais dele ficam **sem tipo** — marcar com a etiqueta errada seria pior do que não marcar.

Editar a lista pede a permissão de **criar e editar locais**: cada lista pertence a quem
administra a tela dela.

---

## 22/09/2026 — janela na frente, lista que atualiza sozinha e serviço já realizado completo

### A caixa de confirmação nascia atrás da janela

Excluir um chamado concluído abria a confirmação **atrás** do chamado: a tela parecia
travada. As janelas agora se empilham pela ordem em que abrem, não pela ordem em que estão
escritas no arquivo — vale para toda confirmação do app, não só essa. Junto:

- **O aviso ("excluído", "salvo") passa na frente de qualquer janela.** Ele quase sempre
  nasce de dentro de uma, e atrás dela não serve para nada.
- **Os botões do mapa não escapam mais para cima** da barra de navegação e das janelas.

### A lista não esperava mais o F5

Chamado excluído, reaberto ou corrigido continuava na tela de Concluídos até recarregar a
página, porque o histórico é uma lista à parte. Agora ele se refaz a cada mudança feita no
app — e só nelas, sem ficar buscando de dez em dez segundos.

### Serviço já realizado

- **O tempo no local entra na hora do lançamento** ("Quanto tempo levou: 1:30"). Antes o
  aviso mandava lançar as horas depois, num chamado que já nasce concluído — ou seja, não
  se lançava.
- **A data de abertura também se ajusta ao abrir o chamado**, para quem tem a permissão de
  lançamento retroativo. Antes só na edição.

### Abrir chamado

**O local é o primeiro campo** — é a primeira coisa que se pergunta no telefone e é ele que
decide quem enxerga o chamado. Na lista, cada local aparece como **(ABREV) Nome**.

---

## 22/09/2026 — mapa de volta em produção, versão por commit e gráfico igual ao do painel

### O mapa não carregava no servidor publicado

Os mapas do OpenStreetMap chegam como imagens de `tile.openstreetmap.org`, e a política de
segurança do nginx (`img-src`) só permitia imagens do próprio site — o mapa virava um
retângulo vazio. Em desenvolvimento funcionava, porque ali não passa por esse nginx, e foi
por isso que o problema resistiu.

Junto: **"Centralizar em mim" voltou a funcionar** (a mesma política desligava a
localização do site inteiro) e o painel passa a se identificar ao servidor de mapas, como
a política de uso deles pede. **Precisa recriar a stack no Portainer** para o nginx pegar
a configuração nova.

### A versão sobe sozinha a cada commit

Cada commit vale **0.1** (commit 10 = v1.0, commit 13 = v1.3) e o número é gravado antes
do commit fechar. Nada de versão escrita à mão: o que aparece no rodapé do app é sempre o
código que está rodando. Estamos na **v1.3**.

### Gráfico do relatório igual ao do dashboard

"Por dia" deixou de ser barras e virou a mesma área com degradê do painel — quem olha os
dois no mesmo dia não precisa reaprender a ler o gráfico.

---

## 21/09/2026 — ajuda dentro do app: "Como funciona"

No menu da conta agora existe **Como funciona o app**: um manual em texto, dividido por
tela, que explica o que cada função faz e o caminho para usá-la — com passo a passo onde
faz diferença e o aviso do detalhe que costuma pegar as pessoas de surpresa.

**A ajuda é recortada pela permissão de quem lê.** Quem não pode concluir chamado não lê
sobre conclusão; quem não mexe em coluna não lê sobre coluna. Explicar botão que a pessoa
não tem só gera pedido de permissão que ninguém queria dar. Tem busca (sem acento, sem
caixa) e um selo do seu perfil, que é o que explica o vizinho ver um tópico a mais.

Nesta primeira versão estão os chamados: **o caminho do chamado** (por que ele muda de
tela) e as três telas — **Abertos**, **Em andamento** e **Concluídos**. As outras telas
entram em seguida; o conteúdo mora em `src/lib/ajuda.ts`, separado do componente.

---

## 21/09/2026 — ajustes de tela: ponto no rodapé, passar o bastão e foto do perfil

- **"Cheguei agora" no rodapé do chamado**, no lugar do botão "Atendimento": marcar a hora
  é o que mais se faz com o celular na mão e estava a dois toques de distância. Ele vira
  "Saí agora" quando você já está no local. O rodapé ficou Conversa e Cheguei em cima,
  Fechar e a ação que termina o chamado embaixo; o formulário do atendimento continua no
  corpo do chamado.
- **"Passar para outro técnico" saiu do fim do chamado** e foi para junto de "Compartilhar
  com outro técnico", no mesmo tamanho: são o mesmo assunto — quem está no chamado.
- **A foto do perfil aparece em todos os avatares** assim que é enviada. Antes só mudava
  depois de fechar e abrir o app, porque a lista de rostos não era recarregada.
- **Os três pontinhos do cabeçalho abrem para dentro da tela** em Em andamento e em
  Registros. Com o título comprido, a caixa de ações caía para a linha de baixo e ia parar
  na esquerda, levando o menu para fora da tela junto.

---

## 21/09/2026 — atendimento em campo: ponto, passagem de bastão e conversa

### O ponto (chegada e saída)

- **Um botão só, que alterna**: "Marcar minha chegada agora" vira "Marcar minha saída
  agora", e salva na hora. Antes havia um botão no chamado e outro dentro do modal, e dava
  para pensar que a saída estava marcando o horário da chegada.
- **Cada ponto tem a sua data.** A chegada às 23h com saída à 1h30 agora dá 2h30 — antes a
  saída era tratada como hora do mesmo dia. No formulário, chegada e saída são campos de
  data e hora, cada um com um "agora" ao lado.
- **A ida marcada fora do modal aparece no modal** para ser corrigida: o formulário
  acompanha o que mudou no servidor.
- **Quem está junto no chamado marca a própria ida.** O apoio vai ao local de verdade; sem
  isso, as horas dele sumiam ou entravam no nome do responsável. Ele mexe só nas idas
  dele — escrever o atendimento continua sendo do responsável.

### Passar o chamado para outro técnico

O técnico foi, voltou e não vai conseguir terminar. Agora existe **"Passar para outro
técnico"**: quem recebe continua de onde o outro parou (horas, itens e textos ficam), quem
sai continua acompanhando como apoio, e o motivo entra no histórico. Quem está junto no
chamado pode **assumir para si**. Sem escolher ninguém, devolve para a fila.

### Histórico do atendimento

Cada análise, solução e ação agora guarda **quem escreveu e quando**, numa linha do tempo
dentro do card — junto com as passagens de responsável. Antes, o segundo técnico
sobrescrevia o texto do primeiro sem deixar rastro. Aparece no chamado em andamento e no
concluído.

### A conversa saiu do modal

"Andamento" virou **Conversa**, em janela própria, com botão no cartão do chamado ao lado
da ação principal e no detalhe. Dá para conversar **sem pegar o chamado**, e quem está em
campo não precisa rolar o atendimento inteiro para ler um recado.

### Endereço à mão

Depois de pegar o chamado, o endereço aparece em destaque com **"Abrir no GPS"** e
**"Copiar"** — antes era um link pequeno de "mapa" ao lado do nome do local.

### Outros

- **Modal em tela cheia no celular** (chamado, atendimento, conversa e concluído), com
  `100dvh` para a janela encolher junto com o teclado em vez de ficar atrás dele.
- **Fotos antes dos itens** no atendimento: o seletor de imagem cobre a tela no celular e
  voltar para o fim de um formulário longo era o que mais irritava.
- **"Salvar e concluir" saiu do atendimento.** O modal salva o atendimento; concluir é o
  botão do chamado. Dois botões parecidos no mesmo rodapé pareciam a mesma coisa.
- **Foto de perfil em todo lugar**: comentários, técnico do chamado, quem está junto, idas,
  histórico, lista de usuários e registros. Sem foto, as iniciais.
- Seis testes novos (16 no total): passagem de bastão, histórico por autor, ida que vira a
  noite, saída antes da chegada e os limites do técnico de apoio.

---

## 18/09/2026 — sem sinal, backup e testes

### Funcionar sem sinal

O técnico registra a ida no subsolo, na casa de máquinas, no elevador — onde não há rede.
Agora, quando o envio falha por falta de conexão, a ação fica guardada no aparelho e sobe
sozinha quando a rede volta. Vale para **marcar chegada/saída**, **salvar o atendimento** e
**comentar** — o que se faz em campo, e sempre sobre um chamado que já existe.

Uma faixa no topo mostra quantos registros estão esperando, com um "tentar agora". Nada
finge que salvou: a mensagem diz que está na fila. Ver `src/lib/fila.ts`.

### Backup do banco e das fotos

O volume guarda hash de senha, chamados e fotos de cliente, e até aqui não havia cópia
nenhuma. Entrou um serviço `backup` no `docker-compose.yml` que, uma vez por dia:

- copia o SQLite com `VACUUM INTO` (sai íntegro mesmo com a API escrevendo no meio);
- compacta a pasta de uploads;
- guarda as N cópias mais recentes (padrão 14) e apaga o resto;
- avisa por webhook quando falha, se `BACKUP_WEBHOOK` estiver configurado.

O destino é `BACKUP_DIR` no host — aponte para um disco externo ou um compartilhamento de
rede: cópia no mesmo disco não salva de incêndio nem de disco queimado. Dá para rodar na
mão com `npm run backup` dentro de `api/`.

### Testes das regras que não podem quebrar

`npm test` em `api/` sobe a API de verdade contra um SQLite temporário e cobre o que
quebra sem ninguém perceber:

- a senha temporária entra no login (o bug desta semana, agora com teste de regressão);
- senha escolhida por quem cadastra vale, com ou sem troca no primeiro acesso;
- chamado não conclui sem solução e conclui depois dela;
- concluído só é editado por quem tem `editar_concluidos`;
- gestor abre chamado, mas não pega nem atende;
- cancelado some das listas e do relatório, e fica na auditoria com o motivo;
- chamado compartilhado soma as idas **sem duplicar** as horas;
- ida em andamento vale zero até a saída ser marcada;
- histórico exige `ver_arquivados` e nada é lido sem token.

### Corrigido no caminho

- **Chamado concluído do histórico não abria.** O app só tinha os ativos em memória, então
  clicar no concluído antigo caía em "chamado não encontrado" — e por isso não dava para
  editar nem com a permissão. Entrou `GET /tickets/:id` e a tela passa a buscar o chamado
  quando ele não está na lista. Na lista de concluídos, o botão **Editar** aparece para
  quem tem permissão, ao lado de "Abrir chamado".

---

## 18/09/2026 — correções pedidas na revisão

### Senhas de usuário (era o mais grave)

- **Senha temporária que não funcionava.** No servidor, `String(b.password ?? temp)` deixava
  passar string vazia: o usuário nascia com hash de senha vazia e a senha mostrada na tela
  nunca entrava. Agora só vira senha o que tem conteúdo de verdade.
- A senha temporária virou **ditável**: sem `0/O`, `1/I/l` e sem os sinais do base64url, no
  formato `ABCD-2345`.
- **Dá para definir a senha ao criar o usuário** (o campo existia só na edição). Em branco,
  o sistema gera a temporária como antes.
- **"Pedir que a pessoa crie a própria senha no primeiro acesso" virou caixa de seleção.**
  Desmarcada, a senha digitada já é a definitiva — era o passo a mais que incomodava.
- **Login recusado vai para a auditoria com o motivo** (e-mail não cadastrado, senha
  incorreta, usuário inativo). A senha nunca é registrada; quem tenta continua vendo a
  mesma mensagem genérica.

### Chamados

- **Menu de status saiu do formulário.** Quem move o chamado é o botão de etapa.
- **Data e hora saíram da abertura.** O chamado nasce agora; ajustar a data é na edição,
  para quem tem `ajustar_datas_chamado`.
- **Arquivar acabou.** Concluído fica na tela de Concluídos e pronto — sem "arquivar",
  sem "devolver aos concluídos", sem etiqueta de arquivado. O histórico antigo continua na
  mesma lista, atrás da permissão `ver_arquivados`.
- **Nova permissão `editar_concluidos`** (só Administrador). Sem ela, chamado concluído é
  registro fechado: não dá para editar dados nem atendimento. Reabrir continua sendo
  assunto de `reabrir_chamados`.
- **Nos concluídos, os dados viraram a mesma linha resumida** do chamado aberto: local ·
  solicitante · quem abriu · responsável.

### Atendimento técnico

- **"Cheguei agora" salva na hora** e o botão vira **"Terminei agora"**, que marca a saída e
  fecha a conta do tempo. Sem formulário no meio; corrigir depois continua possível.
- Ida em andamento aparece como **"no local agora"** na lista de idas.
- Com o chamado compartilhado, cada ida tem **"quem foi nesta ida"**. Uma ida pertence a um
  técnico só — o total de horas soma as idas e **não duplica** por causa do compartilhamento.

### Locais e mapa

- **Botão de centralizar em mim** no mapa, e o mapa reenquadra quando a localização chega
  (antes ele ficava no zoom inicial mesmo depois de autorizar).
- **Aviso quando o mapa não carrega** — antes ficava um retângulo azul sem explicação.
- **Excluir local**: os botões do cartão ganharam alvo maior e pararam de repassar o clique
  para o cartão (o dedo acertava o cartão, não o botão), e agora há um **"Excluir este
  local" dentro do formulário** do local.

### Outros

- **Menu do avatar fecha ao clicar fora.** O callback era recriado a cada render e o efeito
  remontava; agora é estável e o clique é lido pelo caminho do evento.
- **Movimentação recente (dashboard)**: a etiqueta de status usa a cor da fase — vermelho
  para fila, azul para em andamento, verde para concluído.

---

## 17/09/2026 — faxina visual

- Tema claro com contraste corrigido: superfícies brancas sobre fundo cinza, cinzas de texto
  mais escuros, vermelho/verde/amarelo fechados para se lerem sobre branco.
- Barra superior removida; o avatar virou o único menu (notificações, telas secundárias,
  versão e sair), no rodapé da lateral e na barra do celular.
- Pontinho de novidade por área na navegação (`GET /novidades`), atualizando sozinho.
- Modal do chamado: código pequeno em cima, título, estado logo abaixo, dados em uma linha,
  descrição maior e "Fechar" como botão escrito — o "x" do canto saiu de todos os modais.
- Atendimento técnico em modal por cima, com "Salvar" e "Salvar e concluir" no rodapé fixo.
- Mapa dos locais com plaquinhas (nome + chamados), agrupamento de pinos próximos e base do
  OpenStreetMap — sem serviço pago.
- Dashboard comparativo (7/15/30 dias, variação vs. período anterior) e anel por situação.
- Celular: modais em folha de rodapé, filtros recolhidos, abas por coluna, matriz de
  permissões por perfil, relatório em acordeão e tabelas viram cartões.

---

## 17/09/2026 — três telas por fase

- Chamados divididos em **Abertos**, **Em andamento** e **Concluídos**, com colunas
  configuráveis só no meio do caminho.
- Uma ação por cartão, com o nome do que vai acontecer; a tela segue o chamado.
- Cancelar chamado (fica só na auditoria), compartilhar com outros técnicos, serviço já
  realizado e datas retroativas com permissão própria.
- Gestor passa a acompanhar: no módulo Chamados tem o alcance do Operador.
- Registros com título, descrição opcional, categorias configuráveis e exportação própria.
- Relatório mensal em PDF; locais com CEP, sugestões de endereço e pino ajustável.
