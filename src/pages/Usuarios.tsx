import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Copy } from 'lucide-react'
import { Button, Card, Field, Input, Modal, PageHeader, RoleBadge, Select } from '@/components/ui'
import { PasswordInput } from '@/components/secret'
import { useStore, useCurrentUser, useCan } from '@/lib/store'
import { iniciais } from '@/lib/utils'
import type { Local, User } from '@/lib/types'

// Escopo: 'global' = todos os locais; senão, ids separados por vírgula.
function ScopePicker({ locais, scope, onChange }: { locais: Local[]; scope: string; onChange: (s: string) => void }) {
  const isGlobal = scope === 'global'
  const selected = isGlobal ? [] : scope.split(',').filter(Boolean)
  function toggle(id: string) {
    const arr = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    onChange(arr.length ? arr.join(',') : 'global')
  }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={isGlobal} onChange={(e) => onChange(e.target.checked ? 'global' : '')} className="h-4 w-4 accent-red-500" />
        Global — todos os locais
      </label>
      {!isGlobal && (
        <div className="mt-2 max-h-40 space-y-1 overflow-auto border-t border-slate-800 pt-2">
          {locais.length === 0 && <div className="text-[11px] text-slate-500">Nenhum local cadastrado ainda.</div>}
          {locais.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-[12px] text-slate-300">
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="h-3.5 w-3.5 accent-red-500" />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
          <p className="pt-1 text-[10px] text-slate-500">Nenhum marcado = Global.</p>
        </div>
      )}
    </div>
  )
}

interface UserForm {
  name: string
  email: string
  roleId: string
  scope: string
  status: 'ativo' | 'inativo'
  password: string
  grants: string[]
  denies: string[]
}
const emptyForm = (): UserForm => ({ name: '', email: '', roleId: 'role-operador', scope: 'global', status: 'ativo', password: '', grants: [], denies: [] })

function fmtAcesso(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Usuarios() {
  const users = useStore((s) => s.users)
  const roles = useStore((s) => s.roles)
  const permissions = useStore((s) => s.permissions)
  const locais = useStore((s) => s.locais)
  const { addUser, updateUser, removeUser, addRole, removeRole, toggleRolePermission, showToast } = useStore()
  const me = useCurrentUser()
  const canCreateUsers = useCan('criar_usuarios')
  const canEditUsers = useCan('editar_usuarios')
  const canManageRoles = useCan('gerenciar_papeis')
  // Qual perfil está aberto na versão de celular da matriz.
  const [perfilAberto, setPerfilAberto] = useState('role-tecnico')

  const modules = useMemo(() => [...new Set(permissions.map((p) => p.module))], [permissions])
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [newRole, setNewRole] = useState(false)
  const [roleForm, setRoleForm] = useState({ name: '', color: '#38bdf8' })
  const [removingRole, setRemovingRole] = useState<{ id: string; name: string } | null>(null)
  const [tempPass, setTempPass] = useState<{ name: string; password: string } | null>(null)

  const roleOf = (id: string) => roles.find((r) => r.id === id)
  const scopeLabel = (scope: string) => {
    if (!scope || scope === 'global') return 'Global (todos)'
    const ids = scope.split(',').filter(Boolean)
    if (ids.length === 1) return locais.find((c) => c.id === ids[0])?.name ?? '1 local'
    return `${ids.length} locais`
  }

  function openNew() { setForm(emptyForm()); setEditing('new') }
  useEffect(() => {
    const h = () => { if (canCreateUsers) openNew() }
    window.addEventListener('shortcut:new', h)
    return () => window.removeEventListener('shortcut:new', h)
  }, [canCreateUsers])
  function openEdit(u: User) {
    setForm({ name: u.name, email: u.email, roleId: u.roleId, scope: u.scope, status: u.status, password: '', grants: [...u.grants], denies: [...u.denies] })
    setEditing(u)
  }

  async function save() {
    if (!form.name.trim()) return showToast('Informe o nome do usuário')
    if (!form.email.trim()) return showToast('Informe o e-mail')
    const payload: Partial<UserForm> = { ...form, name: form.name.trim(), email: form.email.trim() }
    // Criar: sem senha — o servidor gera uma temporária. Editar: só se preenchida.
    if (editing === 'new' || !form.password) delete payload.password
    setSaving(true)
    try {
      if (editing === 'new') {
        const temp = await addUser(payload as Partial<User>)
        if (temp) setTempPass({ name: form.name.trim(), password: temp })
      } else if (editing) {
        await updateUser(editing.id, payload as Partial<User>)
        showToast('Usuário salvo')
      }
      setEditing(null)
    } catch (e: any) {
      showToast(e?.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar o usuário')
    } finally {
      setSaving(false)
    }
  }

  const permChecked = (perm: string) => {
    if (form.denies.includes(perm)) return false
    if (form.grants.includes(perm)) return true
    return roleOf(form.roleId)?.permissions.includes(perm) ?? false
  }
  const isOverride = (perm: string) => form.grants.includes(perm) || form.denies.includes(perm)
  function togglePerm(perm: string) {
    const roleHas = roleOf(form.roleId)?.permissions.includes(perm) ?? false
    const next = !permChecked(perm)
    let grants = form.grants.filter((p) => p !== perm)
    let denies = form.denies.filter((p) => p !== perm)
    if (next && !roleHas) grants = [...grants, perm]
    if (!next && roleHas) denies = [...denies, perm]
    setForm({ ...form, grants, denies })
  }

  const Acoes = ({ u }: { u: User }) => {
    const isMe = u.id === me?.id
    if (!canEditUsers) return null
    return (
      <>
        <button onClick={() => openEdit(u)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Editar"><Pencil size={14} /></button>
        <button onClick={() => setDeleting(u)} disabled={isMe} className="rounded-md p-1.5 text-slate-500 enabled:hover:bg-red-500/10 enabled:hover:text-red-400 disabled:opacity-30" title={isMe ? 'Você não pode excluir a si mesmo' : 'Excluir'}><Trash2 size={14} /></button>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Usuários e permissões"
        subtitle={`${users.length} usuários · ${roles.length} perfis`}
        actions={canCreateUsers && <Button onClick={openNew}><Plus size={15} /> Novo usuário</Button>}
      />

      {/* Mobile: cards */}
      <div className="mb-6 space-y-2 md:hidden">
        {users.map((u) => {
          const role = roleOf(u.roleId)
          const overrides = u.grants.length + u.denies.length
          return (
            <Card key={u.id} className="p-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: role?.color ?? '#71717a' }}>{iniciais(u.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-100">{u.name}</span>
                    {u.id === me?.id && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">você</span>}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{u.email}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <RoleBadge name={role?.name ?? '—'} color={role?.color} />
                    {overrides > 0 && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">+{overrides}</span>}
                    <span className={u.status === 'ativo' ? 'text-[11px] text-emerald-400' : 'text-[11px] text-slate-500'}>{u.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
                    <span className="text-[11px] text-slate-500">· {scopeLabel(u.scope)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1"><Acoes u={u} /></div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Desktop: tabela */}
      <Card className="mb-6 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Perfil</th>
              <th className="px-4 py-3 font-medium">Escopo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Último acesso</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const role = roleOf(u.roleId)
              const isMe = u.id === me?.id
              const overrides = u.grants.length + u.denies.length
              return (
                <tr key={u.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: role?.color ?? '#71717a' }}>{iniciais(u.name)}</div>
                      <div>
                        <div className="flex items-center gap-2 font-medium text-slate-100">
                          {u.name}
                          {isMe && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">você</span>}
                        </div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <RoleBadge name={role?.name ?? '—'} color={role?.color} />
                      {overrides > 0 && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400" title="Exceções personalizadas">+{overrides}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-300">{scopeLabel(u.scope)}</td>
                  <td className="px-4 py-2.5"><span className={u.status === 'ativo' ? 'text-emerald-400' : 'text-slate-500'}>{u.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="px-4 py-2.5 text-slate-400">{fmtAcesso(u.lastAccess)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {isMe && <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400"><Check size={12} /> Conectado</span>}
                      <Acoes u={u} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Matriz de permissões */}
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Matriz de permissões</h2>
          <p className="text-xs text-slate-500">Perfis (colunas) × ações (linhas). {canManageRoles ? 'Marque para conceder — salva na hora.' : 'Somente leitura.'}</p>
        </div>
        {canManageRoles && <Button variant="subtle" onClick={() => { setRoleForm({ name: '', color: '#38bdf8' }); setNewRole(true) }}><Plus size={15} /> Novo perfil</Button>}
      </div>

      {/* Celular: a matriz não cabe. Escolhe-se um perfil e se lê as permissões dele. */}
      <div className="space-y-3 md:hidden">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setPerfilAberto(r.id)}
              aria-pressed={perfilAberto === r.id}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                perfilAberto === r.id ? 'border-red-700 bg-red-500/10 text-red-300' : 'border-slate-800 text-slate-400'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} /> {r.name}
            </button>
          ))}
        </div>
        {(() => {
          const r = roles.find((x) => x.id === perfilAberto) ?? roles[0]
          if (!r) return null
          return (
            <Card className="divide-y divide-slate-800/60">
              {modules.map((mod) => (
                <div key={mod} className="px-3 py-2">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{mod}</div>
                  <div className="space-y-1">
                    {permissions.filter((p) => p.module === mod).map((p) => (
                      <label key={p.id} className="flex items-center justify-between gap-3 py-1 text-[13px] text-slate-300">
                        <span className="min-w-0">{p.label}</span>
                        <input
                          type="checkbox"
                          aria-label={`${p.label} — ${r.name}`}
                          checked={r.permissions.includes(p.id)}
                          disabled={!canManageRoles || r.system}
                          onChange={() => toggleRolePermission(r.id, p.id)}
                          className="h-5 w-5 shrink-0 accent-red-500 disabled:opacity-50"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          )
        })()}
      </div>

      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left">
              <th className="sticky left-0 bg-slate-900 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Ação</th>
              {roles.map((r) => (
                <th key={r.id} className="px-3 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-slate-200"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.name}</span>
                    {canManageRoles && !r.system && (
                      <button onClick={() => setRemovingRole({ id: r.id, name: r.name })} className="text-slate-600 hover:text-red-400" title="Excluir perfil"><X size={12} /></button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((mod) => (
              <Fragment key={mod}>
                <tr className="bg-slate-950/40">
                  <td colSpan={roles.length + 1} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{mod}</td>
                </tr>
                {permissions.filter((p) => p.module === mod).map((p) => (
                  <tr key={p.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="sticky left-0 bg-slate-900 px-4 py-2 text-slate-300">{p.label}</td>
                    {roles.map((r) => (
                      <td key={r.id} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${p.label} — ${r.name}`}
                          checked={r.permissions.includes(p.id)}
                          disabled={!canManageRoles || r.system}
                          onChange={() => toggleRolePermission(r.id, p.id)}
                          className="h-4 w-4 accent-red-500 disabled:opacity-50"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-[11px] text-slate-500">O perfil <span className="text-slate-300">Administrador</span> é de sistema e recebe toda permissão. <span className="text-slate-300">Gestor</span> acompanha a operação — vê tudo, abre chamado e cuida de relatórios, locais e usuários, sem pegar nem atender chamado; <span className="text-slate-300">Técnico</span> pega e atende; <span className="text-slate-300">Operador</span> abre chamados e faz registros. Alterações vão para a auditoria.</p>

      {/* Modal usuário */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Novo usuário' : 'Editar usuário'}
        wide
        onSubmit={save}
        footer={<><Button variant="subtle" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} disabled={saving}>Salvar</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="E-mail (login)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nome@quality.net.br" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Perfil">
              <Select className="w-full" value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v })}>
                {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </Select>
            </Field>
            <Field label="Status">
              <Select className="w-full" value={form.status} onValueChange={(v) => setForm({ ...form, status: v as 'ativo' | 'inativo' })}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </Field>
          </div>
          <Field label="Escopo (locais que o usuário enxerga)">
            <ScopePicker locais={locais} scope={form.scope} onChange={(scope) => setForm({ ...form, scope })} />
          </Field>
          {editing === 'new' ? (
            <p className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
              Uma senha temporária é gerada ao salvar. Repasse para a pessoa — ela escolhe a própria senha no primeiro acesso.
            </p>
          ) : (
            <Field label="Redefinir senha" hint="em branco = manter a atual; ao definir, o usuário troca no próximo acesso">
              <PasswordInput autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
            </Field>
          )}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="mb-2 text-xs font-medium text-slate-300">Permissões — herda do perfil; marque item a item para exceções</div>
            <div className="max-h-56 space-y-2 overflow-auto pr-1">
              {modules.map((mod) => (
                <div key={mod}>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{mod}</div>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                    {permissions.filter((p) => p.module === mod).map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-[12px] text-slate-300">
                        <input type="checkbox" checked={permChecked(p.id)} onChange={() => togglePerm(p.id)} className="h-3.5 w-3.5 accent-red-500" />
                        <span className="truncate">{p.label}</span>
                        {isOverride(p.id) && <span className="rounded bg-amber-500/15 px-1 text-[9px] font-medium text-amber-400">exceção</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Novo perfil */}
      <Modal
        open={newRole}
        onClose={() => setNewRole(false)}
        title="Novo perfil"
        onSubmit={async () => { if (roleForm.name.trim()) { await addRole(roleForm).catch(() => showToast('Não foi possível criar o perfil')); setNewRole(false) } }}
        footer={<><Button variant="subtle" onClick={() => setNewRole(false)}>Cancelar</Button><Button disabled={!roleForm.name.trim()} onClick={async () => { await addRole(roleForm).catch(() => showToast('Não foi possível criar o perfil')); setNewRole(false) }}>Criar</Button></>}
      >
        <div className="space-y-3">
          <Field label="Nome do perfil"><Input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Ex.: Supervisor" autoFocus /></Field>
          <Field label="Cor">
            <div className="flex gap-2">
              {['#ef4444', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'].map((c) => (
                <button key={c} type="button" onClick={() => setRoleForm({ ...roleForm, color: c })} aria-label={`Cor ${c}`} className="h-7 w-7 rounded-md" style={{ background: c, outline: roleForm.color === c ? '2px solid #fff6' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </Field>
          <p className="text-[11px] text-slate-500">O perfil começa sem permissões — marque na matriz depois de criar.</p>
        </div>
      </Modal>

      <Modal
        open={removingRole !== null}
        onClose={() => setRemovingRole(null)}
        title="Excluir perfil"
        footer={<><Button variant="subtle" onClick={() => setRemovingRole(null)}>Cancelar</Button><Button variant="danger" onClick={async () => { const r = removingRole; setRemovingRole(null); if (r) await removeRole(r.id).catch(() => showToast('Não foi possível excluir o perfil')) }}>Excluir</Button></>}
      >
        <p className="text-sm text-slate-300">Excluir o perfil <span className="font-medium text-slate-100">{removingRole?.name}</span>? Os usuários dele passam para Operador.</p>
      </Modal>

      {/* Senha temporária */}
      <Modal open={tempPass !== null} onClose={() => setTempPass(null)} title="Usuário criado" footer={<Button onClick={() => setTempPass(null)}>Fechar</Button>}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-300">
            Repasse esta senha temporária para <span className="font-medium text-slate-100">{tempPass?.name}</span>. Ela só aparece agora; no primeiro acesso a pessoa escolhe a própria.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-base tracking-wider text-slate-100">{tempPass?.password}</code>
            <Button variant="subtle" onClick={() => { if (tempPass) navigator.clipboard?.writeText(tempPass.password).then(() => showToast('Senha copiada'), () => showToast('Copie manualmente')) }}>
              <Copy size={14} /> Copiar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Excluir usuário"
        footer={<><Button variant="subtle" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" onClick={async () => { const u = deleting; setDeleting(null); if (u) { try { await removeUser(u.id); showToast('Usuário excluído') } catch (e: any) { showToast(e?.message ?? 'Não foi possível excluir') } } }}>Excluir</Button></>}
      >
        <p className="text-sm text-slate-300">Excluir <span className="font-medium text-slate-100">{deleting?.name}</span>? Para só bloquear o acesso, prefira marcar como Inativo. Fica registrado na auditoria.</p>
      </Modal>
    </div>
  )
}
