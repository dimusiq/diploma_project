import type { ItemPublic, ItemsPublic } from "@/client/index.ts"
import { ItemsService } from "@/client/index.ts"

const PAGE_SIZE = 500

/** Загружает все товары постранично (для 3D и отчётов). */
export async function fetchAllItems(
  status?: string,
): Promise<ItemPublic[]> {
  const all: ItemPublic[] = []
  let skip = 0
  for (;;) {
    const page: ItemsPublic = await ItemsService.readItems({
      skip,
      limit: PAGE_SIZE,
      status,
    })
    const batch = page.data ?? []
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    skip += PAGE_SIZE
    if (skip > 50_000) break
  }
  return all
}

/** Отпечаток списка для снимков истории (без полного JSON). */
export function itemsFingerprint(items: ItemPublic[]): string {
  return items
    .map(
      (i) =>
        `${i.id}\t${i.quantity ?? 1}\t${i.status}\t${i.storage_row ?? ""}\t${i.storage_level ?? ""}\t${i.storage_cell_x ?? ""}\t${i.storage_cell_z ?? ""}\t${i.expires_at ?? ""}\t${i.slot_key ?? ""}`,
    )
    .join("\n")
}
