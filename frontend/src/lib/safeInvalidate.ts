import type { QueryClient, QueryKey } from "@tanstack/react-query"

/**
 * invalidateQueries может отклонить промис при throwOnError у запросов;
 * для фоновых инвалидаций (SSE и т.д.) это не должно давать Uncaught (in promise).
 */
export function safeInvalidateQueries(
  queryClient: QueryClient,
  filters: { queryKey: QueryKey },
): void {
  void queryClient.invalidateQueries(filters).catch(() => {
    /* игнорируем сбой фонового refetch */
  })
}
