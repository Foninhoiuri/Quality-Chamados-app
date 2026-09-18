import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { tipoRegistroDe } from './registros'
import type { Registro, TipoRegistroDef } from './types'

/**
 * Exportação dos REGISTROS, separada do relatório de chamados. Registro é outra coisa:
 * é o que foi pedido, avisado ou aconteceu — e quem recebe essa lista quer ler isso, não
 * horas de atendimento.
 */

const VERMELHO: [number, number, number] = [220, 38, 38]
const GRAFITE: [number, number, number] = [30, 41, 59]
const CINZA: [number, number, number] = [100, 116, 139]
const MARGEM = 14

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export function baixarRegistrosPdf(itens: Registro[], periodo: string, tipos: TipoRegistroDef[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()

  doc.setFillColor(...VERMELHO)
  doc.rect(0, 0, largura, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(14)
  doc.text('Registros', MARGEM, 11)
  doc.setFont('helvetica', 'normal').setFontSize(9.5)
  doc.text(`Aexecutiva · Quality Work — ${periodo}`, MARGEM, 18)
  doc.setFontSize(8)
  doc.text(`${itens.length} registro(s) · emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, largura - MARGEM, 18, { align: 'right' })

  // Resumo por categoria: a primeira coisa que se pergunta é "de que tipo foram".
  const porTipo = new Map<string, number>()
  for (const r of itens) porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? 0) + 1)

  autoTable(doc, {
    startY: 30,
    head: [['Categoria', 'Quantidade']],
    body: [...porTipo.entries()].map(([k, n]) => [tipoRegistroDe(tipos, k).label, n]),
    margin: { left: MARGEM, right: MARGEM },
    tableWidth: 80,
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: GRAFITE },
    headStyles: { fillColor: GRAFITE, textColor: 255, fontSize: 8 },
  } as any)

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [['Quando', 'Categoria', 'Registro', 'Solicitante', 'Local', 'Registrado por']],
    body: itens.length
      ? itens.map((r) => [
          dataHora(r.ocorridoEm),
          tipoRegistroDe(tipos, r.tipo).label,
          r.descricao ? `${r.titulo}\n${r.descricao}` : r.titulo,
          r.solicitante || '—',
          r.localName || '—',
          r.autorName,
        ])
      : [[{ content: 'Nenhum registro no período.', colSpan: 6, styles: { textColor: CINZA, halign: 'center' } }]],
    margin: { left: MARGEM, right: MARGEM },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: GRAFITE, valign: 'top' },
    headStyles: { fillColor: GRAFITE, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 22 }, 3: { cellWidth: 28 }, 4: { cellWidth: 28 }, 5: { cellWidth: 26 } },
  } as any)

  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    const altura = doc.internal.pageSize.getHeight()
    doc.setDrawColor(226, 232, 240)
    doc.line(MARGEM, altura - 12, largura - MARGEM, altura - 12)
    doc.setTextColor(...CINZA).setFont('helvetica', 'normal').setFontSize(7.5)
    doc.text(`Aexecutiva · Quality Work — registros (${periodo})`, MARGEM, altura - 7)
    doc.text(`${p} de ${paginas}`, largura - MARGEM, altura - 7, { align: 'right' })
  }

  doc.save(`registros-${new Date().toISOString().slice(0, 10)}.pdf`)
}

/** CSV com `;` (abre direto no Excel em pt-BR) e BOM para os acentos. */
export function baixarRegistrosCsv(itens: Registro[], tipos: TipoRegistroDef[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cab = ['Quando', 'Categoria', 'Título', 'Descrição', 'Solicitante', 'Local', 'Registrado por', 'Virou chamado']
  const linhas = itens.map((r) => [
    dataHora(r.ocorridoEm), tipoRegistroDe(tipos, r.tipo).label, r.titulo, r.descricao,
    r.solicitante ?? '', r.localName ?? '', r.autorName, r.ticketCode ?? '',
  ].map(esc).join(';'))
  const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `registros-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
