// Status customizáveis: as chaves padrão são aberto/andamento/resolvido, mas dá para
// criar outras na tela de chamados; por isso o tipo é `string`.
export type TicketStatus = string

/**
 * Fase do chamado — é o que separa as três telas. `aberto` e `concluido` têm uma coluna
 * cada, fixas; `andamento` é a única que aceita mais colunas (aguardando peça, cliente…).
 */
export type FaseChamado = 'aberto' | 'andamento' | 'concluido'

/** Definição de um status (setting `ticket_statuses`). `done` = coluna de conclusão. */
export interface TicketStatusDef {
  key: string
  label: string
  done?: boolean
  fase?: FaseChamado
}

export interface Ticket {
  id: string
  code: string
  title: string
  description?: string | null
  status: TicketStatus
  origin: string
  solicitante?: string | null
  localId?: string | null
  localName?: string
  createdById?: string
  createdByName: string
  assigneeId?: string | null
  assigneeName?: string | null
  /** Técnicos de apoio: acompanham o chamado; quem preenche o atendimento é o responsável. */
  sharedWith?: TecnicoRef[]
  photos?: string[]
  /** Fotos do técnico ao CHEGAR (como encontrou) e ao SAIR (como deixou). */
  startPhotos?: string[]
  donePhotos?: string[]
  // atendimento técnico
  analise?: string | null
  possivelSolucao?: string | null
  solucao?: string | null
  acoesTomadas?: string | null
  visitas?: Visita[]
  itens?: ItemAtendimento[]
  /** Linha do tempo do atendimento: quem escreveu o quê, e as passagens de responsável. */
  historico?: RegistroAtendimento[]
  minutosTotais?: number
  commentCount?: number
  resolvedAt?: string | null
  archivedAt?: string | null
  canceledAt?: string | null
  createdAt: string
  updatedAt: string
}

/** Técnico como ele aparece dentro do chamado (compartilhamento) e na lista de escolha. */
export interface TecnicoRef {
  id: string
  name: string
  avatar?: string | null
}

/**
 * Ida ao local. Com início e saída o servidor calcula `minutos`; sem eles, vale o
 * informado. Com início e SEM saída, é uma ida em andamento: vale zero até fechar.
 */
export interface Visita {
  id?: string
  data: string // YYYY-MM-DD (dia da chegada)
  inicio?: string | null // HH:MM
  /** Dia da saída — pode ser outro: atendimento que vira a noite. */
  fimData?: string | null
  fim?: string | null // HH:MM
  minutos: number
  tecnicoId?: string | null
  tecnicoNome?: string
}

/** Uma entrada da linha do tempo do atendimento. */
export interface RegistroAtendimento {
  id: string
  autorId?: string | null
  autorNome: string
  tipo: 'analise' | 'solucao' | 'acoes' | 'passagem'
  texto: string
  createdAt: string
}

export interface ItemAtendimento {
  id?: string
  descricao: string
  quantidade: number
  tipo: 'trocado' | 'comprado'
  valor?: number | null
}

/** A chave da categoria; as categorias em si são configuráveis (setting `registro_tipos`). */
export type TipoRegistro = string

/** Categoria de registro: nome e cor, gerenciáveis na tela de Registros. */
export interface TipoRegistroDef {
  key: string
  label: string
  color: string
  /** Sigla curta (só os tipos de local usam): é ela que aparece dentro do chamado. */
  abrev?: string
}

export interface Registro {
  id: string
  ocorridoEm: string
  tipo: TipoRegistro
  solicitante?: string | null
  /** O que se lê na lista. A descrição é opcional — nem todo registro precisa de mais. */
  titulo: string
  descricao: string
  localId?: string | null
  localName?: string
  autorId?: string | null
  autorName: string
  ticketId?: string | null
  ticketCode?: string
  createdAt: string
}

export interface TicketComment {
  id: string
  ticketId: string
  authorId?: string
  authorName: string
  body: string
  createdAt: string
}

export interface Local {
  id: string
  code: string
  name: string
  city: string
  address: string
  /** Número e complemento separados da rua: é assim que o mapa e o relatório leem. */
  number: string
  complement: string
  cep: string
  phone: string
  note: string
  /** Etiqueta do local (chave de um dos `local_tipos`). Vazio = sem tipo. */
  tipo?: string
  /** Coordenadas do pino no mapa — vêm do endereço, quando ele é encontrado. */
  lat?: number | null
  lng?: number | null
  /** Controles & Tags: trabalha com lote consignado (pedido do morador abate do saldo). */
  usaLote?: boolean
  /** Itens do catálogo que o local usa, "categoria|item". Vazio = todos. */
  itensPedido?: string[]
  /** Contagens do local: em aberto agora, quantos desses já têm técnico, e o total de sempre. */
  ticketCount?: number
  ticketsAtivos?: number
  ticketsAndamento?: number
  ticketsTotal?: number
  createdAt: string
}

export interface Notification {
  id: string
  ts: string
  kind: 'ticket' | 'system'
  title: string
  body?: string
  url?: string
  read: boolean
}

export interface Role {
  id: string
  name: string
  color: string
  permissions: string[]
  system?: boolean
}

export interface User {
  id: string
  name: string
  email: string
  roleId: string
  grants: string[]
  denies: string[]
  scope: 'global' | string
  status: 'ativo' | 'inativo'
  phone?: string | null
  avatar?: string | null
  mustChangePassword?: boolean
  /** Ainda usa a senha temporária guardada — quem tem `ver_senha_temporaria` pode vê-la. */
  temSenhaTemporaria?: boolean
  password?: string // só em formulário; o servidor nunca devolve senha
  /** Eventos de notificação desligados por este usuário. Ausente = recebe. */
  notifPrefs?: Record<string, boolean>
  lastAccess?: string | null
}

/** Uma sugestão de endereço (autocomplete do cadastro de local). */
export interface SugestaoEndereco {
  descricao: string
  address: string
  city: string
  lat: number
  lng: number
}

/** Evento de notificação que o usuário pode ligar ou desligar (vem de GET /notifications/events). */
export interface EventoNotificacao {
  id: string
  label: string
}

export type LogAction = 'criar' | 'editar' | 'excluir' | 'login' | 'ver'
export type LogEntity = 'local' | 'usuario' | 'sessao' | 'chamado' | 'registro' | 'config' | 'pedido'

export interface LogEntry {
  id: string
  ts: string
  actor: string
  actorRole: string
  action: LogAction
  entity: LogEntity
  target: string
  local?: string
  detail?: string
}

/** Retorno de GET /novidades: o instante do fato mais recente de cada área. */
export interface Novidades {
  abertos: number
  andamento: number
  concluidos: number
  registros: number
}

/** Retorno de GET /stats/overview. */
export interface Overview {
  ativos: number
  emAberto: number
  naFila: number
  emAtendimento: number
  meus: number
  concluidos7d: number
  /** Concluídos dentro da janela escolhida (7, 15 ou 30 dias). */
  concluidosJanela: number
  janelaDias: number
  /** Cada número na janela atual e na anterior, do mesmo tamanho — é o que permite comparar. */
  comparativo: {
    abertos: { atual: number; anterior: number }
    concluidos: { atual: number; anterior: number }
    tempoMedio: { atual: number | null; anterior: number | null }
    minutosTrabalhados: { atual: number; anterior: number }
  }
  serie: { dia: string; abertos: number; concluidos: number }[]
  /** Situação dos chamados abertos dentro da janela — a soma é o total do período. */
  porStatus: { key: string; label: string; fase: FaseChamado; total: number }[]
  fila: Ticket[]
  ultimosRegistros: Registro[]
  /** Controles & Tags na janela e o saldo consignado de agora; `null` sem `ver_pedidos`. */
  pedidos?: { resumo: ResumoPedidos; saldos: SaldoLocal[] } | null
}

/** Retorno de GET /reports/monthly. */
export interface MonthlyReport {
  local: { id: string; name: string; code: string; city: string } | null
  periodo: { inicio: string; fim: string; mes: string }
  resumo: {
    abertos: number
    concluidos: number
    emAberto: number
    mediaHoras: number | null
    minutosTrabalhados: number
    visitas: number
    registros: number
  }
  horasPorTecnico: { nome: string; minutos: number; visitas: number; chamados: number }[]
  horasPorLocal: { nome: string; minutos: number; chamados: number }[]
  itens: { descricao: string; tipo: 'trocado' | 'comprado'; quantidade: number; valorTotal: number; chamados: string[] }[]
  registrosPorTipo: { tipo: TipoRegistro; total: number }[]
  porStatus: { key: string; label: string; fase: FaseChamado; total: number }[]
  porResponsavel: { nome: string; concluidos: number; mediaHoras: number | null }[]
  /** `emAberto` = dos abertos no mês, os que ainda estão na fila (fase aberto). */
  porLocal: { nome: string; abertos: number; emAberto: number; concluidos: number }[]
  /** Por etiqueta do local (`local_tipos`); `tipo` vazio = sem tipo. */
  porTipoLocal: { tipo: string; abertos: number; concluidos: number; locais: number }[]
  /** Controles & Tags do mês; `null` para quem não vê pedidos. */
  pedidos?: ResumoPedidos | null
  porDia: { dia: string; abertos: number; concluidos: number }[]
  lista: {
    id: string
    code: string
    title: string
    minutosNoMes: number
    itens: number
    local: string
    /** Etiqueta do local (`local_tipos`); vazio = sem tipo. */
    tipoLocal?: string
    status: string
    concluido: boolean
    abertoPor: string
    responsavel: string
    criadoEm: string
    concluidoEm: string | null
  }[]
}

/** Pedido de controle/tag: `pedido` (unidade), `manutencao` (aparelho com defeito), `lote` (o condomínio em quantidade). */
export type ModalidadePedido = 'pedido' | 'manutencao' | 'lote'
/** Catálogo: categoria (Controle) → itens (Nice New Evo), com valor opcional. */
export interface ItemCatalogo { key: string; label: string; valor: number | null }
/**
 * `tipo`: 'item' é o que se vende (controle, tag); 'manutencao' é serviço (troca de pilha).
 * `pedePortao`: vai configurado num portão (controle, tag veicular) — o pedido pergunta qual.
 */
export interface CategoriaCatalogo { key: string; label: string; color: string; tipo?: 'item' | 'manutencao'; pedePortao?: boolean; itens: ItemCatalogo[] }
/** Item do pedido — nomes e valor copiados do catálogo no dia do pedido. */
export interface ItemPedido { categoria: string; categoriaLabel: string; item: string; itemLabel: string; quantidade: number; valor: number | null }
export interface Pedido {
  id: string
  code: string
  modalidade: ModalidadePedido
  localId: string | null
  localName?: string
  apartamento: string
  bloco: string
  solicitante: string | null
  pedidoEm: string
  itens: ItemPedido[]
  seriais: string
  observacao: string
  /** Portão em que o controle / a tag veicular vai configurado. */
  portao: string
  /** Pedido de morador atendido com o que o condomínio tem consignado: abate do saldo. */
  doSaldo: boolean
  /** Manutenção: o "feito" é resolvido ou não resolvido, com o que aconteceu. */
  resultado: '' | 'resolvido' | 'nao_resolvido'
  resultadoObs: string
  /** Vazio para quem não pode ver comprovante — `qtdComprovantes` diz se existe. */
  comprovantes: string[]
  qtdComprovantes: number
  podeVerComprovante: boolean
  fotos: string[]
  pagoEm: string | null
  pagoPor: string | null
  feitoEm: string | null
  feitoPor: string | null
  entregueEm: string | null
  entreguePor: string | null
  autorId: string | null
  autorName: string
  createdAt: string
  updatedAt: string
}

/** Resumo de Controles & Tags — no relatório mensal e no relatório próprio. */
export interface ResumoPedidos {
  pedidos: number
  /** Unidades vendidas/feitas — o lote fica de fora (é consignado, conta quando o morador pede). */
  itens: number
  /** Unidades que entraram em lote (consignado) no período. */
  consignado?: number
  /** Das `itens`, quantas saíram do saldo consignado. */
  doSaldo?: number
  /** `null` = sem permissão para ver valores. */
  valor: number | null
  entregues: number
  porModalidade: Record<string, number>
  porItem: { categoria: string; categoriaLabel: string; item: string; itemLabel: string; quantidade: number; valor: number | null }[]
  porLocal: { nome: string; pedidos: number; itens: number; valor: number | null }[]
  /** Só no relatório mensal: o saldo consignado de hoje dos locais com lote. */
  saldos?: SaldoLocal[]
}
/** Saldo consignado de um local: o que entrou em lote, o que os pedidos já usaram e o que resta. */
export interface LinhaSaldo { categoria: string; categoriaLabel: string; item: string; itemLabel: string; consignado: number; usado: number; saldo: number }
export interface SaldoLocal {
  localId: string
  localName: string
  itens: LinhaSaldo[]
  consignado: number
  usado: number
  saldo: number
}
export interface RelatorioPedidos {
  periodo: { inicio: string; fim: string; mes: string }
  comValores: boolean
  resumo: ResumoPedidos
  /** Saldo de AGORA (não do período) dos locais com lote. */
  saldos?: SaldoLocal[]
  lista: Pedido[]
}
