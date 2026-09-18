import { defineConfig } from 'vitest/config'

/**
 * Os testes sobem a API de verdade (mesmas rotas, mesmos guards) contra um SQLite
 * temporário. São sequenciais e num processo só: o app é um módulo com estado (Fastify,
 * Prisma, bootstrap), e paralelizar daria bancos concorrendo pelo mesmo arquivo.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/prepara-banco.ts'],
    // Um arquivo por vez e um worker só: o app é um módulo com estado (Fastify, Prisma,
    // bootstrap) e dois processos brigariam pelo mesmo arquivo de banco.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
