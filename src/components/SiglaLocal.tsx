import { useStore } from '@/lib/store'
import { parseTiposLocal, siglaDoTipo, tipoLocalDe } from '@/lib/locais'
import { cn } from '@/lib/utils'

/**
 * O TIPO DO LOCAL dentro do chamado, em sigla: "COND", "COM", "OBRA". No cadastro cabe o
 * nome inteiro; na linha do cartão, ao lado do nome do prédio, não — e saber que tipo de
 * lugar é muda o que o técnico leva na van.
 */
export function SiglaLocal({ localId, className }: { localId?: string | null; className?: string }) {
  const local = useStore((s) => (localId ? s.locais.find((x) => x.id === localId) : undefined))
  const settings = useStore((s) => s.settings)
  const tipo = local?.tipo ? tipoLocalDe(parseTiposLocal(settings), local.tipo) : null
  if (!tipo) return null
  return (
    <span
      title={tipo.label}
      style={{ color: tipo.color, background: `${tipo.color}1e` }}
      className={cn('shrink-0 rounded px-1 py-px text-[9px] font-semibold tracking-wide', className)}
    >
      {siglaDoTipo(tipo)}
    </span>
  )
}
