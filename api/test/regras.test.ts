import { beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

/**
 * As regras que não podem quebrar sem ninguém perceber.
 *
 * Não é teste de tela: sobe a API de verdade e fala com ela por `inject`, passando pelos
 * mesmos guards de permissão. Cada caso aqui nasceu de uma decisão de produto que já foi
 * discutida — se um deles ficar vermelho, é porque a regra mudou (ou quebrou).
 */

let app: FastifyInstance
let prisma: any

/** Cria a pessoa direto no banco e devolve o token dela — sem passar pela tela. */
async function entrar(nome: string, email: string, roleId: string, senha = 'senha-de-teste') {
  await prisma.user.upsert({
    where: { email },
    update: { roleId, status: 'ativo', passwordHash: bcrypt.hashSync(senha, 10), mustChangePassword: false },
    create: { name: nome, email, roleId, passwordHash: bcrypt.hashSync(senha, 10), mustChangePassword: false },
  })
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: senha } })
  expect(res.statusCode, `login de ${email}`).toBe(200)
  return res.json().token as string
}

const comToken = (token: string) => ({ authorization: `Bearer ${token}` })

let admin: string
let tecnico: string
let gestor: string
let operador: string
let idTecnico: string
let idTecnico2: string
let tecnico2: string

beforeAll(async () => {
  const mod = await import('../src/server')
  app = mod.app as FastifyInstance
  await app.ready()
  await mod.prepararDados()
  prisma = (await import('../src/db')).prisma

  admin = await entrar('Admin Teste', 'admin@teste.local', 'role-admin')
  tecnico = await entrar('Tec Um', 'tec1@teste.local', 'role-tecnico')
  tecnico2 = await entrar('Tec Dois', 'tec2@teste.local', 'role-tecnico')
  gestor = await entrar('Gestor Teste', 'gestor@teste.local', 'role-gestor')
  operador = await entrar('Operador Teste', 'op@teste.local', 'role-operador')
  idTecnico = (await prisma.user.findUnique({ where: { email: 'tec1@teste.local' } })).id
  idTecnico2 = (await prisma.user.findUnique({ where: { email: 'tec2@teste.local' } })).id
})

/** Abre um chamado e devolve o corpo dele. */
async function abrirChamado(token: string, titulo: string, extra: Record<string, unknown> = {}) {
  const res = await app.inject({ method: 'POST', url: '/tickets', headers: comToken(token), payload: { title: titulo, ...extra } })
  expect(res.statusCode, `abrir "${titulo}"`).toBe(200)
  return res.json()
}

const chaveConcluido = async () => {
  const s = await prisma.setting.findUnique({ where: { key: 'ticket_statuses' } })
  const lista = JSON.parse(s.value)
  return (lista.find((x: any) => x.done) ?? lista[lista.length - 1]).key
}

describe('senha de usuário', () => {
  it('a senha temporária gerada ao criar o usuário entra no login', async () => {
    // Regressão: `String(b.password ?? temp)` deixava passar string vazia e o usuário
    // nascia com hash de senha vazia — a senha mostrada na tela nunca funcionava.
    const criado = await app.inject({
      method: 'POST',
      url: '/users',
      headers: comToken(admin),
      payload: { name: 'Novo Alguém', email: 'novo@teste.local', roleId: 'role-operador', password: '' },
    })
    expect(criado.statusCode).toBe(200)
    const { tempPassword } = criado.json()
    expect(tempPassword, 'o servidor precisa devolver a senha temporária').toBeTruthy()

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'novo@teste.local', password: tempPassword } })
    expect(login.statusCode, 'entrar com a senha temporária').toBe(200)
    expect(login.json().user.mustChangePassword, 'primeiro acesso troca a senha').toBe(true)
  })

  it('senha escolhida por quem cadastra vale, e sem troca obrigatória quando se pede', async () => {
    const criado = await app.inject({
      method: 'POST',
      url: '/users',
      headers: comToken(admin),
      payload: { name: 'Com Senha', email: 'comsenha@teste.local', roleId: 'role-operador', password: 'senha-escolhida', mustChangePassword: false },
    })
    expect(criado.statusCode).toBe(200)
    expect(criado.json().tempPassword, 'com senha escolhida não há temporária').toBeNull()

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'comsenha@teste.local', password: 'senha-escolhida' } })
    expect(login.statusCode).toBe(200)
    expect(login.json().user.mustChangePassword).toBe(false)
  })
})

describe('conclusão do chamado', () => {
  it('não conclui sem solução preenchida e conclui depois dela', async () => {
    const t = await abrirChamado(operador, 'Portão travado')
    await app.inject({ method: 'POST', url: `/tickets/${t.id}/accept`, headers: comToken(tecnico) })
    const done = await chaveConcluido()

    const semSolucao = await app.inject({ method: 'PATCH', url: `/tickets/${t.id}`, headers: comToken(tecnico), payload: { status: done } })
    expect(semSolucao.statusCode, 'concluir sem solução tem de ser recusado').toBe(400)

    await app.inject({ method: 'PATCH', url: `/tickets/${t.id}/atendimento`, headers: comToken(tecnico), payload: { solucao: 'Trocada a placa do motor' } })
    const comSolucao = await app.inject({ method: 'PATCH', url: `/tickets/${t.id}`, headers: comToken(tecnico), payload: { status: done } })
    expect(comSolucao.statusCode, 'com solução, conclui').toBe(200)
  })

  it('chamado concluído só é editado por quem tem editar_concluidos', async () => {
    const t = await abrirChamado(operador, 'Interfone mudo')
    await app.inject({ method: 'POST', url: `/tickets/${t.id}/accept`, headers: comToken(tecnico) })
    await app.inject({ method: 'PATCH', url: `/tickets/${t.id}/atendimento`, headers: comToken(tecnico), payload: { solucao: 'Fonte trocada' } })
    await app.inject({ method: 'PATCH', url: `/tickets/${t.id}`, headers: comToken(tecnico), payload: { status: await chaveConcluido() } })

    const peloTecnico = await app.inject({ method: 'PATCH', url: `/tickets/${t.id}`, headers: comToken(tecnico), payload: { title: 'Outro título' } })
    expect(peloTecnico.statusCode, 'técnico não edita concluído').toBe(403)

    const peloAdmin = await app.inject({ method: 'PATCH', url: `/tickets/${t.id}`, headers: comToken(admin), payload: { title: 'Título corrigido' } })
    expect(peloAdmin.statusCode, 'administrador edita concluído').toBe(200)
    expect(peloAdmin.json().title).toBe('Título corrigido')
  })
})

describe('papel do gestor', () => {
  it('gestor vê e abre chamado, mas não pega nem atende', async () => {
    const t = await abrirChamado(gestor, 'Câmera fora do ar')
    expect(t.code, 'gestor abre chamado').toBeTruthy()

    const pegando = await app.inject({ method: 'POST', url: `/tickets/${t.id}/accept`, headers: comToken(gestor) })
    expect(pegando.statusCode, 'gestor não pega chamado').toBe(403)

    const atendendo = await app.inject({ method: 'PATCH', url: `/tickets/${t.id}/atendimento`, headers: comToken(gestor), payload: { solucao: 'x' } })
    expect(atendendo.statusCode, 'gestor não preenche atendimento').toBe(403)
  })
})

describe('cancelamento', () => {
  it('chamado cancelado some das listas e do relatório, e fica na auditoria', async () => {
    const t = await abrirChamado(operador, 'Aberto por engano')
    const cancelado = await app.inject({
      method: 'POST',
      url: `/tickets/${t.id}/cancel`,
      headers: comToken(admin),
      payload: { motivo: 'duplicado' },
    })
    expect(cancelado.statusCode).toBe(200)

    const lista = await app.inject({ method: 'GET', url: '/tickets', headers: comToken(admin) })
    expect(lista.json().some((x: any) => x.id === t.id), 'cancelado não aparece na lista').toBe(false)

    const mes = new Date().toISOString().slice(0, 7)
    const relatorio = await app.inject({ method: 'GET', url: `/reports/monthly?month=${mes}`, headers: comToken(admin) })
    expect(relatorio.json().lista.some((x: any) => x.id === t.id), 'cancelado não entra no relatório').toBe(false)

    const auditoria = await app.inject({ method: 'GET', url: '/audit', headers: comToken(admin) })
    const linha = auditoria.json().find((l: any) => (l.detail ?? '').includes(t.code) && l.action === 'excluir')
    expect(linha, 'o cancelamento fica registrado na auditoria').toBeTruthy()
    expect(linha.detail).toContain('duplicado')
  })
})

describe('horas trabalhadas', () => {
  it('chamado compartilhado soma as idas sem contar duas vezes', async () => {
    const t = await abrirChamado(operador, 'Troca de nobreak')
    await app.inject({ method: 'POST', url: `/tickets/${t.id}/accept`, headers: comToken(tecnico) })
    await app.inject({ method: 'POST', url: `/tickets/${t.id}/share`, headers: comToken(tecnico), payload: { userIds: [idTecnico2] } })

    const hoje = new Date().toISOString().slice(0, 10)
    const salvo = await app.inject({
      method: 'PATCH',
      url: `/tickets/${t.id}/atendimento`,
      headers: comToken(tecnico),
      payload: {
        solucao: 'Nobreak trocado',
        visitas: [
          { data: hoje, minutos: 120, tecnicoId: idTecnico },
          { data: hoje, minutos: 90, tecnicoId: idTecnico2 },
        ],
      },
    })
    expect(salvo.statusCode).toBe(200)
    expect(salvo.json().minutosTotais, 'o total é a soma das idas').toBe(210)

    const mes = new Date().toISOString().slice(0, 7)
    const relatorio = (await app.inject({ method: 'GET', url: `/reports/monthly?month=${mes}`, headers: comToken(admin) })).json()
    const porTecnico = Object.fromEntries(relatorio.horasPorTecnico.map((h: any) => [h.nome, h.minutos]))
    expect(porTecnico['Tec Um'], 'cada técnico com as horas dele').toBe(120)
    expect(porTecnico['Tec Dois']).toBe(90)

    const somaIndividual = relatorio.horasPorTecnico.reduce((s: number, h: any) => s + h.minutos, 0)
    expect(relatorio.resumo.minutosTrabalhados, 'total = soma dos individuais (sem duplicar)').toBe(somaIndividual)
  })

  it('ida em andamento (chegou e ainda não saiu) vale zero até a saída ser marcada', async () => {
    const t = await abrirChamado(operador, 'Ronda preventiva')
    await app.inject({ method: 'POST', url: `/tickets/${t.id}/accept`, headers: comToken(tecnico) })
    const hoje = new Date().toISOString().slice(0, 10)

    const chegada = await app.inject({
      method: 'PATCH',
      url: `/tickets/${t.id}/atendimento`,
      headers: comToken(tecnico),
      payload: { visitas: [{ data: hoje, inicio: '08:00', fim: null, minutos: 0 }] },
    })
    expect(chegada.statusCode, 'chegada sem saída é aceita').toBe(200)
    expect(chegada.json().minutosTotais).toBe(0)

    const saida = await app.inject({
      method: 'PATCH',
      url: `/tickets/${t.id}/atendimento`,
      headers: comToken(tecnico),
      payload: { visitas: [{ ...chegada.json().visitas[0], fim: '09:30' }] },
    })
    expect(saida.json().minutosTotais, 'fechada a ida, contam os 90 minutos').toBe(90)
  })
})

describe('escopo e visibilidade', () => {
  it('operador não enxerga o histórico sem a permissão', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets?history=1', headers: comToken(operador) })
    expect(res.statusCode).toBe(403)
  })

  it('sem token não se lê nada', async () => {
    const res = await app.inject({ method: 'GET', url: '/tickets' })
    expect(res.statusCode).toBe(401)
  })
})
