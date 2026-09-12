import { z } from "zod"

/** Query `?page=2` приходит строкой — без coerce страница всегда сбрасывается на 1. */
export const pageNumberSearch = z.coerce.number().int().min(1).catch(1)

export const boolQuerySearch = z.preprocess((v) => {
  if (v === true || v === "true" || v === 1 || v === "1") return true
  if (v === false || v === "false" || v === 0 || v === "0") return false
  return v
}, z.boolean().catch(false))
