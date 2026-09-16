import { useState } from 'react'
import { KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { Button, Field } from './ui'
import { PasswordInput } from './secret'
import { AuthShell } from './AuthShell'
import { useStore } from '@/lib/store'

/** Primeiro acesso ou senha redefinida por outra pessoa: troca obrigatória antes de usar o app. */
export default function ForcePasswordChange() {
  const me = useStore((s) => s.me)
  const changePassword = useStore((s) => s.changePassword)
  const logout = useStore((s) => s.logout)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw.length < 6) return setError('A senha precisa ter ao menos 6 caracteres.')
    if (pw !== pw2) return setError('As senhas não conferem.')
    setLoading(true)
    try {
      await changePassword(pw)
    } catch {
      setError('Não foi possível trocar a senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Defina sua senha"
      subtitle={`${me?.name ? `Olá, ${me.name.split(' ')[0]} · ` : ''}escolha uma senha só sua`}
      footer={<><ShieldCheck size={12} /> A troca fica registrada na auditoria</>}
    >
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-xl">
        <Field label="Nova senha"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoFocus /></Field>
        <Field label="Confirmar nova senha"><PasswordInput autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" /></Field>
        {error && <div className="rounded-lg border border-red-900 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          Salvar e entrar
        </Button>
        <button type="button" onClick={logout} className="flex w-full items-center justify-center gap-1.5 text-center text-[11px] text-slate-500 hover:text-slate-300">
          <LogOut size={12} /> Sair
        </button>
      </form>
    </AuthShell>
  )
}
