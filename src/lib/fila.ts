import { ApiError, getToken } from './api'

/**
 * FILA DE ENVIO — o técnico trabalha onde não há sinal: subsolo, casa de máquinas, elevador.
 * É exatamente ali que ele marca a chegada, escreve a solução e comenta. Sem isto, a
 * ação some junto com o toque na tela.
 *
 * A regra é conservadora de propósito: só entra na fila o que é pequeno e pertence a um
 * chamado que já existe (ponto, atendimento, comentário). Criar chamado offline daria um
 * chamado invisível até a rede voltar — confuso demais para valer a pena.
 *
 * Nada aqui finge que salvou: a tela diz que a ação está esperando rede.
 */

export interface AcaoPendente {
  id: string
  metodo: 'POST' | 'PATCH'
  caminho: string
  corpo: unknown
  /** O que dizer para a pessoa: "atendimento do CH-0007". */
  descricao: string
  criadaEm: number
  tentativas: number
}

const CHAVE = 'chamados-fila-envio'
const MAX_ACOES = 40
/** Corpo grande (foto em base64, por exemplo) não cabe no armazenamento do navegador. */
const MAX_CORPO = 120_000

const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function assinarFila(cb: () => void): () => void {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}

export function pendentes(): AcaoPendente[] {
  try {
    const cru = localStorage.getItem(CHAVE)
    const lista = cru ? JSON.parse(cru) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function gravar(lista: AcaoPendente[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(lista.slice(-MAX_ACOES))) } catch { /* sem storage */ }
  avisar()
}

/** Erro de conexão — é o único caso em que vale guardar para depois. */
export const ehFalhaDeRede = (e: unknown) => e instanceof ApiError && e.status === 0

/**
 * Guarda a ação. Uma ação nova sobre o MESMO alvo substitui a anterior: o atendimento é
 * o estado inteiro, então enviar duas versões velhas em sequência só gasta rede.
 */
export function enfileirar(acao: Omit<AcaoPendente, 'id' | 'criadaEm' | 'tentativas'>): boolean {
  const corpo = JSON.stringify(acao.corpo ?? null)
  if (corpo.length > MAX_CORPO) return false
  const substituivel = acao.metodo === 'PATCH'
  const lista = pendentes().filter((a) => !(substituivel && a.metodo === acao.metodo && a.caminho === acao.caminho))
  lista.push({ ...acao, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, criadaEm: Date.now(), tentativas: 0 })
  gravar(lista)
  return true
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

/**
 * Tenta enviar tudo, em ordem. Para no primeiro erro de rede (a conexão voltou a cair) e
 * deixa o resto para a próxima. Erro do servidor (4xx) descarta a ação depois de algumas
 * tentativas — insistir num payload recusado só entope a fila.
 */
export async function processarFila(): Promise<{ enviadas: number; restantes: number }> {
  const token = getToken()
  if (!token) return { enviadas: 0, restantes: pendentes().length }

  let lista = pendentes()
  let enviadas = 0

  while (lista.length) {
    const acao = lista[0]
    try {
      const res = await fetch(BASE + acao.caminho, {
        method: acao.metodo,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(acao.corpo ?? {}),
      })
      if (!res.ok && res.status >= 500) throw new Error('servidor indisponível')
      // 2xx envia; 4xx é recusa definitiva (chamado concluído, sem permissão…): sai da fila.
      lista = lista.slice(1)
      enviadas++
      gravar(lista)
    } catch {
      const tentativas = acao.tentativas + 1
      if (tentativas >= 5) {
        lista = lista.slice(1)
        gravar(lista)
        continue
      }
      lista = [{ ...acao, tentativas }, ...lista.slice(1)]
      gravar(lista)
      break
    }
  }

  return { enviadas, restantes: lista.length }
}
