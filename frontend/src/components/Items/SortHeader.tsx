import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { TableHead } from "@/components/ui/table.tsx"

export type SortField =
  | "title"
  | "created_at"
  | "quantity"
  | "sku"
  | "description"
  | "unit"

interface SortHeaderProps {
  field: SortField
  label: string
  currentField?: string
  currentOrder?: "asc" | "desc"
  onSort: (field: SortField) => void
}

export function SortHeader({
  field,
  label,
  currentField,
  currentOrder,
  onSort,
}: SortHeaderProps) {
  return (
    <TableHead
      className="w-32 cursor-pointer select-none whitespace-nowrap hover:bg-muted/80 dark:hover:bg-muted/40"
      onClick={() => onSort(field)}
    >
      {label}
      {currentField === field ? (
        currentOrder === "desc" ? (
          <FiChevronDown className="ml-1 inline size-4" />
        ) : (
          <FiChevronUp className="ml-1 inline size-4" />
        )
      ) : null}
    </TableHead>
  )
}
