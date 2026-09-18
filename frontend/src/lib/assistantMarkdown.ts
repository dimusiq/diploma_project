export type InlineNode =
  | { type: "text"; value: string }
  | { type: "slot"; key: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] }

export type BlockNode =
  | { type: "p"; children: InlineNode[] }
  | { type: "h"; level: 1 | 2 | 3; children: InlineNode[] }
  | { type: "ul"; items: InlineNode[][] }
  | { type: "ol"; items: InlineNode[][] }
  | { type: "pre"; value: string }

function isSlotKey(slotKey: string): boolean {
  const parts = slotKey.trim().split("-")
  if (parts.length !== 4) return false
  return parts.every((p) => Number.isInteger(Number(p)))
}

const INLINE_RE =
  /`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)|\*\*([^*]+)\*\*|\b(\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3})\b/g

export function parseInline(text: string, allowBold = true): InlineNode[] {
  const nodes: InlineNode[] = []
  const re = allowBold
    ? INLINE_RE
    : /`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)|\b(\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3})\b/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) nodes.push({ type: "text", value: text.slice(last, idx) })
    if (m[1]) {
      nodes.push({ type: "code", value: m[1] })
    } else if (m[2] && m[3]) {
      nodes.push({
        type: "link",
        href: m[3],
        children: parseInline(m[2], false),
      })
    } else if (allowBold && m[4]) {
      nodes.push({ type: "bold", children: parseInline(m[4], false) })
    } else {
      const slot = allowBold ? m[5] : m[4]
      if (slot && isSlotKey(slot)) {
        nodes.push({ type: "slot", key: slot })
      } else if (slot) {
        nodes.push({ type: "text", value: slot })
      }
    }
    last = idx + m[0].length
  }
  if (last < text.length) nodes.push({ type: "text", value: text.slice(last) })
  return nodes.length ? nodes : [{ type: "text", value: text }]
}

function isHeading(line: string): RegExpExecArray | null {
  return /^(#{1,3})\s+(.+)$/.exec(line)
}

function parseFlow(text: string, blocks: BlockNode[]) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i += 1
      continue
    }
    const heading = isHeading(line)
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3
      blocks.push({
        type: "h",
        level,
        children: parseInline(heading[2]!),
      })
      i += 1
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: InlineNode[][] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(/^\s*[-*]\s+/, "")))
        i += 1
      }
      blocks.push({ type: "ul", items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: InlineNode[][] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(/^\s*\d+\.\s+/, "")))
        i += 1
      }
      blocks.push({ type: "ol", items })
      continue
    }
    const para: string[] = [line]
    i += 1
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !isHeading(lines[i]!) &&
      !/^\s*[-*]\s+/.test(lines[i]!) &&
      !/^\s*\d+\.\s+/.test(lines[i]!)
    ) {
      para.push(lines[i]!)
      i += 1
    }
    blocks.push({ type: "p", children: parseInline(para.join("\n")) })
  }
}

export function parseAssistantMarkdown(text: string): BlockNode[] {
  const blocks: BlockNode[] = []
  const parts = text.split(/(```[\s\S]*?```)/g)
  for (const part of parts) {
    const fence = /^```[^\n]*\n?([\s\S]*?)```$/.exec(part)
    if (fence) {
      blocks.push({ type: "pre", value: fence[1]!.replace(/\n$/, "") })
      continue
    }
    parseFlow(part, blocks)
  }
  return blocks
}
