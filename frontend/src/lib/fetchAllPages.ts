/**
 * Догрузить все страницы списка с skip/limit (count — полный размер).
 * pageSize должен быть ≤ le бэкенда, иначе 422.
 */
export async function fetchAllPages<T>(options: {
  pageSize: number
  fetchPage: (
    skip: number,
    limit: number,
  ) => Promise<{ data: T[]; count: number }>
}): Promise<T[]> {
  const { pageSize, fetchPage } = options
  if (pageSize < 1) {
    throw new Error("pageSize должен быть ≥ 1")
  }
  const all: T[] = []
  let skip = 0
  for (;;) {
    const page = await fetchPage(skip, pageSize)
    const batch = page.data ?? []
    all.push(...batch)
    if (batch.length < pageSize) break
    if (typeof page.count === "number" && all.length >= page.count) break
    skip += pageSize
    if (skip > 50_000) break
  }
  return all
}
