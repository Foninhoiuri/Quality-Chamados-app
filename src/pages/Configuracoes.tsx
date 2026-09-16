import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Palette, Users, ScrollText, LogOut, ArrowRight, Sun, Moon, UserCircle, KeyRound, Save, ImagePlus, Trash2 } from 'lucide-react'
import { Button, Card, Field, Input, PageHeader } from '@/components/ui'
import { PasswordInput } from '@/components/secret'
import { cn, iniciais, imagemParaDataUrl } from '@/lib/utils'
import { useStore, useCurrentUser, useCan } from '@/lib/store'
import { api, assetUrl } from '@/lib/api'
import { NotificationsSetup } from '@/components/Notifications'

function SectionCard({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
        <span className="text-slate-400">{icon}</span> {title}
      </div>
      {children}
    </Card>
  )
}

export default function Configuracoes() {
  const logout = useStore((s) => s.logout)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const podeUsuarios = useCan('ver_usuarios')
  const podeAuditoria = useCan('ver_auditoria')

  return (
    <div className="space-y-4">
      <PageHeader title="Configurações" subtitle="Seu perfil e preferências" />

      <SectionCard icon={<UserCircle size={16} />} title="Meu perfil">
        <ProfileSection />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard icon={<Bell size={16} />} title="Notificações">
          <NotificationsSetup />
        </SectionCard>

        <SectionCard icon={<Palette size={16} />} title="Aparência">
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-400">Tema</div>
            <div className="grid grid-cols-2 gap-2">
              {([['dark', 'Escuro', Moon], ['light', 'Claro', Sun]] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setTheme(k)}
                  aria-pressed={theme === k}
                  className={cn('flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm', theme === k ? 'border-red-700 bg-red-500/10 text-red-300' : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700')}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">Fica salvo neste navegador. Atalho: Ctrl+Shift+L.</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard icon={<Users size={16} />} title={podeUsuarios || podeAuditoria ? 'Acesso e dados' : 'Sessão'}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {podeUsuarios && (
            <Link to="/usuarios" className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-200 hover:border-red-700 hover:bg-red-500/5">
              <span className="flex items-center gap-2"><Users size={15} className="text-slate-400" /> Usuários e permissões</span>
              <ArrowRight size={14} className="text-slate-500" />
            </Link>
          )}
          {podeAuditoria && (
            <Link to="/auditoria" className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-200 hover:border-red-700 hover:bg-red-500/5">
              <span className="flex items-center gap-2"><ScrollText size={15} className="text-slate-400" /> Trilha de auditoria</span>
              <ArrowRight size={14} className="text-slate-500" />
            </Link>
          )}
          <button onClick={logout} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-300 hover:border-red-700 hover:bg-red-500/5 hover:text-red-300">
            <span className="flex items-center gap-2"><LogOut size={15} className="text-slate-400" /> Sair da conta</span>
            <ArrowRight size={14} className="text-slate-500" />
          </button>
        </div>
      </SectionCard>
    </div>
  )
}

function ProfileSection() {
  const me = useCurrentUser()
  const roles = useStore((s) => s.roles)
  const updateProfile = useStore((s) => s.updateProfile)
  const changePassword = useStore((s) => s.changePassword)
  const showToast = useStore((s) => s.showToast)
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)

  const [name, setName] = useState(me?.name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [email, setEmail] = useState(me?.email ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    setName(me?.name ?? ''); setPhone(me?.phone ?? ''); setEmail(me?.email ?? '')
  }, [me?.id, me?.name, me?.phone, me?.email])

  if (!me) return null
  const roleName = roles.find((r) => r.id === me.roleId)?.name ?? '—'
  const dirty = name.trim() !== (me.name ?? '') || (phone ?? '') !== (me.phone ?? '') || email.trim() !== (me.email ?? '')

  async function saveProfile() {
    if (!name.trim() || !email.trim()) return
    setSavingProfile(true)
    try { await updateProfile({ name: name.trim(), phone: phone.trim(), email: email.trim() }); showToast('Perfil atualizado') }
    catch (e: any) { showToast(e?.message ?? 'Não foi possível salvar o perfil') }
    finally { setSavingProfile(false) }
  }

  async function savePassword() {
    setPwError(null)
    if (pw.length < 6) return setPwError('A nova senha precisa ter ao menos 6 caracteres.')
    if (pw !== pw2) return setPwError('As senhas não conferem.')
    if (!cur) return setPwError('Informe sua senha atual.')
    setSavingPw(true)
    try { await changePassword(pw, cur); setCur(''); setPw(''); setPw2(''); showToast('Senha alterada') }
    catch { setPwError('Senha atual incorreta ou falha ao salvar.') }
    finally { setSavingPw(false) }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return showToast('Escolha um arquivo de imagem')
    setAvatarBusy(true)
    try {
      const { url } = await api.upload(await imagemParaDataUrl(file, 256, true))
      await updateProfile({ avatar: url })
      showToast('Foto atualizada')
    } catch {
      showToast('Não foi possível processar a imagem')
    } finally {
      setAvatarBusy(false)
    }
  }
  async function removeAvatar() {
    setAvatarBusy(true)
    try { await updateProfile({ avatar: null }); showToast('Foto removida') } catch { showToast('Falha ao remover a foto') } finally { setAvatarBusy(false) }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {me.avatar ? (
            <img src={assetUrl(me.avatar)} alt={me.name} className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-xl font-semibold text-white">{iniciais(me.name)}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={avatarBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[12px] text-slate-200 hover:border-red-700 hover:bg-red-500/5 disabled:opacity-50">
              <ImagePlus size={14} /> {avatarBusy ? 'Enviando…' : me.avatar ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            {me.avatar && (
              <button onClick={removeAvatar} disabled={avatarBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[12px] text-slate-400 hover:border-red-700 hover:text-red-300 disabled:opacity-50">
                <Trash2 size={14} /> Remover
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{roleName}</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">{me.scope === 'global' ? 'Acesso a todos os locais' : `${me.scope.split(',').filter(Boolean).length} local(is)`}</span>
        </div>
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" /></Field>
          <Field label="E-mail (login)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <Button onClick={saveProfile} disabled={!dirty || savingProfile || !name.trim() || !email.trim()}>
          <Save size={14} /> {savingProfile ? 'Salvando…' : 'Salvar perfil'}
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200"><KeyRound size={15} className="text-slate-400" /> Trocar minha senha</div>
        <Field label="Senha atual"><PasswordInput autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="••••••••" /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nova senha"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" /></Field>
          <Field label="Confirmar"><PasswordInput autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" /></Field>
        </div>
        {pwError && <div className="rounded-lg border border-red-900 bg-red-500/10 px-3 py-2 text-xs text-red-400">{pwError}</div>}
        <Button variant="subtle" onClick={savePassword} disabled={savingPw || !cur || !pw}>
          <KeyRound size={14} /> {savingPw ? 'Salvando…' : 'Alterar senha'}
        </Button>
      </div>
    </div>
  )
}
