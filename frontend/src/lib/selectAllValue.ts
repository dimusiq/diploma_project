/** Radix Select: пустой `value` у `SelectItem` недопустим — для «Все» используем sentinel. */
export const SELECT_ALL_VALUE = "__select_all__" as const

export function fromSelectAll(v: string): string {
  return v === SELECT_ALL_VALUE ? "" : v
}

export function toSelectAll(v: string): string {
  return v === "" ? SELECT_ALL_VALUE : v
}
