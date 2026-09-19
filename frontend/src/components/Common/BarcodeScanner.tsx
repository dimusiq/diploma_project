import { useNavigate } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import {
  FiAlertCircle,
  FiBox,
  FiExternalLink,
  FiHash,
  FiLoader,
  FiMapPin,
} from "react-icons/fi"

import type { ScanResult } from "@/api/scan.ts"
import { scanApi } from "@/api/scan.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { getErrorHttpStatus } from "@/lib/apiClient.ts"
import { getItemStatusLabel } from "@/lib/statusLabels.ts"

interface BarcodeScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatStorageCell(loc: ScanResult["location"]): string | null {
  if (loc.storage_row == null) return null
  const parts = [`Ряд ${loc.storage_row}`]
  if (loc.storage_level != null) parts.push(`ур. ${loc.storage_level}`)
  if (loc.storage_cell_x != null) parts.push(`яч. ${loc.storage_cell_x}`)
  return parts.join(", ")
}

export function BarcodeScanner({ open, onOpenChange }: BarcodeScannerProps) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate({ from: "/" })

  const reset = useCallback(() => {
    setCode("")
    setResult(null)
    setError(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset()
      onOpenChange(next)
    },
    [onOpenChange, reset],
  )

  const doLookup = useCallback(async () => {
    const trimmed = code.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await scanApi.lookup(trimmed)
      setResult(data)
    } catch (err: unknown) {
      const status = getErrorHttpStatus(err)
      if (status === 404) {
        setError("Товар не найден по этому штрихкоду / артикулу")
      } else {
        setError("Ошибка при поиске. Попробуйте ещё раз.")
      }
    } finally {
      setLoading(false)
    }
  }, [code])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      doLookup()
    }
  }

  const goToItem = () => {
    if (!result) return
    handleOpenChange(false)
    navigate({ to: "/items", search: { open: result.item.id } })
  }

  const storageCell = result ? formatStorageCell(result.location) : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FiHash className="size-5" />
            Сканирование штрихкода
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {/* Input area */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Штрихкод или артикул (SKU)..."
              className="flex-1"
              autoFocus
              disabled={loading}
            />
            <Button onClick={doLookup} disabled={loading || !code.trim()} size="default">
              {loading ? (
                <FiLoader className="size-4 animate-spin" />
              ) : (
                "Найти"
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Отсканируйте штрихкод сканером или введите код / артикул вручную
          </p>

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <FiAlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Result card */}
          {result && (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              {/* Item header */}
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <FiBox className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-medium leading-tight">
                    {result.item.title}
                  </h4>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-xs">
                      {getItemStatusLabel(result.item.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {result.item.quantity} {result.item.unit ?? "шт."}
                    </span>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {result.item.sku && (
                  <>
                    <span className="text-muted-foreground">Артикул</span>
                    <span className="font-mono text-xs">{result.item.sku}</span>
                  </>
                )}
                {result.item.barcode && (
                  <>
                    <span className="text-muted-foreground">Штрихкод</span>
                    <span className="font-mono text-xs">{result.item.barcode}</span>
                  </>
                )}
                {result.location.category && (
                  <>
                    <span className="text-muted-foreground">Категория</span>
                    <span>{result.location.category}</span>
                  </>
                )}
              </div>

              {/* Location */}
              {(result.location.location || storageCell) && (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-sm">
                  <FiMapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {result.location.location}
                    {result.location.location && storageCell ? " — " : ""}
                    {storageCell}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  onClick={goToItem}
                >
                  <FiExternalLink className="size-3.5" />
                  Открыть товар
                </Button>
                <Button variant="outline" size="sm" onClick={reset}>
                  Новый поиск
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
