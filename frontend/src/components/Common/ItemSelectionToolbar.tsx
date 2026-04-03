import { FiDownload, FiEdit3, FiPrinter, FiTruck, FiX } from "react-icons/fi"
import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"

interface ItemSelectionToolbarProps {
  selectedCount: number
  onClear: () => void
  onPrintShippingNote: () => void
  onMove: () => void
  onMassEdit?: () => void
  /** Экспорт только выбранных товаров (CSV/Excel). */
  onExportSelected?: (format: "csv" | "xlsx") => void
  isPrinting?: boolean
  isExporting?: boolean
}

export function ItemSelectionToolbar({
  selectedCount,
  onClear,
  onPrintShippingNote,
  onMove,
  onMassEdit,
  onExportSelected,
  isPrinting = false,
  isExporting = false,
}: ItemSelectionToolbarProps) {
  const active = selectedCount > 0

  return (
    <div
      className="mb-4 flex min-h-[52px] flex-wrap items-center gap-3 rounded-md bg-muted/50 p-3"
      style={{
        visibility: active ? "visible" : "hidden",
        pointerEvents: active ? "auto" : "none",
      }}
    >
      <p className="text-sm font-medium">Выбрано: {selectedCount}</p>
      <Button
        size="sm"
        variant="outline"
        onClick={onPrintShippingNote}
        disabled={isPrinting}
      >
        <span className="inline-flex items-center gap-2">
          <FiPrinter />
          Печать накладной
        </span>
      </Button>
      <Button size="sm" variant="outline" onClick={onMove}>
        <span className="inline-flex items-center gap-2">
          <FiTruck />
          Переместить
        </span>
      </Button>
      {onMassEdit && (
        <Button size="sm" variant="outline" onClick={onMassEdit}>
          <span className="inline-flex items-center gap-2">
            <FiEdit3 />
            Изменить выбранные
          </span>
        </Button>
      )}
      {onExportSelected && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={isExporting}>
              <span className="inline-flex items-center gap-2">
                <FiDownload />
                Выгрузить выбранные
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onExportSelected("csv")}>
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExportSelected("xlsx")}>
              Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button size="sm" variant="outline" onClick={onClear}>
        <span className="inline-flex items-center gap-2">
          <FiX />
          Снять выделение
        </span>
      </Button>
    </div>
  )
}
