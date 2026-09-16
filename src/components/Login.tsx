import { useState } from 'react'
import { LogIn, Loader2, ShieldCheck } from 'lucide-react'
import { Button, Field, Input } from './ui'
import { PasswordInput } from './secret'
import { AuthShell } from './AuthShell'
import { useStore } from '@/lib/store'
import { versaoCurta } from '@/lib/version'

export default function Login() {
  const login = useStore((s) => s.login)
  const authError = useStore((s) => s.authError)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password || loading) return
    setLoading(true)
    await login(email.trim(), password)
    setLoading(false)
  }

  return (
    <AuthShell
      title="Aexecutiva · Quality Work"
      subtitle="Central de Chamados"
      footer={<><ShieldCheck size={12} /> Acesso interno · sessão auditada · {versaoCurta()}</>}
    >
      {/* noValidate: quem valida é o submit; o type="email" fica só para o teclado do celular. */}
      <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-xl">
        <Field label="E-mail">
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@quality.net.br" autoFocus />
        </Field>
        <Field label="Senha">
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>

        {authError && <div className="rounded-lg border border-red-900 bg-red-500/10 px-3 py-2 text-xs text-red-400">{authError}</div>}

        <Button type="submit" className="w-full" disabled={loading || !email || !password}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
          Entrar
        </Button>

        <button type="button" onClick={() => setShowReset((v) => !v)} className="w-full text-center text-[11px] text-slate-500 hover:text-slate-300">
          Esqueci minha senha
        </button>
        {showReset && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
            Peça a um administrador para redefinir sua senha em <span className="text-slate-300">Usuários</span>. Você troca por uma sua no próximo acesso.
          </div>
        )}
      </form>
    </AuthShell>
  )
}
