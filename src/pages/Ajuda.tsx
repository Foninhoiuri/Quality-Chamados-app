import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronDown, ArrowRight, X, Lightbulb, CircleHelp } from 'lucide-react'
import { PageHeader, RoleBadge, EmptyState } from '@/components/ui'
import { usePerms, useCurrentRole } from '@/lib/store'
import { AJUDA, type AjudaItem, type AjudaSecao } from '@/lib/ajuda'

/** Busca sem acento e sem caixa — ninguém digita "conclusão" com til para procurar. */
const limpo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const textoDoItem = (i: AjudaItem) => [i.titulo, i.texto, i.nota ?? '', ...(i.passos ?? [])].join(' ')

/**
 * COMO FUNCIONA — o manual do app dentro do app, recortado pela permissão de quem lê.
 *
 * A dúvida do dia a dia ("o que acontece se eu pegar?", "por que o chamado sumiu daqui?")
 * não se resolve com texto de sistema: se resolve contando o que a tela faz. E contar de
 * uma função que a pessoa não tem só gera pedido de permissão que ninguém queria dar.
 */
export default function Ajuda() {
  const perms = usePerms()
  const role = useCurrentRole()
  const [q, setQ] = useState('')
  // `null` = ninguém mexeu ainda: a primeira seção abre sozinha. Depois do primeiro
  // clique a lista manda, inclusive vazia — senão a primeira seção não fecharia nunca.
  const [abertas, setAbertas] = useState<string[] | null>(null)

  const podeItem = (i: AjudaItem) =>
    (!i.perm || i.perm.some((p) => perms.has(p))) &&
    (!i.permTodas || i.permTodas.every((p) => perms.has(p)))

  const busca = limpo(q.trim())

  const secoes = useMemo(() => {
    const out: AjudaSecao[] = []
    for (const s of AJUDA) {
      if (s.perm && !s.perm.some((p) => perms.has(p))) continue
      const itens = s.itens.filter(podeItem).filter((i) => !busca || limpo(textoDoItem(i)).includes(busca))
      if (itens.length) out.push({ ...s, itens })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms, busca])

  const lista = abertas ?? (secoes[0] ? [secoes[0].id] : [])
  // Procurando, tudo fica aberto: o resultado não pode estar escondido atrás de um clique.
  const estaAberta = (id: string) => !!busca || lista.includes(id)
  const alternar = (id: string) =>
    setAbertas(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id])

  return (
    <div>
      <PageHeader
        title="Como funciona"
        subtitle="O que cada tela faz e como se usa — mostrando só o que o seu perfil pode fazer"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Procurar: horas, pegar chamado, fotos…"
            aria-label="Procurar na ajuda"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-8 text-sm text-slate-200 outline-none focus:border-red-500"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Limpar busca" className="absolute right-1.5 top-1.5 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200">
              <X size={14} />
            </button>
          )}
        </div>
        {/* O perfil explica por que o vizinho vê um tópico a mais do que você. */}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
          seu perfil: <RoleBadge name={role?.name ?? '—'} color={role?.color} />
        </span>
      </div>

      {secoes.length === 0 ? (
        <EmptyState>
          {busca ? 'Nada na ajuda com essas palavras. Tente outro termo — ou fale com um administrador.' : 'Seu perfil ainda não tem telas com ajuda escrita.'}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {secoes.map((s) => {
            const Icone = s.icone
            const aberta = estaAberta(s.id)
            return (
              <section key={s.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
                <button
                  onClick={() => alternar(s.id)}
                  aria-expanded={aberta}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-800/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                    <Icone size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-100">{s.titulo}</span>
                    <span className="block text-[12px] text-slate-500">{s.resumo}</span>
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${aberta ? 'rotate-180' : ''}`} />
                </button>

                {aberta && (
                  <div className="border-t border-slate-800 px-3 py-3 sm:px-4">
                    <div className="space-y-5">
                      {s.itens.map((i) => (
                        <article key={i.titulo}>
                          <h3 className="text-[14px] font-semibold text-slate-100">{i.titulo}</h3>
                          <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{i.texto}</p>

                          {i.passos && (
                            <ol className="mt-2 space-y-1.5">
                              {i.passos.map((p, n) => (
                                <li key={p} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-300">
                                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300">
                                    {n + 1}
                                  </span>
                                  <span className="min-w-0">{p}</span>
                                </li>
                              ))}
                            </ol>
                          )}

                          {i.nota && (
                            <p className="mt-2 flex gap-2 rounded-r-lg border-l-2 border-amber-600/50 bg-amber-500/[0.06] py-1.5 pl-2.5 pr-2 text-[12px] leading-relaxed text-amber-100/80">
                              <Lightbulb size={13} className="mt-0.5 shrink-0 text-amber-400/80" />
                              <span className="min-w-0">{i.nota}</span>
                            </p>
                          )}
                        </article>
                      ))}
                    </div>

                    {s.rota && (
                      <Link
                        to={s.rota}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[12px] text-slate-300 hover:border-slate-700 hover:bg-slate-800"
                      >
                        Abrir a tela <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Dito na cara: a ajuda ainda não cobre o app inteiro. Melhor avisar do que deixar
          a pessoa procurando Registros aqui dentro. */}
      <p className="mt-5 flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
        <CircleHelp size={14} className="mt-0.5 shrink-0 text-slate-600" />
        <span>
          Por enquanto a ajuda cobre os chamados, que é o coração do app. Registros, Locais, Relatórios e
          Usuários entram aqui em seguida. Dúvida que não estiver escrita, fale com um administrador.
        </span>
      </p>
    </div>
  )
}
