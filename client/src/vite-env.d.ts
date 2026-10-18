/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend address, e.g. https://weekdeck-api.onrender.com (empty in local dev: Vite forwards /api). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
