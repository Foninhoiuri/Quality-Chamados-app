import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RelatorioPedidos } from './types'

/**
 * O relatório de Controles & Tags em PDF, no mesmo desenho do relatório mensal de
 * chamados: os números do mês na capa, por item, por local e a lista dos pedidos.
 */

const VERMELHO: [number, number, number] = [220, 38, 38]
const GRAFITE: [number, number, number] = [30, 41, 59]
const CINZA: [number, number, number] = [100, 116, 139]
const MARGEM = 14
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const MODALIDADE: Record<string, string> = { pedido: 'Pedido', manutencao: 'Manutenção', lote: 'Lote' }

export function baixarPedidosPdf(d: RelatorioPedidos, nomeMes: string, nomeLocal?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const r = d.resumo
  const cv = d.comValores && r.valor !== null

  doc.setFillColor(...VERMELHO)
  doc.rect(0, 0, largura, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(15)
  doc.text('Controles & Tags', MARGEM, 12)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(`Aexecutiva · Quality Work — ${nomeMes} · ${nomeLocal ?? 'todos os locais'}`, MARGEM, 19)
  doc.setFontSize(8)
  doc.text(`Emitido em ${dataHora(new Date().toISOString())}`, largura - MARGEM, 19, { align: 'right' })

  const kpis: [string, string][] = [
    ['Pedidos', String(r.pedidos)],
    ['Itens', String(r.itens)],
    ['Entregues', String(r.entregues)],
    ...(cv ? [['Valor total', brl(r.valor ?? 0)] as [string, string]] : []),
  ]
  const colunas = 4
  const larguraCaixa = (largura - MARGEM * 2 - 3 * (colunas - 1)) / colunas
  let y = 34
  kpis.forEach(([label, valor], i) => {
    const x = MARGEM + i * (larguraCaixa + 3)
    doc.setDrawColor(226, 232, 240).setFillColor(248, 250, 252)
    doc.roundedRect(x, y, larguraCaixa, 18, 1.5, 1.5, 'FD')
    doc.setTextColor(...CINZA).setFont('helvetica', 'normal').setFontSize(7.5)
    doc.text(label.toUpperCase(), x + 3, y + 6)
    doc.setTextColor(...GRAFITE).setFont('helvetica', 'bold').setFontSize(13)
    doc.text(valor, x + 3, y + 14)
  })
  y += 25

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
  const secao = (texto: string) => {
    if (y > doc.internal.pageSize.getHeight() - 45) { doc.addPage(); y = 20 }
    doc.setTextColor(...GRAFITE).setFont('helvetica', 'bold').setFontSize(10.5)
    doc.text(texto, MARGEM, y)
    y += 4
  }

  secao('Por tipo de item')
  tabela(cv ? ['Categoria', 'Item', 'Qtd.', 'Valor'] : ['Categoria', 'Item', 'Qtd.'],
    r.porItem.map((i) => [i.categoriaLabel, i.itemLabel, i.quantidade, ...(cv ? [i.valor ? brl(i.valor) : '—'] : [])]))

  secao('Por local')
  tabela(cv ? ['Local', 'Pedidos', 'Itens', 'Valor'] : ['Local', 'Pedidos', 'Itens'], [
    ...r.porLocal.map((l) => [l.nome, l.pedidos, l.itens, ...(cv ? [l.valor ? brl(l.valor) : '—'] : [])]),
    ['Total', r.pedidos, r.itens, ...(cv ? [brl(r.valor ?? 0)] : [])],
  ])

  secao(`Pedidos do mês (${d.lista.length})`)
  tabela(
    ['Pedido', 'Onde', 'Itens', ...(cv ? ['Valor'] : []), 'Pago', 'Feito', 'Entregue'],
    d.lista.map((p) => {
      const total = p.itens.reduce((s, i) => s + (i.valor ?? 0) * i.quantidade, 0)
      return [
        `${p.code}\n${MODALIDADE[p.modalidade] ?? p.modalidade}\n${dataHora(p.pedidoEm)}`,
        [p.localName ?? '—', p.bloco && `Bloco ${p.bloco}`, p.apartamento && `Apto ${p.apartamento}`].filter(Boolean).join(' · ') + (p.solicitante ? `\n${p.solicitante}` : ''),
        p.itens.map((i) => `${i.quantidade}× ${i.itemLabel}`).join('\n') + (p.seriais ? `\nSN ${p.seriais.split('\n').filter(Boolean).join(', ')}` : ''),
        ...(cv ? [total ? brl(total) : '—'] : []),
        dataHora(p.pagoEm), dataHora(p.feitoEm), dataHora(p.entregueEm),
      ]
    }),
    'Nenhum pedido neste mês.',
  )

  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    const altura = doc.internal.pageSize.getHeight()
    doc.setDrawColor(226, 232, 240)
    doc.line(MARGEM, altura - 12, largura - MARGEM, altura - 12)
    doc.setTextColor(...CINZA).setFont('helvetica', 'normal').setFontSize(7.5)
    doc.text(`Aexecutiva · Quality Work — Controles & Tags de ${nomeMes}`, MARGEM, altura - 7)
    doc.text(`${p} de ${paginas}`, largura - MARGEM, altura - 7, { align: 'right' })
  }

  doc.save(`controles-e-tags-${d.periodo.mes}.pdf`)
}
