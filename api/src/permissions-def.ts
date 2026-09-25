// Fonte única das permissões e perfis-semente (usada pelo bootstrap a cada boot).
// Cada tela/ação é uma linha da matriz. Ids estáveis: os guards do servidor dependem deles.
//
// Regra da casa: permissão só entra aqui quando tem guard de verdade no servidor —
// caixinha que não muda nada engana quem administra.

export interface PermDef {
  id: string
  label: string
  module: string
}

export const PERMISSIONS: PermDef[] = [
  // Geral
  { id: 'ver_dashboard', label: 'Ver dashboard', module: 'Geral' },
  // Locais
  { id: 'ver_locais', label: 'Ver locais', module: 'Locais' },
  { id: 'gerenciar_locais', label: 'Criar e editar locais', module: 'Locais' },
  { id: 'excluir_locais', label: 'Excluir locais', module: 'Locais' },
  // Chamados
  { id: 'ver_chamados', label: 'Ver chamados', module: 'Chamados' },
  { id: 'ver_todos_chamados', label: 'Ver chamados de outras pessoas', module: 'Chamados' },
  { id: 'criar_chamados', label: 'Abrir chamados', module: 'Chamados' },
  { id: 'gerenciar_chamados', label: 'Editar e mover chamados', module: 'Chamados' },
  { id: 'aceitar_chamados', label: 'Pegar chamados sem responsável', module: 'Chamados' },
  { id: 'registrar_atendimento', label: 'Preencher o atendimento técnico', module: 'Chamados' },
  { id: 'definir_servico', label: 'Abrir chamado já dizendo o que precisa ser feito', module: 'Chamados' },
  { id: 'corrigir_atendimento', label: 'Corrigir atendimento e devolver chamado de outro técnico', module: 'Chamados' },
  { id: 'concluir_chamados', label: 'Concluir chamados', module: 'Chamados' },
  { id: 'reabrir_chamados', label: 'Reabrir chamados concluídos', module: 'Chamados' },
  { id: 'editar_concluidos', label: 'Editar chamado já concluído', module: 'Chamados' },
  { id: 'cancelar_chamados', label: 'Cancelar chamados de outras pessoas', module: 'Chamados' },
  { id: 'compartilhar_chamados', label: 'Compartilhar chamado com outro técnico', module: 'Chamados' },
  { id: 'ajustar_datas_chamado', label: 'Editar datas e horas do chamado (lançamento retroativo)', module: 'Chamados' },
  { id: 'ver_arquivados', label: 'Ver o histórico de chamados arquivados', module: 'Chamados' },
  { id: 'excluir_chamados', label: 'Excluir chamados', module: 'Chamados' },
  { id: 'anexar_fotos_chamado', label: 'Anexar fotos aos chamados', module: 'Chamados' },
  { id: 'comentar_chamados', label: 'Comentar em chamados', module: 'Chamados' },
  { id: 'gerenciar_status_chamados', label: 'Gerenciar colunas do quadro e categorias de registro', module: 'Chamados' },
  // Registros
  { id: 'ver_registros', label: 'Ver registros (linha do tempo)', module: 'Registros' },
  { id: 'criar_registros', label: 'Criar registros', module: 'Registros' },
  { id: 'excluir_registros', label: 'Excluir registros de outras pessoas', module: 'Registros' },
  // Controles & Tags (pedidos). Quem lança edita e apaga o PRÓPRIO pedido; as de baixo são
  // para mexer no dos outros.
  { id: 'ver_pedidos', label: 'Ver Controles & Tags', module: 'Controles & Tags' },
  { id: 'criar_pedidos', label: 'Lançar pedidos (e editar/apagar os próprios)', module: 'Controles & Tags' },
  { id: 'marcar_etapas_pedido', label: 'Marcar pago, feito e entregue', module: 'Controles & Tags' },
  { id: 'editar_pedidos', label: 'Editar pedidos de outras pessoas', module: 'Controles & Tags' },
  { id: 'excluir_pedidos', label: 'Excluir pedidos de outras pessoas', module: 'Controles & Tags' },
  { id: 'ver_comprovantes', label: 'Ver comprovante de pedidos de outras pessoas', module: 'Controles & Tags' },
  { id: 'ver_valores_pedido', label: 'Ver valores (no cartão, no pedido e no relatório)', module: 'Controles & Tags' },
  { id: 'gerenciar_catalogo_pedidos', label: 'Editar categorias, itens e valores', module: 'Controles & Tags' },
  // Relatórios
  { id: 'ver_relatorios', label: 'Ver relatórios (mensal e horas)', module: 'Relatórios' },
  // Auditoria
  { id: 'ver_auditoria', label: 'Ver auditoria', module: 'Auditoria' },
  // Usuários
  { id: 'ver_usuarios', label: 'Ver usuários', module: 'Usuários' },
  { id: 'criar_usuarios', label: 'Criar usuários', module: 'Usuários' },
  { id: 'editar_usuarios', label: 'Editar usuários / redefinir senha', module: 'Usuários' },
  { id: 'ver_senha_temporaria', label: 'Ver a senha temporária de quem ainda não trocou', module: 'Usuários' },
  { id: 'desativar_usuarios', label: 'Desativar usuários', module: 'Usuários' },
  { id: 'gerenciar_papeis', label: 'Gerenciar perfis e permissões', module: 'Usuários' },
  // Administração
  { id: 'admin_sistema', label: 'Configurações de sistema', module: 'Administração' },
]

export const ALL_PERMS = PERMISSIONS.map((p) => p.id)

/**
 * Quatro perfis:
 * - Administrador: tudo, inclusive usuários, perfis e sistema (papel de sistema, id `role-admin`).
 * - Gestor: ACOMPANHA a operação — vê tudo, abre chamado, comenta e cuida de relatórios,
 *   locais, registros e usuários. No chamado em si tem o mesmo alcance do Operador: não
 *   pega, não move, não atende, não conclui e não cancela chamado de ninguém.
 * - Técnico: pega o chamado da fila, preenche o atendimento (análise, solução, horas, itens),
 *   conclui, compartilha com outro técnico e lança serviço já realizado.
 * - Operador: atendente — abre chamado, relata, anexa foto, define local e faz registros.
 *
 * Não existe atribuição de responsável: o chamado entra na fila e o técnico pega.
 */
const SO_ADMIN = new Set(['gerenciar_papeis', 'admin_sistema'])

/**
 * O que o Gestor NÃO tem: tudo que é mexer no chamado. Ele acompanha e abre chamado como
 * um Operador — quem toca no atendimento é o técnico que pegou (e o administrador corrige).
 */
const FORA_DO_GESTOR = new Set([
  'gerenciar_chamados', 'aceitar_chamados', 'registrar_atendimento', 'corrigir_atendimento',
  'concluir_chamados', 'reabrir_chamados', 'excluir_chamados', 'cancelar_chamados',
  'compartilhar_chamados', 'ajustar_datas_chamado', 'gerenciar_status_chamados',
  'editar_concluidos', 'definir_servico',
])

export const ROLES: { id: string; name: string; color: string; system?: boolean; permissions: string[] }[] = [
  { id: 'role-admin', name: 'Administrador', color: '#ef4444', system: true, permissions: [...ALL_PERMS] },
  { id: 'role-gestor', name: 'Gestor', color: '#f59e0b', permissions: ALL_PERMS.filter((p) => !SO_ADMIN.has(p) && !FORA_DO_GESTOR.has(p)) },
  {
    id: 'role-tecnico', name: 'Técnico', color: '#38bdf8',
    permissions: [
      'ver_dashboard', 'ver_locais',
      'ver_chamados', 'ver_todos_chamados', 'criar_chamados', 'gerenciar_chamados', 'aceitar_chamados',
      'registrar_atendimento', 'definir_servico', 'concluir_chamados', 'compartilhar_chamados', 'anexar_fotos_chamado',
      'comentar_chamados', 'ver_arquivados',
      'ver_registros', 'criar_registros',
      'ver_pedidos', 'criar_pedidos', 'marcar_etapas_pedido', 'ver_comprovantes',
    ],
  },
  {
    id: 'role-operador', name: 'Operador', color: '#a78bfa',
    permissions: [
      'ver_dashboard', 'ver_locais',
      'ver_chamados', 'ver_todos_chamados', 'criar_chamados', 'anexar_fotos_chamado', 'comentar_chamados',
      'ver_registros', 'criar_registros',
      'ver_pedidos', 'criar_pedidos', 'ver_valores_pedido',
    ],
  },
]

/** Perfis da primeira versão do app, que deixaram de existir. Usuários deles viram Operador. */
export const ROLES_ANTIGOS = ['role-solicitante', 'role-leitura']

/**
 * Sobe quando a definição dos perfis-semente muda de forma que precisa ser aplicada
 * por inteiro (não só somando permissão nova). Ver bootstrap.ts.
 */
export const ROLES_VERSAO = '6'
