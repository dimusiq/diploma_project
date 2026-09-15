import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
import { useTheme } from "next-themes"
import React, { Suspense, useEffect } from "react"

import NotFound from "@/components/Common/NotFound.tsx"
import { OfflineBanner } from "@/components/Common/OfflineBanner.tsx"
import { RouterErrorDetails } from "@/components/Common/RouterErrorDetails.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useDocumentTitle } from "@/hooks/useDocumentTitle.ts"

function useThemeColor() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    const color = resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff"
    document.getElementById("app-theme-color")?.setAttribute("content", color)
  }, [resolvedTheme])
}

/** Контекст роутера: передаётся в createRouter, дополняется в beforeLoad дочерних маршрутов. */
export interface RouterContext {
  queryClient: QueryClient
}

const loadDevtools = () =>
  Promise.all([
    import("@tanstack/router-devtools"),
    import("@tanstack/react-query-devtools"),
  ]).then(([routerDevtools, reactQueryDevtools]) => {
    return {
      default: () => (
        <>
          <routerDevtools.TanStackRouterDevtools />
          <reactQueryDevtools.ReactQueryDevtools />
        </>
      ),
    }
  })

const TanStackDevtools =
  process.env.NODE_ENV === "production" ? () => null : React.lazy(loadDevtools)

function RootComponent() {
  const pathname = useLocation({ select: (loc) => loc.pathname })
  useDocumentTitle(pathname)
  useThemeColor()

  return (
    <>
      <OfflineBanner />
      <Outlet />
      <Suspense>
        <TanStackDevtools />
      </Suspense>
    </>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <h1 className="mb-4 text-2xl font-bold">Страница недоступна</h1>
        <p className="text-muted-foreground">
          Не удалось загрузить страницу. Попробуйте обновить или вернитесь позже.
        </p>
        <RouterErrorDetails error={error} />
        <Button
          type="button"
          className="mt-6"
          onClick={() => window.location.reload()}
        >
          Обновить страницу
        </Button>
      </div>
    </div>
  ),
})
