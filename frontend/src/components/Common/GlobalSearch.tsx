import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { FiBox, FiClipboard, FiSearch, FiTool } from "react-icons/fi"
import { OpenAPI } from "@/client/index.ts"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"

interface SearchResult {
  items: Array<{ id: string; title: string; sku?: string }>
  equipment: Array<{ id: string; name: string; serial_number?: string }>
  work_orders: Array<{ id: string; title: string; status?: string }>
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate({ from: "/" })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return }
    setLoading(true)
    try {
      const token = typeof OpenAPI.TOKEN === "function" ? await OpenAPI.TOKEN({} as any) : OpenAPI.TOKEN
      const base = OpenAPI.BASE || ""
      const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setResults(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  const go = (path: string) => {
    setOpen(false)
    setQuery("")
    setResults(null)
    navigate({ to: path })
  }

  const hasResults = results && (results.items.length > 0 || results.equipment.length > 0 || results.work_orders.length > 0)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <FiSearch className="size-4" />
        <span className="hidden sm:inline">Поиск...</span>
        <kbd className="pointer-events-none hidden select-none rounded border bg-muted px-1.5 font-mono text-xs sm:inline-block">
          ⌘K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Поиск</DialogTitle>
          <div className="flex items-center border-b px-3">
            <FiSearch className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Поиск товаров, техники, заявок..."
              className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
              autoFocus
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {loading && <p className="p-4 text-center text-sm text-muted-foreground">Поиск...</p>}
            {!loading && query.length >= 2 && !hasResults && (
              <p className="p-4 text-center text-sm text-muted-foreground">Ничего не найдено</p>
            )}
            {!loading && query.length < 2 && (
              <p className="p-4 text-center text-sm text-muted-foreground">Введите минимум 2 символа</p>
            )}
            {hasResults && (
              <>
                {results.items.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Товары</p>
                    {results.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        onClick={() => go(`/items?open=${item.id}`)}
                      >
                        <FiBox className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{item.title}</span>
                        {item.sku && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{item.sku}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {results.equipment.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Техника</p>
                    {results.equipment.map((eq) => (
                      <button
                        key={eq.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        onClick={() => go(`/technique`)}
                      >
                        <FiTool className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{eq.name}</span>
                        {eq.serial_number && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{eq.serial_number}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {results.work_orders.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Наряд-заказы</p>
                    {results.work_orders.map((wo) => (
                      <button
                        key={wo.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        onClick={() => go(`/technique/work-orders`)}
                      >
                        <FiClipboard className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{wo.title}</span>
                        {wo.status && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{wo.status}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
