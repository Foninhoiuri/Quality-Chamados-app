import { Inbox, Wrench, CheckCircle2, Route, type LucideIcon } from 'lucide-react'

/**
 * O MANUAL DO APP, em texto — e filtrado pelo que a pessoa pode fazer.
 *
 * Ajuda que explica botão que você não tem atrapalha: quem é operador não precisa saber
 * como se conclui um chamado, e quem é técnico não quer ler sobre permissões. Por isso
 * cada tópico carrega a permissão que o faz existir na tela; sem ela, o tópico não aparece.
 *
 * O conteúdo mora aqui, longe do componente: mexer no texto não deve exigir mexer em JSX.
 */

export interface AjudaItem {
  titulo: string
  /** Aparece para quem tem ALGUMA destas. Sem `perm`, aparece para todo mundo da seção. */
  perm?: string[]
  /** Aparece só para quem tem TODAS — a ação que depende de duas permissões. */
  permTodas?: string[]
  /** O que é, em uma ou duas frases. */
  texto: string
  /** O caminho na tela, passo a passo. */
  passos?: string[]
  /** O detalhe que costuma pegar as pessoas de surpresa. */
  nota?: string
}

export interface AjudaSecao {
  id: string
  titulo: string
  resumo: string
  icone: LucideIcon
  /** A tela de que a seção fala — vira o botão "Abrir a tela". */
  rota?: string
  perm?: string[]
  itens: AjudaItem[]
}

export const AJUDA: AjudaSecao[] = [
  {
    id: 'fluxo',
    titulo: 'O caminho do chamado',
    resumo: 'Como as três telas se ligam e por que um chamado some de uma e aparece na outra',
    icone: Route,
    perm: ['ver_chamados'],
    itens: [
      {
        titulo: 'Três telas, um caminho só',
        texto:
          'Abertos é a fila: chamado que existe e ainda não tem técnico. Em andamento é o que está sendo atendido agora. Concluídos é o que já foi entregue. O chamado anda sempre nessa direção, e cada tela mostra só a etapa dela.',
        nota: 'Quando você age — pega, move ou conclui — o chamado muda de tela e o app te leva junto, com ele aberto. Ele não sumiu: mudou de etapa.',
      },
      {
        titulo: 'Ninguém distribui chamado',
        texto:
          'Não existe "atribuir para o fulano". O chamado entra na fila e o técnico pega. Responsável é sempre quem pegou — é assim que se sabe de quem é o trabalho sem ninguém ter de despachar nada.',
      },
      {
        titulo: 'O que você enxerga na lista',
        texto:
          'Os chamados que você abriu, os que você pegou e aqueles em que te puseram junto aparecem sempre. Ver o chamado dos outros depende da permissão "Ver chamados de outras pessoas"; e se o seu perfil tem locais definidos, você vê os chamados desses locais.',
      },
      {
        titulo: 'O código do chamado',
        texto:
          'Aquele número em cima do título (CH-123, por exemplo) é o nome do chamado para o mundo de fora. É ele que se fala no telefone, se cola no e-mail e se procura na busca.',
      },
      {
        titulo: 'A bolinha na barra de navegação',
        texto:
          'O pontinho ao lado de Abertos, Em andamento, Concluídos e Registros quer dizer que aconteceu algo ali desde a última vez que você entrou na tela. Ele apaga sozinho quando você abre a tela.',
      },
      {
        titulo: 'Sem internet o trabalho não para',
        texto:
          'Marcar chegada e saída funciona sem sinal: a marcação fica guardada no aparelho e sobe sozinha quando a conexão volta. O anel em volta da sua foto fica vermelho enquanto o servidor não responde.',
      },
    ],
  },

  {
    id: 'abertos',
    titulo: 'Abertos — a fila',
    resumo: 'Onde o chamado nasce e espera alguém pegar',
    icone: Inbox,
    rota: '/abertos',
    perm: ['ver_chamados'],
    itens: [
      {
        titulo: 'Abrir um chamado',
        perm: ['criar_chamados'],
        texto:
          'É o registro do problema: o que aconteceu, onde e quem pediu. Quanto melhor o relato, menos telefonema o técnico precisa dar depois.',
        passos: [
          'Toque em "Novo chamado".',
          'Escreva um título curto que diga o problema ("Portão social não destrava").',
          'No relato, conte o que está acontecendo, desde quando e o que já tentaram.',
          'Escolha o local e, se souber, quem pediu (nome e telefone de quem vai receber o técnico).',
          'Anexe fotos do problema — é o que mais economiza viagem.',
        ],
        nota: 'O chamado nasce sem responsável, na fila. Não é preciso escolher técnico.',
      },
      {
        titulo: 'Dizer o que precisa ser feito',
        perm: ['definir_servico'],
        texto:
          'Quando você já sabe o serviço — passou no local, viu o problema, sabe a peça — escreva em "O que precisa ser feito". É a instrução que o técnico que pegar vai ler antes de sair, e ela aparece em destaque dentro do chamado até ele terminar.',
        nota: 'Não é a solução: a solução é o que se escreve depois, no atendimento, contando o que resolveu de verdade.',
      },
      {
        titulo: 'Criar o local na hora',
        perm: ['gerenciar_locais'],
        texto:
          'Se o prédio ainda não está cadastrado, dá para criar no próprio formulário do chamado, sem sair da tela: procure o local, e quando não aparecer, use a opção de cadastrar. Basta o nome; endereço e CEP dá para completar depois em Locais.',
      },
      {
        titulo: 'Serviço já realizado',
        permTodas: ['registrar_atendimento', 'concluir_chamados'],
        texto:
          'Para lançar o que já foi feito sem passar pela fila — aquele conserto rápido resolvido na hora, que precisa ficar registrado. O chamado nasce concluído, no seu nome, com a data e a hora em que o serviço aconteceu de verdade.',
        nota: 'Se a data for de mais de uma semana atrás, ele já entra direto no histórico de Concluídos — não aparece no quadro.',
      },
      {
        titulo: 'Pegar o chamado',
        perm: ['aceitar_chamados'],
        texto:
          'Pegar é dizer "esse é meu". O chamado sai da fila, você vira o responsável e ele passa para Em andamento — com a tela te levando junto para você já começar.',
        nota: 'O cartão tem uma ação só, e ela sempre diz o que vai acontecer. Em Abertos, é "Pegar chamado".',
      },
      {
        titulo: 'Quanto tempo está esperando',
        texto:
          'O "na fila há…" no cartão e no chamado conta desde a abertura. É o número que mostra o que está parado há tempo demais.',
      },
      {
        titulo: 'Falar sobre o chamado sem pegar',
        perm: ['comentar_chamados'],
        texto:
          'O botão de conversa fica no próprio cartão, antes de qualquer um pegar. Serve para perguntar um detalhe a quem abriu, ou avisar que já está a caminho, sem assumir o chamado.',
      },
      {
        titulo: 'Desfazer um chamado que você abriu',
        texto:
          'Enquanto ninguém pegou, quem abriu pode cancelar ou excluir o próprio chamado — aberto em duplicidade, ou o síndico resolveu antes. Depois que um técnico pega, isso passa a depender de permissão.',
        nota: 'O que foi escrito não se perde: título, relato, quem abriu e o motivo ficam na auditoria.',
      },
      {
        titulo: 'Cancelar o chamado de outra pessoa',
        perm: ['cancelar_chamados'],
        texto:
          'Cancelar tira o chamado do quadro sem fingir que ele foi resolvido. O motivo é opcional, mas é ele que explica o cancelamento seis meses depois.',
      },
      {
        titulo: 'Corrigir os dados do chamado',
        perm: ['gerenciar_chamados'],
        texto:
          'Título, relato, local, solicitante e fotos podem ser ajustados a qualquer momento por "Editar dados", dentro do chamado.',
      },
      {
        titulo: 'Lançar com data de antes',
        perm: ['ajustar_datas_chamado'],
        texto:
          'A data e a hora de abertura (e a de conclusão) podem ser editadas, para lançar o que aconteceu ontem e ninguém registrou. É o que mantém o relatório do mês honesto.',
      },
      {
        titulo: 'Achar o chamado certo',
        texto:
          'A busca procura por código, título, local, técnico, quem abriu e solicitante. Ao lado dela, os filtros respondem o que a operação pergunta: o que é meu, o que ninguém pegou, o que é daquele prédio, o que entrou nos últimos 7 dias.',
      },
    ],
  },

  {
    id: 'andamento',
    titulo: 'Em andamento — o atendimento',
    resumo: 'O que está na mão do técnico: colunas, horas, solução e passagem de bastão',
    icone: Wrench,
    rota: '/andamento',
    perm: ['ver_chamados'],
    itens: [
      {
        titulo: 'As colunas do quadro',
        texto:
          'Em andamento é a única tela com colunas — elas dizem em que pé está o atendimento (aguardando peça, agendado, no local…). Abertos e Concluídos são as pontas do caminho e não têm coluna.',
        nota: 'No computador as colunas ficam lado a lado e o cartão se arrasta. No celular cada coluna é uma aba, e o cartão tem um botão para mudar de coluna.',
      },
      {
        titulo: 'Criar e organizar as colunas',
        perm: ['gerenciar_status_chamados'],
        texto:
          'Em "Colunas" (no alto da tela, ou atrás dos três pontinhos no celular) dá para criar, renomear, reordenar e remover coluna. A ordem é o caminho que o chamado percorre: o botão do cartão sempre leva para a coluna seguinte.',
      },
      {
        titulo: 'Cheguei agora / Saí agora',
        perm: ['registrar_atendimento'],
        texto:
          'É o ponto do atendimento, no rodapé do chamado: um toque ao chegar no local, outro ao sair. A hora gravada é a do toque, e a conta do tempo é feita pelo servidor — você não digita nada.',
        passos: [
          'Chegou no prédio: abra o chamado e toque em "Cheguei agora".',
          'O botão fica verde e vira "Saí agora" enquanto você está lá.',
          'Terminou: toque em "Saí agora". O tempo da ida entra sozinho no atendimento.',
        ],
        nota: 'Com dois técnicos no mesmo chamado, cada um marca a própria ida — o seu botão nunca fecha a ida do colega. Sem sinal, a marcação sobe quando a conexão voltar.',
      },
      {
        titulo: 'Preencher o atendimento',
        perm: ['registrar_atendimento'],
        texto:
          'É o relatório do serviço, e é dele que saem as horas e o relatório do mês. O cartão do chamado tem o botão da chave de boca, que abre direto — de dentro do chamado, é "Preencher atendimento".',
        passos: [
          'Solução: o que foi feito para resolver. É o campo que a conclusão exige.',
          'Idas ao local: as marcações de chegada e saída, que dá para corrigir à mão — por horário ou informando só quanto tempo ficou.',
          'Fotos: "antes de começar" (como você encontrou) e "depois" (como você deixou) — o par é o que sustenta o serviço numa discussão meses depois. As fotos de quem abriu o chamado ficam em outro lugar, no corpo do chamado.',
          'Itens usados: o que foi trocado ou comprado, com quantidade e valor.',
          'Análise, possível solução e ações tomadas: ficam recolhidos, para quando o caso pede mais texto.',
        ],
        nota: 'Salvar guarda o que está escrito sem concluir nada — dá para salvar quantas vezes quiser durante o atendimento.',
      },
      {
        titulo: 'Compartilhar com outro técnico',
        perm: ['compartilhar_chamados'],
        texto:
          'Põe outra pessoa junto no chamado: ela passa a ver, a receber os avisos e a marcar a própria ida ao local. O chamado continua seu — quem escreve a solução é o responsável, para não existirem dois textos brigando.',
      },
      {
        titulo: 'Passar para outro técnico',
        texto:
          'Para quando você foi, voltou e não vai conseguir terminar. Quem recebe continua de onde você parou: as horas, os itens e os textos ficam. Você continua acompanhando como apoio, e o motivo entra no histórico do chamado.',
        nota: 'Sem escolher ninguém, o chamado volta para a fila em Abertos e qualquer técnico pode pegar.',
      },
      {
        titulo: 'Quem escreveu o quê',
        texto:
          'Toda análise, solução e ação guarda o autor e a hora, numa linha do tempo dentro do chamado — junto com as passagens de responsável. É o que impede o segundo técnico de apagar o trabalho do primeiro sem deixar rastro.',
      },
      {
        titulo: 'Chegar no local',
        texto:
          'O endereço fica em destaque dentro do chamado, com um botão para abrir no GPS e outro para copiar só o endereço — o que se cola no aplicativo do carro ou se manda no WhatsApp.',
      },
      {
        titulo: 'Finalizar o chamado',
        perm: ['concluir_chamados'],
        texto:
          'O botão da última coluna é "Finalizar chamado". Ele exige a solução escrita: chamado concluído sem dizer o que foi feito não serve para ninguém depois.',
        nota: 'Se faltar a solução, o app abre o atendimento no campo certo em vez de só reclamar.',
      },
      {
        titulo: 'Devolver o chamado à fila',
        texto:
          'Pegou por engano, ou o serviço vai ficar para outra equipe: "Devolver à fila" tira o seu nome e o chamado volta para Abertos, com o que já foi escrito.',
      },
      {
        titulo: 'Corrigir o atendimento de outro técnico',
        perm: ['corrigir_atendimento'],
        texto:
          'Com esta permissão você entra no atendimento de qualquer chamado para arrumar hora lançada errada ou texto trocado, e pode devolver à fila o chamado que está na mão de outra pessoa. A correção fica registrada no histórico com o seu nome.',
      },
    ],
  },

  {
    id: 'concluidos',
    titulo: 'Concluídos — o que já foi entregue',
    resumo: 'A lista do que terminou, do mais recente ao histórico antigo',
    icone: CheckCircle2,
    rota: '/concluidos',
    perm: ['ver_chamados'],
    itens: [
      {
        titulo: 'Uma lista só, por dia',
        texto:
          'Os chamados aparecem agrupados por dia, do mais recente para trás, com uma linha de resumo: local, tempo no local, itens e quem atendeu. Tocar no chamado abre tudo — solução, fotos, horas e o histórico do atendimento.',
      },
      {
        titulo: 'Andar no tempo',
        texto:
          'A lista abre na semana atual. As setas vão para a semana anterior e a seguinte, "Tudo" solta a lista inteira, e o período personalizado responde a pergunta do tipo "o que foi feito entre o dia 1 e o dia 15".',
        nota: 'Os filtros e a busca do alto da tela valem aqui também, inclusive sobre o histórico antigo.',
      },
      {
        titulo: 'O histórico antigo',
        perm: ['ver_arquivados'],
        texto:
          'Chamado concluído há muito tempo sai do quadro para não pesar, mas continua aqui: recém-concluídos e histórico aparecem na mesma lista, sem diferença. Sem esta permissão, a lista mostra só os concluídos recentes.',
      },
      {
        titulo: 'Corrigir um chamado concluído',
        perm: ['editar_concluidos'],
        texto:
          'Faltou uma hora, o item foi lançado errado, a solução ficou pela metade: o botão de editar aparece na própria lista e o atendimento abre para correção, mesmo com o chamado fechado.',
      },
      {
        titulo: 'Reabrir',
        perm: ['reabrir_chamados'],
        texto:
          'O problema voltou e é o mesmo caso: reabrir traz o chamado para Em andamento com todo o histórico, em vez de abrir um chamado novo sem passado.',
      },
      {
        titulo: 'Os números do mês',
        perm: ['ver_relatorios'],
        texto:
          'Para somar horas, contar chamados por local e apresentar o mês, a tela de Relatórios lê exatamente o que foi preenchido aqui — é por isso que o atendimento bem escrito vale tanto.',
      },
    ],
  },
]
