import { prisma } from './db'
import { PERMISSIONS, ROLES, ROLES_ANTIGOS, ROLES_VERSAO } from './permissions-def'

/**
 * Cria permissões, perfis e configurações padrão. Roda a cada boot.
 *
 * Em regime normal só SOMA: permissão nova de uma versão nova chega aos perfis
 * declarados, e o que alguém desmarcou de propósito continua desmarcado.
 *
 * Quando `ROLES_VERSAO` muda, os perfis declarados são redefinidos por inteiro
 * (nome, cor e permissões) uma única vez, e os perfis antigos que saíram são
 * removidos — seus usuários passam para Operador.
 */
export async function ensureBaseData() {
  const jaExistiam = new Set((await prisma.permission.findMany({ select: { id: true } })).map((p) => p.id))
  const novas = new Set(PERMISSIONS.filter((p) => !jaExistiam.has(p.id)).map((p) => p.id))

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { id: p.id },
      update: { label: p.label, module: p.module },
      create: { id: p.id, label: p.label, module: p.module, system: true },
    })
  }

  // Permissão de sistema que saiu da lista (ex.: `atribuir_chamados`) é removida — a
  // caixinha não teria mais guard nenhum por trás. As personalizadas não são tocadas.
  const ids = PERMISSIONS.map((p) => p.id)
  const obsoletas = await prisma.permission.findMany({ where: { system: true, id: { notIn: ids } }, select: { id: true } })
  if (obsoletas.length) {
    await prisma.permission.deleteMany({ where: { id: { in: obsoletas.map((p) => p.id) } } })
    console.log(`[bootstrap] permissões removidas: ${obsoletas.map((p) => p.id).join(', ')}`)
  }
  await prisma.setting.deleteMany({ where: { key: 'sla_hours' } })

  const versaoAtual = (await prisma.setting.findUnique({ where: { key: 'roles_versao' } }))?.value
  const redefinir = versaoAtual !== ROLES_VERSAO

  for (const r of ROLES) {
    const existente = await prisma.role.findUnique({ where: { id: r.id }, include: { permissions: { select: { id: true } } } })
    if (!existente) {
      await prisma.role.create({
        data: { id: r.id, name: r.name, color: r.color, system: !!r.system, permissions: { connect: r.permissions.map((id) => ({ id })) } },
      })
      continue
    }
    if (redefinir) {
      await prisma.role.update({
        where: { id: r.id },
        data: { name: r.name, color: r.color, system: !!r.system, permissions: { set: r.permissions.map((id) => ({ id })) } },
      })
      console.log(`[bootstrap] perfil "${r.name}" redefinido (versão ${ROLES_VERSAO})`)
      continue
    }
    const tem = new Set(existente.permissions.map((p) => p.id))
    const candidatas = r.permissions.filter((id) => !tem.has(id))
    const faltando = r.id === 'role-admin' ? candidatas : candidatas.filter((id) => novas.has(id))
    if (faltando.length) {
      await prisma.role.update({ where: { id: r.id }, data: { permissions: { connect: faltando.map((id) => ({ id })) } } })
    }
  }

  if (redefinir) {
    for (const id of ROLES_ANTIGOS) {
      const antigo = await prisma.role.findUnique({ where: { id } })
      if (!antigo) continue
      const movidos = await prisma.user.updateMany({ where: { roleId: id }, data: { roleId: 'role-operador' } })
      await prisma.role.delete({ where: { id } })
      console.log(`[bootstrap] perfil antigo "${antigo.name}" removido; ${movidos.count} usuário(s) passaram para Operador`)
    }
    await prisma.setting.upsert({ where: { key: 'roles_versao' }, update: { value: ROLES_VERSAO }, create: { key: 'roles_versao', value: ROLES_VERSAO } })
  }

  const defaults: { key: string; value: string }[] = [
    {
      key: 'ticket_statuses',
      value: JSON.stringify([
        { key: 'aberto', label: 'Aberto', fase: 'aberto' },
        { key: 'andamento', label: 'Em atendimento', fase: 'andamento' },
        { key: 'resolvido', label: 'Concluído', done: true, fase: 'concluido' },
      ]),
    },
    {
      key: 'registro_tipos',
      value: JSON.stringify([
        { key: 'ocorrencia', label: 'Ocorrência', color: '#fbbf24' },
        { key: 'solicitacao', label: 'Solicitação', color: '#38bdf8' },
        { key: 'informacao', label: 'Informação', color: '#a1a1aa' },
      ]),
    },
  ]
  for (const s of defaults) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }
}

/** O sistema precisa de setup enquanto não existir nenhum usuário. */
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0
}
