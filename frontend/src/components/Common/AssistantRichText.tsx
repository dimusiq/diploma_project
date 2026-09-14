import { Link as RouterLink } from "@tanstack/react-router"
import { parseSlotKeyZeroBased } from "@/components/warehouse3d/twin3dDerived.ts"
import type { ReactNode } from "react"

const SLOT_RE = /\b(\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3})\b/g

/**
 * Текст ассистента: ключи ячеек `0-0-0-0` открывают 3D склад.
 */
export function AssistantRichText({
  text,
  children,
}: {
  text: string
  children?: ReactNode
}) {
  const nodes: ReactNode[] = []
  let last = 0
  SLOT_RE.lastIndex = 0
  const matches = [...text.matchAll(SLOT_RE)]
  matches.forEach((m, i) => {
    const idx = m.index ?? 0
    if (idx > last) {
      nodes.push(text.slice(last, idx))
    }
    const slotKey = m[1]!
    const parsed = parseSlotKeyZeroBased(slotKey)
    if (parsed) {
      nodes.push(
        <RouterLink
          key={`${slotKey}-${i}`}
          to="/warehouse-3d"
          search={{
            row: parsed[0] + 1,
            level: parsed[1] + 1,
            cellX: parsed[2] + 1,
            cellZ: parsed[3] + 1,
          }}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {slotKey}
        </RouterLink>,
      )
    } else {
      nodes.push(slotKey)
    }
    last = idx + m[0].length
  })
  if (last < text.length) nodes.push(text.slice(last))
  return (
    <>
      {nodes}
      {children}
    </>
  )
}
