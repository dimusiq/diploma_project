import { useOptimistic } from "react"
import type { ItemPublic } from "@/client/index.ts"

export type OptimisticRemove = { type: "remove"; ids: string[] }

function optimisticItemsReducer(
  current: ItemPublic[],
  optimistic: OptimisticRemove,
): ItemPublic[] {
  if (optimistic.type === "remove") {
    return current.filter((item) => !optimistic.ids.includes(item.id))
  }
  return current
}

/**
 * Оптимистичное обновление списка товаров при перемещении (удалении из текущего списка).
 * При вызове addOptimisticRemove(ids) элементы сразу исчезают из списка;
 * после завершения мутации (успех или ошибка) React подставляет актуальные данные.
 */
export function useOptimisticItems(items: ItemPublic[]) {
  const [optimisticItems, addOptimistic] = useOptimistic(
    items,
    optimisticItemsReducer,
  )
  const addOptimisticRemove = (ids: string[]) =>
    addOptimistic({ type: "remove", ids })
  return [optimisticItems, addOptimisticRemove] as const
}
