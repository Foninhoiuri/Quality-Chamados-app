/**
 * Estilo dos gráficos (Recharts). As cores vêm das variáveis do tema em index.css,
 * então grade, eixos e tooltip acompanham claro/escuro.
 *
 * O Recharts não herda a cor do `contentStyle` para o rótulo nem para os itens —
 * sem dizer à mão, o rótulo sai preto no fundo escuro.
 */
export const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--color-slate-200)',
  fontSize: 12,
}
export const tooltipLabel = { color: 'var(--color-slate-100)', fontWeight: 600, marginBottom: 2 }
export const tooltipItem = { color: 'var(--color-slate-200)' }
export const axisTick = { fill: 'var(--chart-tick)', fontSize: 11 }
export const gridStroke = 'var(--chart-grid)'

/**
 * Abertos x concluídos — as duas séries usadas no dashboard e no relatório. As cores são
 * variáveis: o verde e o azul do tema escuro desaparecem sobre o branco do tema claro.
 */
export const SERIE = {
  abertos: { label: 'Abertos', color: 'var(--serie-abertos)' },
  concluidos: { label: 'Concluídos', color: 'var(--serie-concluidos)' },
}

/** Cores das colunas de "em andamento" no anel do dashboard. */
export const CORES_ANDAMENTO = [
  'var(--serie-andamento-1)',
  'var(--serie-andamento-2)',
  'var(--serie-andamento-3)',
  'var(--serie-andamento-4)',
]
