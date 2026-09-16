// Status customizáveis: as chaves padrão são aberto/andamento/resolvido, mas dá para
// criar outras na tela de chamados; por isso o tipo é `string`.
export type TicketStatus = string

/** Definição de um status (setting `ticket_statuses`). `done` = coluna de conclusão. */
export interface TicketStatusDef {
  key: string
  label: string
  done?: boolean
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
  createdAt: string
  updatedAt: string
}

/** Ida ao local. Com início e saída o servidor calcula `minutos`; sem eles, vale o informado. */
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

export type TipoRegistro = 'ocorrencia' | 'solicitacao' | 'informacao'

export interface Registro {
  id: string
  ocorridoEm: string
  tipo: TipoRegistro
  solicitante?: string | null
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
  phone: string
  note: string
  ticketCount?: number
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
  lastAccess?: string | null
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

/** Retorno de GET /stats/overview. */
export interface Overview {
  ativos: number
  emAberto: number
  naFila: number
  emAtendimento: number
  meus: number
  concluidos7d: number
  serie14d: { dia: string; abertos: number; concluidos: number }[]
  porStatus: { key: string; label: string; total: number }[]
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
