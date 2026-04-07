/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Пустая строка в production: на localhost см. fallback в main.tsx (обычно :8000) */
  readonly VITE_API_URL?: string
}
