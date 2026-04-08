import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    TanStackRouterVite(),
    VitePWA({
      registerType: "autoUpdate",
      /* В dev по умолчанию SW выключен; в preview/production — только precache статики. */
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "images/favicon.png", "vite.svg"],
      manifest: {
        name: "Склад",
        short_name: "Склад",
        description: "Учёт товаров и склада",
        theme_color: "#ffffff",
        background_color: "#1a202c",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/images/favicon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        // Не отдавать index.html вместо реальных API-роутов (редиректы/закладки).
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Не регистрируем runtime routes для /api: любой handler (даже NetworkOnly)
        // оставляет перехват fetch в SW и на части ответов Workbox всё равно вызывает Cache.put.
        // Запросы к API идут мимо кеша SW (нет совпадения с precache).
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
        /** SSE / chunked streams — иначе возможны ERR_INCOMPLETE_CHUNKED_ENCODING */
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  /** `vite preview` не наследует server.proxy — без этого /api уходит на :4173 без бэкенда */
  preview: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
