import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiClock } from "react-icons/fi"
import { type ItemPublic, ItemsService } from "@/client/index.ts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../ui/app-dialog.tsx"
import { MenuItem } from "../ui/menu.tsx"

const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  description: "Описание",
  quantity: "Количество",
  sku: "Артикул",
  barcode: "Штрихкод",
  unit: "Ед. измерения",
  expires_at: "Срок годности",
  location: "Ячейка/зона",
  status: "Статус",
  category_id: "Категория",
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString("ru-RU")
  } catch {
    return s
  }
}

interface ItemHistoryDialogProps {
  item: ItemPublic
  /** Управление извне (чтобы диалог не размонтировался при закрытии меню). */
  open?: boolean
  onOpenChange?: (e: { open: boolean }) => void
}

export default function ItemHistoryDialog({
  item,
  open: controlledOpen,
  onOpenChange,
}: ItemHistoryDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined && onOpenChange != null
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled
    ? (o: boolean) => onOpenChange?.({ open: o })
    : setInternalOpen

  const { data, isLoading } = useQuery({
    queryKey: ["item-history", item.id],
    queryFn: () => ItemsService.readItemHistory({ id: item.id }),
    enabled: open,
  })

  const rows = data?.data ?? []
  const label = (f: string) => FIELD_LABELS[f] ?? f

  return (
    <DialogRoot open={open} onOpenChange={({ open: o }) => setOpen(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>История изменений: {item.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isLoading && <p className="text-sm">Загрузка…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Изменений пока нет.</p>
          )}
          {!isLoading && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead>
                  <TableHead>Поле</TableHead>
                  <TableHead>Было</TableHead>
                  <TableHead>Стало</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatDate(h.changed_at)}</TableCell>
                    <TableCell>{label(h.field_name)}</TableCell>
                    <TableCell
                      className="max-w-[120px] truncate"
                      title={h.old_value}
                    >
                      {h.old_value || "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[120px] truncate"
                      title={h.new_value}
                    >
                      {h.new_value || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogBody>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

/** Пункт меню «История» — рендерить в меню; диалог рендерить снаружи с open/onOpenChange. */
export function ItemHistoryDialogMenuItem({
  item: _item,
  onOpen,
}: {
  item: ItemPublic
  onOpen: () => void
}) {
  return (
    <MenuItem value="history" onClick={onOpen}>
      <FiClock className="mr-2 inline size-4 shrink-0" />
      История
    </MenuItem>
  )
}
