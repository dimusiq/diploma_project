import { Box, Table, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiClock } from "react-icons/fi"
import { type ItemPublic, ItemsService } from "@/client/index.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../ui/dialog.tsx"
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
          {isLoading && <Text>Загрузка…</Text>}
          {!isLoading && rows.length === 0 && (
            <Text color="gray.500">Изменений пока нет.</Text>
          )}
          {!isLoading && rows.length > 0 && (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Когда</Table.ColumnHeader>
                  <Table.ColumnHeader>Поле</Table.ColumnHeader>
                  <Table.ColumnHeader>Было</Table.ColumnHeader>
                  <Table.ColumnHeader>Стало</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((h) => (
                  <Table.Row key={h.id}>
                    <Table.Cell>{formatDate(h.changed_at)}</Table.Cell>
                    <Table.Cell>{label(h.field_name)}</Table.Cell>
                    <Table.Cell title={h.old_value} maxW="120px" truncate>
                      {h.old_value || "—"}
                    </Table.Cell>
                    <Table.Cell title={h.new_value} maxW="120px" truncate>
                      {h.new_value || "—"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
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
      <Box as={FiClock} mr="2" />
      История
    </MenuItem>
  )
}
