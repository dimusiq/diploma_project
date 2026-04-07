import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { OpenAPI } from "./client/index.ts"
import { CustomProvider } from "./components/ui/provider.tsx"
import "./index.css"
import { getErrorHttpStatus } from "./lib/apiClient.ts"
import { getAccessToken, removeAccessToken } from "./lib/authStorage.ts"
import { isLikelyBrowserExtensionRejection } from "./lib/extensionNoise.ts"
import { routeTree } from "./routeTree.gen.ts"

const LOCAL_API_8000 = "http://localhost:8000"

// База API для сгенерированного клиента. Не используем пустую строку на localhost:5173/4173:
// раньше при VITE_API_URL=http://localhost:8000 в бандле выбирался "" «под прокси Vite»;
// если прокси не отрабатывает — POST уходит на :5173/api → 404. Прямой :8000 и в dev, и в preview
// нормален: CORS в backend для localhost уже включён.
function resolveOpenApiBase(): string {
  const raw = import.meta.env.VITE_API_URL
  const trimmed =
    raw !== undefined && raw !== "" ? raw.replace(/\/$/, "") : ""

  if (trimmed !== "") {
    return trimmed
  }

  if (import.meta.env.DEV) {
    return LOCAL_API_8000
  }

  if (typeof window !== "undefined") {
    const { hostname } = window.location
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1"
    if (isLocal) {
      return LOCAL_API_8000
    }
  }
  return ""
}

OpenAPI.BASE = resolveOpenApiBase()

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
