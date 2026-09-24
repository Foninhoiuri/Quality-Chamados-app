import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmtMinutos } from './utils'
import { tipoRegistroDe } from './registros'
import type { MonthlyReport, TipoRegistroDef } from './types'

/**
 * O relatório do mês como um arquivo só, para mandar para quem não usa o sistema.
 * É o documento inteiro em PDF — capa com os números, horas por técnico e por local,
 * material usado e a lista dos chamados — não uma foto da tela.
 */

const VERMELHO: [number, number, number] = [220, 38, 38]
const GRAFITE: [number, number, number] = [30, 41, 59]
const CINZA: [number, number, number] = [100, 116, 139]

const MARGEM = 14
const dataBr = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

export function baixarRelatorioPdf(d: MonthlyReport, nomeMes: string, tiposRegistro: TipoRegistroDef[], tiposLocal: TipoRegistroDef[] = []) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const r = d.resumo

  // ---- cabeçalho ----
  doc.setFillColor(...VERMELHO)
  doc.rect(0, 0, largura, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(15)
  doc.text('Relatório mensal de chamados', MARGEM, 12)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(`Aexecutiva · Quality Work — ${nomeMes}${d.local ? ` · ${d.local.name}` : ' · todos os locais'}`, MARGEM, 19)
  doc.setFontSize(8)
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, largura - MARGEM, 19, { align: 'right' })

  // ---- o mês em números ----
  const kpis: [string, string][] = [
    ['Chamados abertos', String(r.abertos)],
    ['Concluídos', String(r.concluidos)],
    ['Ainda em aberto', String(r.emAberto)],
    ['Horas trabalhadas', fmtMinutos(r.minutosTrabalhados)],
    ['Tempo médio', r.mediaHoras == null ? '—' : `${r.mediaHoras} h`],
    ['Idas ao local', String(r.visitas)],
    ['Registros', String(r.registros)],
    ['Itens usados', String(d.itens.reduce((s, i) => s + i.quantidade, 0))],
  ]
  const colunas = 4
  const larguraCaixa = (largura - MARGEM * 2 - 3 * (colunas - 1)) / colunas
  let y = 34
  kpis.forEach(([label, valor], i) => {
    const col = i % colunas
    const linha = Math.floor(i / colunas)
    const x = MARGEM + col * (larguraCaixa + 3)
    const topo = y + linha * 21
    doc.setDrawColor(226, 232, 240).setFillColor(248, 250, 252)
    doc.roundedRect(x, topo, larguraCaixa, 18, 1.5, 1.5, 'FD')
    doc.setTextColor(...CINZA).setFont('helvetica', 'normal').setFontSize(7.5)
    doc.text(label.toUpperCase(), x + 3, topo + 6)
    doc.setTextColor(...GRAFITE).setFont('helvetica', 'bold').setFontSize(13)
    doc.text(valor, x + 3, topo + 14)
  })
  y += Math.ceil(kpis.length / colunas) * 21 + 4

  const tabela = (head: string[], body: (string | number)[][], vazio = 'Nada no período.') => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length ? body : [[{ content: vazio, colSpan: head.length, styles: { textColor: CINZA, halign: 'center' } }]],
      margin: { left: MARGEM, right: MARGEM },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: GRAFITE },
      headStyles: { fillColor: GRAFITE, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    } as any)
    y = (doc as any).lastAutoTable.finalY + 8
  }

  /** Título de seção, com quebra de página quando não sobra espaço para ele e a tabela. */
  const secao = (texto: string) => {
    if (y > doc.internal.pageSize.getHeight() - 45) { doc.addPage(); y = 20 }
    doc.setTextColor(...GRAFITE).setFont('helvetica', 'bold').setFontSize(10.5)
    doc.text(texto, MARGEM, y)
    y += 4
  }

  secao('Horas trabalhadas por técnico')
  tabela(['Técnico', 'Horas', 'Idas', 'Chamados'],
    d.horasPorTecnico.map((h) => [h.nome, fmtMinutos(h.minutos), h.visitas, h.chamados]),
    'Nenhuma hora registrada no período.')

  if (d.horasPorLocal.length > 1) {
    secao('Horas por local')
    tabela(['Local', 'Horas', 'Chamados'], d.horasPorLocal.map((l) => [l.nome, fmtMinutos(l.minutos), l.chamados]))
  }

  secao('Concluídos por técnico')
  tabela(['Técnico', 'Concluídos', 'Tempo médio'],
    d.porResponsavel.map((p) => [p.nome, p.concluidos, p.mediaHoras == null ? '—' : `${p.mediaHoras} h`]),
    'Nenhum chamado concluído no período.')

  if (d.porLocal.length) {
    secao('Chamados por local')
    tabela(['Local', 'Abertos no mês', 'Concluídos no mês', 'Ainda em aberto'], d.porLocal.map((l) => [l.nome, l.abertos, l.concluidos ?? 0, l.emAberto]))
  }

  if (d.porTipoLocal?.some((x) => x.tipo)) {
    secao('Chamados por tipo de local')
    const nomeTipo = (k: string) => (k ? tiposLocal.find((t) => t.key === k)?.label ?? k : 'Sem tipo')
    tabela(['Tipo de local', 'Abertos no mês', 'Concluídos no mês', 'Locais'],
      d.porTipoLocal.map((x) => [nomeTipo(x.tipo), x.abertos, x.concluidos, x.locais]))
  }

  secao('Itens trocados e comprados')
  tabela(['Item', 'Tipo', 'Qtd.', 'Valor'],
    d.itens.map((i) => [
      i.descricao,
      i.tipo === 'comprado' ? 'Comprado' : 'Trocado',
      i.quantidade.toLocaleString('pt-BR'),
      i.valorTotal ? `R$ ${i.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—',
    ]),
    'Nenhum item registrado.')

  if (d.registrosPorTipo.some((x) => x.total)) {
    secao('Registros do mês')
    tabela(['Categoria', 'Quantidade'],
      d.registrosPorTipo.filter((x) => x.total).map((x) => [tipoRegistroDe(tiposRegistro, x.tipo).label, x.total]))
  }

  doc.addPage()
  y = 20
  secao(`Chamados do período (${d.lista.length})`)
  tabela(['Código', 'Chamado', 'Local', 'Status', 'Técnico', 'Aberto', 'Concluído', 'Horas'],
    d.lista.map((t) => [
      t.code, t.title, t.local || '—', t.status, t.responsavel || '—',
      dataBr(t.criadoEm), t.concluidoEm ? dataBr(t.concluidoEm) : '—',
      t.minutosNoMes ? fmtMinutos(t.minutosNoMes) : '—',
    ]),
    'Nenhum chamado neste período.')

  // ---- rodapé com a numeração (só agora se sabe quantas páginas são) ----
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    const alturaPagina = doc.internal.pageSize.getHeight()
    doc.setDrawColor(226, 232, 240)
    doc.line(MARGEM, alturaPagina - 12, largura - MARGEM, alturaPagina - 12)
    doc.setTextColor(...CINZA).setFont('helvetica', 'normal').setFontSize(7.5)
    doc.text(`Aexecutiva · Quality Work — chamados de ${nomeMes}`, MARGEM, alturaPagina - 7)
    doc.text(`${p} de ${paginas}`, largura - MARGEM, alturaPagina - 7, { align: 'right' })
  }

  doc.save(`relatorio-chamados-${d.periodo.mes}${d.local ? `-${d.local.code}` : ''}.pdf`)
}
