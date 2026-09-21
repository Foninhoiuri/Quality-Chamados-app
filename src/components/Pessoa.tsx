import { useStore } from '@/lib/store'
import { assetUrl } from '@/lib/api'
import { cn, iniciais } from '@/lib/utils'

/**
 * O rosto de quem fez a coisa. Se a pessoa subiu foto, é a foto que aparece — em qualquer
 * lugar do app, não só no próprio perfil: comentário, técnico do chamado, quem está junto.
 * Sem foto, as iniciais.
 *
 * O nome é o que sempre existe (um chamado antigo guarda o nome de quem já saiu da
 * empresa); o `id` é só o atalho para achar a foto.
 */
export function AvatarPessoa({ nome, id, size = 20, className }: {
  nome: string
  id?: string | null
  size?: number
  className?: string
}) {
  const foto = useStore((s) => (id ? s.pessoas.find((p) => p.id === id)?.avatar : null))
  const estilo = { width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)) }

  if (foto) {
    return <img src={assetUrl(foto)} alt={nome} title={nome} style={estilo} className={cn('shrink-0 rounded-full object-cover', className)} />
  }
  return (
    <span
      title={nome}
      style={estilo}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-slate-700 font-semibold text-slate-100', className)}
    >
      {iniciais(nome)}
    </span>
  )
}

/** Foto + nome, do jeito que aparece na maioria das telas. */
export function Pessoa({ nome, id, size = 18, className }: { nome: string; id?: string | null; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <AvatarPessoa nome={nome} id={id} size={size} />
      <span className="truncate">{nome}</span>
    </span>
  )
}
