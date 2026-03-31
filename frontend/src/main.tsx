import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import React, { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { OpenAPI } from "./client/index.ts"
import { CustomProvider } from "./components/ui/provider.tsx"
import { getErrorHttpStatus } from "./lib/apiClient.ts"
import { isLikelyBrowserExtensionRejection } from "./lib/extensionNoise.ts"
import { getAccessToken, removeAccessToken } from "./lib/authStorage.ts"
import { routeTree } from "./routeTree.gen.ts"

// Типы для переменных окружения Vite
type ViteEnv = {
  env?: {
    VITE_API_URL?: string
    DEV?: boolean
    MODE?: string
  }
}

// Проверка и установка базового URL API
const apiUrl = (import.meta as ViteEnv).env?.VITE_API_URL
if (!apiUrl) {
  console.error("VITE_API_URL is not defined. Please set it in your .env file.")
}
OpenAPI.BASE = apiUrl || "http://localhost:8000"

// Настройка токена для API запросов (из sessionStorage или localStorage)
OpenAPI.TOKEN = async () => getAccessToken() ?? ""

// Роутер создаётся после queryClient (нужен context). Обработчик ошибок получает его по ссылке.
let router: ReturnType<typeof createRouter>
const getRouter = () => router
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Обработчик ошибок API (использует getRouter(), т.к. router создаётся ниже)
const handleApiError = (error: unknown) => {
  if (isLikelyBrowserExtensionRejection(error)) return
  if ((import.meta as ViteEnv).env?.DEV) {
    console.error("API Error:", error)
  }
  const st = getErrorHttpStatus(error)
  if (st === 401 || st === 403) {
    removeAccessToken()
    getRouter().navigate({ to: "/login" })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

router = createRouter({
  routeTree,
  context: { queryClient },
})

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error(
    'Root element not found. Make sure there is a <div id="root"></div> in your HTML.',
  )
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <CustomProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {((import.meta as ViteEnv).env?.DEV ??
          (import.meta as ViteEnv).env?.MODE === "development") && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </CustomProvider>
  </StrictMode>,
)
