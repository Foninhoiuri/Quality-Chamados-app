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
  donePhotos?: string[]
  // atendimento técnico
  analise?: string | null
  possivelSolucao?: string | null
  solucao?: string | null
  acoesTomadas?: string | null
  visitas?: Visita[]
  itens?: ItemAtendimento[]
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
  data: string // YYYY-MM-DD
  inicio?: string | null // HH:MM
  fim?: string | null // HH:MM
  minutos: number
  tecnicoId?: string | null
  tecnicoNome?: string
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
  cep: string
  phone: string
  note: string
  /** Coordenadas do pino no mapa — vêm do endereço, quando ele é encontrado. */
  lat?: number | null
  lng?: number | null
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

export type LogAction = 'criar' | 'editar' | 'excluir' | 'login'
export type LogEntity = 'local' | 'usuario' | 'sessao' | 'chamado' | 'registro' | 'config'

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
  porStatus: { label: string; total: number }[]
  porResponsavel: { nome: string; concluidos: number; mediaHoras: number | null }[]
  porLocal: { nome: string; abertos: number; emAberto: number }[]
  porDia: { dia: string; abertos: number; concluidos: number }[]
  lista: {
    id: string
    code: string
    title: string
    minutosNoMes: number
    itens: number
    local: string
    status: string
    concluido: boolean
    abertoPor: string
    responsavel: string
    criadoEm: string
    concluidoEm: string | null
  }[]
}
