import { tipoLocalDe } from './locais'
import { fmtDataHora } from './utils'
import type { MonthlyReport, TipoRegistroDef } from './types'

/** CSV com `;` (abre direto no Excel em pt-BR) e BOM para os acentos. */
export function baixarCsv(dados: MonthlyReport, tiposLocal: TipoRegistroDef[]) {
  const cab = ['Código', 'Título', 'Local', 'Tipo de local', 'Status', 'Aberto por', 'Técnico', 'Aberto em', 'Concluído em', 'Horas no mês']
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linhas = dados.lista.map((t) => [
    t.code, t.title, t.local, tipoLocalDe(tiposLocal, t.tipoLocal)?.label ?? '', t.status, t.abertoPor, t.responsavel,
    fmtDataHora(t.criadoEm), t.concluidoEm ? fmtDataHora(t.concluidoEm) : '',
    t.minutosNoMes ? (t.minutosNoMes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '',
  ].map(esc).join(';'))
  const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chamados-${dados.periodo.mes}${dados.local ? `-${dados.local.code}` : ''}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

