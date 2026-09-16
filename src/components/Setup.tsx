import { useState } from 'react'
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react'
import { Button, Field, Input } from './ui'
import { PasswordInput } from './secret'
import { AuthShell } from './AuthShell'
import { useStore } from '@/lib/store'

/**
 * Configuração inicial: aparece só enquanto a base não tem nenhum usuário. Assim o
 * sistema não depende de um admin semeado com senha fixa conhecida.
 */
export default function Setup() {
  const setup = useStore((s) => s.setup)
  const authError = useStore((s) => s.authError)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const curto = password.length > 0 && password.length < 8
  const divergem = confirm.length > 0 && password !== confirm
  const podeEnviar = !!name.trim() && !!email.trim() && password.length >= 8 && password === confirm && !loading

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!podeEnviar) return
    setLoading(true)
    await setup({ name: name.trim(), email: email.trim(), password })
    setLoading(false)
  }

  return (
    <AuthShell title="Aexecutiva · Quality Work" subtitle="Configuração inicial">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-xl">
        <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
          <p className="text-[13px] leading-relaxed text-slate-400">
            Nenhuma conta existe ainda. Crie o <strong className="text-slate-200">administrador</strong> da central de chamados.
          </p>
        </div>
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" autoFocus /></Field>
        <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@quality.net.br" /></Field>
        <Field label="Senha"><PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 8 caracteres" /></Field>
        {curto && <p className="text-[12px] text-amber-400">A senha precisa de ao menos 8 caracteres.</p>}
        <Field label="Confirmar senha"><PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="repita a senha" /></Field>
        {divergem && <p className="text-[12px] text-amber-400">As senhas não coincidem.</p>}
        {authError && <p className="text-[13px] text-red-400">{authError}</p>}
        <Button type="submit" disabled={!podeEnviar} className="w-full">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {loading ? 'Criando…' : 'Criar administrador'}
        </Button>
        <p className="pt-1 text-center text-[12px] text-slate-500">Esta tela desaparece assim que a conta for criada.</p>
      </form>
    </AuthShell>
  )
}
