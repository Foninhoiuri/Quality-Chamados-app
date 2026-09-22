import { useState } from 'react'
import { Loader2, MapPin, Plus, Crosshair, X } from 'lucide-react'
import { Button, Field, FieldBox, Input, Textarea } from './ui'
import { BuscaEndereco } from './EnderecoPicker'
import { api } from '@/lib/api'
import { useStore } from '@/lib/store'
import { parseTiposLocal } from '@/lib/locais'

export interface LocalForm {
  code: string
  name: string
  /** Etiqueta do local — a lista é editável na tela de Locais. */
  tipo: string
  cep: string
  /** A rua, sem o número: o número vai em `number` e o resto em `complement`. */
  address: string
  number: string
  complement: string
  city: string
  note: string
  lat: number | null
  lng: number | null
}

export const LOCAL_VAZIO: LocalForm = { code: '', name: '', tipo: '', cep: '', address: '', number: '', complement: '', city: '', note: '', lat: null, lng: null }

const soDigitos = (v: string) => v.replace(/\D/g, '')
const formatarCep = (v: string) => {
  const d = soDigitos(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/**
 * Cadastro de local, na ordem em que a pessoa sabe as coisas: a abreviação, o nome e o
 * CEP. O CEP traz rua e cidade prontos — só aí os campos de endereço aparecem, e o que
 * sobra é o número. A observação nasce escondida atrás de um botão: quase nunca é usada e
 * ocupava meia tela de textarea vazia.
 */
export function FormularioLocal({ form, onChange, onAbrirMapa }: {
  form: LocalForm
  onChange: (f: LocalForm) => void
  /** Abre o mapa com o pino no meio, para o ajuste fino. */
  onAbrirMapa?: () => void
}) {
  const tipos = parseTiposLocal(useStore((s) => s.settings))
  const [buscando, setBuscando] = useState(false)
  const [erroCep, setErroCep] = useState<string | null>(null)
  // Endereço aberto: ou já veio preenchido (edição), ou o CEP acabou de trazer.
  const [enderecoAberto, setEnderecoAberto] = useState(!!form.address || !!form.city || !!form.number)
  const [obsAberta, setObsAberta] = useState(!!form.note)

  async function buscarCep(valor: string) {
    const cep = soDigitos(valor)
    if (cep.length !== 8) return
    setBuscando(true)
    setErroCep(null)
    try {
      const r = await api.buscarCep(cep)
      onChange({ ...form, cep: formatarCep(r.cep), address: r.address || form.address, city: r.city || form.city })
      setEnderecoAberto(true)
    } catch (e: any) {
      setErroCep(e?.message ?? 'Não foi possível buscar este CEP')
      setEnderecoAberto(true)
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Abreviação" hint="vazio = automático"><Input value={form.code} onChange={(e) => onChange({ ...form, code: e.target.value })} placeholder="LC-001" /></Field>
        <div className="col-span-2">
          <Field label="Nome"><Input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Ex.: Condomínio Jardim" autoFocus /></Field>
        </div>
      </div>

      {/* Tipo em pílulas, não em lista suspensa: são poucos e o toque é direto. Nenhum
          selecionado é uma resposta válida — nem todo lugar se encaixa numa etiqueta. */}
      {tipos.length > 0 && (
        <FieldBox label="Tipo" hint="opcional — some do cartão quando não tem">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo do local">
            {tipos.map((t) => {
              const on = form.tipo === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange({ ...form, tipo: on ? '' : t.key })}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
                  style={on
                    ? { color: t.color, background: `${t.color}1e`, borderColor: `${t.color}66` }
                    : { color: '#94a3b8', borderColor: '#334155' }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} /> {t.label}
                </button>
              )
            })}
          </div>
        </FieldBox>
      )}

      <FieldBox label="CEP" hint="digite o CEP e o endereço vem preenchido">
        <div className="flex items-center gap-2">
          <Input
            value={form.cep}
            inputMode="numeric"
            placeholder="00000-000"
            onChange={(e) => {
              const cep = formatarCep(e.target.value)
              onChange({ ...form, cep })
              if (soDigitos(cep).length === 8) buscarCep(cep)
            }}
            className="max-w-[10rem]"
          />
          {buscando && <Loader2 size={15} className="animate-spin text-slate-500" />}
          {!enderecoAberto && !buscando && (
            <button type="button" onClick={() => setEnderecoAberto(true)} className="text-[12px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
              não sei o CEP
            </button>
          )}
        </div>
        {erroCep && <div className="mt-1 text-[11px] text-amber-400">{erroCep} — preencha o endereço à mão.</div>}
      </FieldBox>

      {enderecoAberto && (
        <>
          {/* CEP, rua, número, cidade: cada um no seu campo. Com tudo junto numa linha só,
              "Rua X 15 fundos" não é endereço para o mapa nem para o relatório — e o
              número, que é o que o técnico procura no portão, some no meio do texto. */}
          <FieldBox label="Rua" hint="ou escolha uma sugestão, que já crava o pino no mapa">
            <BuscaEndereco
              value={form.address}
              onChange={(v) => onChange({ ...form, address: v })}
              onEscolher={(s) => onChange({ ...form, address: s.address || s.descricao, city: s.city || form.city, lat: s.lat, lng: s.lng })}
            />
          </FieldBox>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Número"><Input value={form.number} onChange={(e) => onChange({ ...form, number: e.target.value })} placeholder="15" inputMode="numeric" /></Field>
            <div className="col-span-2">
              <Field label="Complemento" hint="opcional"><Input value={form.complement} onChange={(e) => onChange({ ...form, complement: e.target.value })} placeholder="Bloco B, fundos, sala 4…" /></Field>
            </div>
          </div>
          <Field label="Cidade"><Input value={form.city} onChange={(e) => onChange({ ...form, city: e.target.value })} placeholder="Cidade - UF" /></Field>

          {onAbrirMapa && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onAbrirMapa}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[12px] text-slate-200 hover:border-red-700 hover:bg-red-500/5"
              >
                <Crosshair size={13} /> {form.lat == null ? 'Marcar no mapa' : 'Ajustar o pino'}
              </button>
              {form.lat != null ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400"><MapPin size={11} /> pino definido</span>
              ) : (
                <span className="text-[11px] text-slate-500">sem pino — será procurado pelo endereço</span>
              )}
            </div>
          )}
        </>
      )}

      {obsAberta ? (
        <FieldBox label="Observação">
          <Textarea rows={2} value={form.note} onChange={(e) => onChange({ ...form, note: e.target.value })} placeholder="Contato, horário, referência…" autoFocus />
          <button
            type="button"
            onClick={() => { onChange({ ...form, note: '' }); setObsAberta(false) }}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
          >
            <X size={11} /> remover observação
          </button>
        </FieldBox>
      ) : (
        <Button variant="subtle" size="sm" onClick={() => setObsAberta(true)}><Plus size={13} /> Adicionar observação</Button>
      )}
    </div>
  )
}
