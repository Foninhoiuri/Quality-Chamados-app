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
  { id: 'corrigir_atendimento', label: 'Corrigir atendimento e devolver chamado de outro técnico', module: 'Chamados' },
  { id: 'concluir_chamados', label: 'Concluir chamados', module: 'Chamados' },
  { id: 'reabrir_chamados', label: 'Reabrir chamados concluídos', module: 'Chamados' },
  { id: 'excluir_chamados', label: 'Excluir chamados', module: 'Chamados' },
  { id: 'anexar_fotos_chamado', label: 'Anexar fotos aos chamados', module: 'Chamados' },
  { id: 'comentar_chamados', label: 'Comentar em chamados', module: 'Chamados' },
  { id: 'gerenciar_status_chamados', label: 'Gerenciar colunas do quadro', module: 'Chamados' },
  // Registros
  { id: 'ver_registros', label: 'Ver registros (linha do tempo)', module: 'Registros' },
  { id: 'criar_registros', label: 'Criar registros', module: 'Registros' },
  { id: 'excluir_registros', label: 'Excluir registros de outras pessoas', module: 'Registros' },
  // Relatórios
  { id: 'ver_relatorios', label: 'Ver relatórios (mensal e horas)', module: 'Relatórios' },
  // Auditoria
  { id: 'ver_auditoria', label: 'Ver auditoria', module: 'Auditoria' },
  // Usuários
  { id: 'ver_usuarios', label: 'Ver usuários', module: 'Usuários' },
  { id: 'criar_usuarios', label: 'Criar usuários', module: 'Usuários' },
  { id: 'editar_usuarios', label: 'Editar usuários / redefinir senha', module: 'Usuários' },
  { id: 'desativar_usuarios', label: 'Desativar usuários', module: 'Usuários' },
  { id: 'gerenciar_papeis', label: 'Gerenciar perfis e permissões', module: 'Usuários' },
  // Administração
  { id: 'admin_sistema', label: 'Configurações de sistema', module: 'Administração' },
]

export const ALL_PERMS = PERMISSIONS.map((p) => p.id)

/**
 * Quatro perfis:
 * - Administrador: tudo, inclusive usuários, perfis e sistema (papel de sistema, id `role-admin`).
 * - Gestor: coordena a operação — todos os chamados, relatórios, locais, registros e
 *   usuários; corrige atendimentos. Não mexe em perfis/permissões nem em configuração de sistema.
 * - Técnico: pega o chamado da fila, preenche o atendimento (análise, solução, horas, itens) e conclui.
 * - Operador: atendente — abre chamado, relata, anexa foto, define local e faz registros.
 *
 * Não existe atribuição de responsável: o chamado entra na fila e o técnico pega.
 */
const SO_ADMIN = new Set(['gerenciar_papeis', 'admin_sistema'])

export const ROLES: { id: string; name: string; color: string; system?: boolean; permissions: string[] }[] = [
  { id: 'role-admin', name: 'Administrador', color: '#ef4444', system: true, permissions: [...ALL_PERMS] },
  { id: 'role-gestor', name: 'Gestor', color: '#f59e0b', permissions: ALL_PERMS.filter((p) => !SO_ADMIN.has(p)) },
  {
    id: 'role-tecnico', name: 'Técnico', color: '#38bdf8',
    permissions: [
      'ver_dashboard', 'ver_locais',
      'ver_chamados', 'ver_todos_chamados', 'gerenciar_chamados', 'aceitar_chamados', 'registrar_atendimento',
      'concluir_chamados', 'anexar_fotos_chamado', 'comentar_chamados',
      'ver_registros', 'criar_registros',
    ],
  },
  {
    id: 'role-operador', name: 'Operador', color: '#a78bfa',
    permissions: [
      'ver_dashboard', 'ver_locais',
      'ver_chamados', 'ver_todos_chamados', 'criar_chamados', 'anexar_fotos_chamado', 'comentar_chamados',
      'ver_registros', 'criar_registros',
    ],
  },
]

/** Perfis da primeira versão do app, que deixaram de existir. Usuários deles viram Operador. */
export const ROLES_ANTIGOS = ['role-solicitante', 'role-leitura']

/**
 * Sobe quando a definição dos perfis-semente muda de forma que precisa ser aplicada
 * por inteiro (não só somando permissão nova). Ver bootstrap.ts.
 */
export const ROLES_VERSAO = '3'
