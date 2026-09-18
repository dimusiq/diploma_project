import { Link as RouterLink } from "@tanstack/react-router"
import { parseSlotKeyZeroBased } from "@/components/warehouse3d/twin3dDerived.ts"
import type { BlockNode, InlineNode } from "@/lib/assistantMarkdown.ts"
import { parseAssistantMarkdown } from "@/lib/assistantMarkdown.ts"
import type { ReactNode } from "react"

function SlotLink({ slotKey }: { slotKey: string }) {
  const parsed = parseSlotKeyZeroBased(slotKey)
  if (!parsed) return slotKey
  return (
    <RouterLink
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
    </RouterLink>
  )
}

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`
    if (n.type === "text") return <span key={key}>{n.value}</span>
    if (n.type === "code") {
      return (
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {n.value}
        </code>
      )
    }
    if (n.type === "bold") {
      return <strong key={key}>{renderInline(n.children, key)}</strong>
    }
    if (n.type === "link") {
      return (
        <a
          key={key}
          href={n.href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {renderInline(n.children, key)}
        </a>
      )
    }
    return <SlotLink key={key} slotKey={n.key} />
  })
}

function renderBlocks(blocks: BlockNode[]): ReactNode {
  return blocks.map((b, i) => {
    const key = `b-${i}`
    if (b.type === "p") {
      return (
        <p key={key} className="whitespace-pre-wrap">
          {renderInline(b.children, key)}
        </p>
      )
    }
    if (b.type === "h") {
      const cls =
        b.level === 1
          ? "text-base font-semibold"
          : b.level === 2
            ? "text-sm font-semibold"
            : "text-sm font-medium"
      return (
        <p key={key} className={cls}>
          {renderInline(b.children, key)}
        </p>
      )
    }
    if (b.type === "pre") {
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.8em] leading-relaxed"
        >
          {b.value}
        </pre>
      )
    }
    const List = b.type === "ul" ? "ul" : "ol"
    return (
      <List
        key={key}
        className={
          b.type === "ul"
            ? "list-disc space-y-1 pl-5"
            : "list-decimal space-y-1 pl-5"
        }
      >
        {b.items.map((item, j) => (
          <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
        ))}
      </List>
    )
  })
}

/**
 * Текст ассистента: markdown (заголовки, списки, код) и ключи ячеек `0-0-0-0` → 3D склад.
 */
export function AssistantRichText({
  text,
  children,
}: {
  text: string
  children?: ReactNode
}) {
  const blocks = parseAssistantMarkdown(text)
  return (
    <div className="space-y-2">
      {renderBlocks(blocks)}
      {children}
    </div>
  )
}
