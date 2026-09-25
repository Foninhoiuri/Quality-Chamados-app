import { useEffect, useMemo, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { Card, PageHeader, RoleBadge, Select } from '@/components/ui'
import { useStore } from '@/lib/store'
import { fmtDataHora } from '@/lib/utils'
import type { LogAction, LogEntity } from '@/lib/types'

const ACTION: Record<LogAction, { label: string; color: string }> = {
  criar: { label: 'Criou', color: '#34d399' },
  editar: { label: 'Editou', color: '#fbbf24' },
  excluir: { label: 'Excluiu', color: '#f87171' },
  login: { label: 'Sessão', color: '#a78bfa' },
  ver: { label: 'Consultou', color: '#38bdf8' },
}
const ENTITY: Record<LogEntity, string> = {
  chamado: 'Chamado',
  registro: 'Registro',
  local: 'Local',
  usuario: 'Usuário',
  sessao: 'Sessão',
  config: 'Configuração',
  pedido: 'Pedido',
}
const ACAO_DESCONHECIDA = { label: 'Ação', color: '#a1a1aa' }

export default function Auditoria() {
  const logs = useStore((s) => s.logs)
  const refreshLogs = useStore((s) => s.refreshLogs)
  const [action, setAction] = useState<'todas' | LogAction>('todas')
  const [entity, setEntity] = useState<'todas' | LogEntity>('todas')
  const [q, setQ] = useState('')

  // A trilha (500 eventos) só é carregada aqui, e atualizada enquanto a tela está aberta.
  useEffect(() => {
    const tick = () => refreshLogs(500).catch(() => {})
    tick()
    const id = setInterval(tick, 15000)
    return () => clearInterval(id)
  }, [refreshLogs])

  const rows = useMemo(
    () =>
      logs.filter((l) => {
        if (action !== 'todas' && l.action !== action) return false
        if (entity !== 'todas' && l.entity !== entity) return false
        if (q && !`${l.actor} ${l.target} ${l.detail ?? ''} ${l.local ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
        return true
      }),
    [logs, action, entity, q],
  )

  return (
    <div>
      <PageHeader title="Trilha de auditoria" subtitle={`${logs.length} eventos mais recentes`} />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300/90">
        <ShieldCheck size={14} className="shrink-0" />
        Registros imutáveis: quem, o quê, quando. Logins, chamados, usuários e configurações aparecem aqui.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={action} onValueChange={(v) => setAction(v as LogAction | 'todas')} aria-label="Ação">
          <option value="todas">Todas as ações</option>
          {Object.entries(ACTION).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
        </Select>
        <Select value={entity} onValueChange={(v) => setEntity(v as LogEntity | 'todas')} aria-label="Entidade">
          <option value="todas">Todas as entidades</option>
          {Object.entries(ENTITY).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
        </Select>
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input data-busca value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa, alvo, detalhe…" aria-label="Buscar na auditoria" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-red-500 sm:w-64" />
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {rows.map((l) => {
          const a = ACTION[l.action] ?? ACAO_DESCONHECIDA
          return (
            <Card key={l.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ color: a.color, background: a.color + '1e' }}>{a.label} · {ENTITY[l.entity] ?? l.entity}</span>
                <span className="font-mono text-[11px] text-slate-500">{fmtDataHora(l.ts)}</span>
              </div>
              <div className="mt-1.5 font-medium text-slate-100">{l.target}</div>
              {l.detail && <div className="mt-1 text-[12px] text-slate-400">{l.detail}</div>}
              <div className="mt-2 flex items-center gap-2 border-t border-slate-800/60 pt-2 text-[11px]">
                <span className="text-slate-300">{l.actor}</span>
                <RoleBadge name={l.actorRole} />
              </div>
            </Card>
          )
        })}
        {rows.length === 0 && <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-6 text-center text-sm text-slate-500">Nenhum evento para esse filtro.</div>}
      </div>

      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Data/hora</th>
              <th className="px-4 py-3 font-medium">Quem</th>
              <th className="px-4 py-3 font-medium">Ação</th>
              <th className="px-4 py-3 font-medium">Entidade</th>
              <th className="px-4 py-3 font-medium">Alvo</th>
              <th className="px-4 py-3 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const a = ACTION[l.action] ?? ACAO_DESCONHECIDA
              return (
                <tr key={l.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-slate-400">{fmtDataHora(l.ts)}</td>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="text-slate-200">{l.actor}</span><RoleBadge name={l.actorRole} /></div></td>
                  <td className="px-4 py-2.5"><span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ color: a.color, background: a.color + '1e' }}>{a.label}</span></td>
                  <td className="px-4 py-2.5 text-slate-300">{ENTITY[l.entity] ?? l.entity}</td>
                  <td className="px-4 py-2.5"><div className="text-slate-200">{l.target}</div>{l.local && <div className="text-[11px] text-slate-500">{l.local}</div>}</td>
                  <td className="px-4 py-2.5 text-slate-400">{l.detail ?? '—'}</td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Nenhum evento para esse filtro.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
