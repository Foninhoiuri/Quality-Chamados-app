#!/usr/bin/env node
/**
 * A VERSÃO DO APP VEM DA CONTAGEM DE COMMITS. Cada commit sobe 0.1: o commit 1 é a 0.1,
 * o 10 é a 1.0, o 13 é a 1.3.
 *
 * Nada de número escrito à mão. O que manda é o histórico do git, que ninguém edita sem
 * querer — então a versão que aparece no rodapé do app é sempre a do código que está
 * rodando, e dá para saber em que commit uma tela apareceu.
 *
 * Uso:
 *   node scripts/versao.mjs              imprime a versão de agora
 *   node scripts/versao.mjs --proxima    imprime a versão do commit que está nascendo
 *   node scripts/versao.mjs --escrever   grava nos package.json (é o que o hook faz)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Os dois package.json que carregam a versão: o app e a API (que a devolve no /health). */
const ARQUIVOS = ['package.json', 'api/package.json']

/** 13 → "1.3.0". O patch é sempre 0: quem anda é o 0.1 de cada commit. */
export function versaoDe(commits) {
  return `${Math.floor(commits / 10)}.${commits % 10}.0`
}

function contarCommits() {
  try {
    return Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim())
  } catch {
    // Repositório sem nenhum commit ainda (ou sem git): o primeiro será a 0.1.
    return 0
  }
}

function gravar(versao) {
  const mudados = []
  for (const rel of ARQUIVOS) {
    const caminho = join(RAIZ, rel)
    let texto
    try {
      texto = readFileSync(caminho, 'utf8')
    } catch {
      continue
    }
    // Troca só a linha do `version`, sem reescrever o arquivo inteiro: reindentar um
    // package.json gera diff gigante e conflito em todo merge.
    const novo = texto.replace(/("version"\s*:\s*")[^"]*(")/, `$1${versao}$2`)
    if (novo !== texto) {
      writeFileSync(caminho, novo)
      mudados.push(rel)
    }
  }
  return mudados
}

const args = process.argv.slice(2)
const commits = contarCommits() + (args.includes('--proxima') ? 1 : 0)
const versao = versaoDe(commits)

if (args.includes('--escrever')) {
  const mudados = gravar(versao)
  if (mudados.length) console.log(`versão ${versao} (commit ${commits}) → ${mudados.join(', ')}`)
} else {
  console.log(versao)
}
