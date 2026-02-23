import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
import React, { Suspense } from "react"

import NotFound from "@/components/Common/NotFound.tsx"
import { OfflineBanner } from "@/components/Common/OfflineBanner.tsx"
import { useDocumentTitle } from "@/hooks/useDocumentTitle.ts"

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
})
