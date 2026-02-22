import { getRouteApi } from "@tanstack/react-router"
import type { UserPublic } from "@/client/index.ts"

const layoutRouteApi = getRouteApi("/_layout")

/**
 * Контекст маршрута _layout: user загружается в beforeLoad, queryClient из корня роутера.
 */
export type LayoutRouteContext = {
  user: UserPublic
  queryClient: import("@tanstack/react-query").QueryClient
}

/**
 * Общие данные layout-маршрута (user, queryClient). Только внутри маршрутов под /_layout.
 */
export function useLayoutRouteContext(): LayoutRouteContext {
  return layoutRouteApi.useRouteContext()
}

/**
 * Текущий пользователь из контекста маршрута _layout.
 * Вызывать только внутри защищённых страниц (под _layout).
 */
export function useCurrentUser(): UserPublic {
  const { user } = layoutRouteApi.useRouteContext()
  return user
}
