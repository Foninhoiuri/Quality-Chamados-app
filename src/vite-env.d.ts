/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versão do app, injetada pelo Vite a partir do package.json (ver vite.config.ts). */
declare const __APP_VERSION__: string
/** Momento em que este bundle foi construído (ISO). Serve para conferir o deploy. */
declare const __BUILD_AT__: string
