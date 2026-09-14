import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiBox, FiCopy, FiPrinter } from "react-icons/fi"
import { openLabelPdf } from "@/api/printPdf.ts"
import { type ItemPublic, ItemsService } from "@/client/index.ts"
import { fetchAllItems } from "@/lib/fetchAllItems.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import { Field } from "@/components/ui/field.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  getAllowedNextStatuses,
  getStatusLabel,
} from "@/utils/statusTransitions.ts"
import DeleteItem from "../Items/DeleteItem.tsx"
import EditItem from "../Items/EditItem.tsx"
import ItemHistoryDialog, {
  ItemHistoryDialogMenuItem,
} from "../Items/ItemHistoryDialog.tsx"

const STORAGE_ROWS = 12
const STORAGE_LEVELS = 4
const STORAGE_CELLS_LENGTH = 20

interface ItemActionsMenuProps {
  item: ItemPublic
}

interface StorageCell {
  storage_row: number
  storage_level: number
  storage_cell_x: number
  storage_cell_z: number
}

export const ItemActionsMenu = ({ item }: ItemActionsMenuProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTargetStatus, setConfirmTargetStatus] = useState<string | null>(
    null,
  )
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [duplicateCell, setDuplicateCell] = useState<StorageCell>(() => ({
    storage_row: item.storage_row ?? 1,
    storage_level: item.storage_level ?? 1,
    storage_cell_x: item.storage_cell_x ?? 1,
    storage_cell_z: item.storage_cell_z ?? 1,
  }))

  const allowedNext = getAllowedNextStatuses(item.status)

  const hasStorageCell =
    item.storage_row != null &&
    item.storage_level != null &&
    item.storage_cell_x != null

  const { data: allItems = [] } = useQuery({
    queryKey: ["items", "all-for-warehouse-3d"],
    queryFn: () => fetchAllItems(),
    enabled: duplicateDialogOpen,
  })

  const occupiedCellKeys = useMemo(() => {
    const set = new Set<string>()
    allItems.forEach((i) => {
      const r = i.storage_row
      const l = i.storage_level
      const x = i.storage_cell_x
      const z = i.storage_cell_z
      if (r != null && l != null && x != null && z != null) {
        set.add(`${r}-${l}-${x}-${z}`)
      }
    })
    return set
  }, [allItems])

  const duplicateCellKey = `${duplicateCell.storage_row}-${duplicateCell.storage_level}-${duplicateCell.storage_cell_x}-${duplicateCell.storage_cell_z ?? 1}`
  const isCellOccupied = occupiedCellKeys.has(duplicateCellKey)

  const duplicateItem = useMutation({
    mutationFn: (cell: StorageCell) => {
      const body: Parameters<typeof ItemsService.createItem>[0]["requestBody"] =
        {
          title: item.title,
          description: item.description ?? undefined,
          quantity: item.quantity,
          sku: item.sku ?? undefined,
          barcode: item.barcode ?? undefined,
          unit: item.unit ?? undefined,
          expires_at: item.expires_at ?? undefined,
          location: item.location ?? undefined,
          category_id: item.category_id ?? undefined,
          storage_row: cell.storage_row,
          storage_level: cell.storage_level,
          storage_cell_x: cell.storage_cell_x,
          storage_cell_z: cell.storage_cell_z,
        }
      return ItemsService.createItem({ requestBody: body })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["items"],
      })
      queryClient.invalidateQueries({
        queryKey: ["items", "all-for-warehouse-3d"],
      })
      setDuplicateDialogOpen(false)
      showSuccessToast("Товар скопирован")
    },
    onError: (e: Error) => {
      showErrorToast(e.message || "Ошибка при копировании товара")
    },
  })

  const handlePrintLabel = async () => {
    try {
      await openLabelPdf(item.id)
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Ошибка печати этикетки")
    }
  }

  const move = useMutation({
    mutationFn: (status: string) => {
      const body: Parameters<typeof ItemsService.updateItem>[0]["requestBody"] =
        { status }
      if (status === "warehouse") {
        body.storage_row = item.storage_row
        body.storage_level = item.storage_level
        body.storage_cell_x = item.storage_cell_x
        body.storage_cell_z = item.storage_cell_z ?? 1
      }
      return ItemsService.updateItem({
        id: item.id,
        requestBody: body,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["items"],
      })
      setConfirmOpen(false)
      setConfirmTargetStatus(null)
    },
    onError: (e: Error) => {
      showErrorToast(e.message || "Ошибка при перемещении")
    },
  })

  const openConfirm = (targetStatus: string) => {
    if (targetStatus === "warehouse" && !hasStorageCell) {
      showErrorToast(
        "Для перемещения на склад укажите ячейку хранения в карточке товара (Изменить поступление).",
      )
      return
    }
    setConfirmTargetStatus(targetStatus)
    setConfirmOpen(true)
  }

  const handleConfirmMove = () => {
    if (confirmTargetStatus) move.mutate(confirmTargetStatus)
  }

  const targetLabel = confirmTargetStatus
    ? getStatusLabel(confirmTargetStatus)
    : ""

  const warehouse3dSearch = hasStorageCell
    ? {
        row: item.storage_row,
        level: item.storage_level,
        cellX: item.storage_cell_x,
        cellZ: item.storage_cell_z ?? 1,
      }
    : null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-inherit"
            aria-label="Действия с товаром"
          >
            <BsThreeDotsVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {allowedNext.map((status) => (
            <DropdownMenuItem key={status} onSelect={() => openConfirm(status)}>
              В {getStatusLabel(status)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={handlePrintLabel}>
            <FiPrinter className="mr-2 inline size-4 shrink-0" />
            Печать этикетки
          </DropdownMenuItem>
          {warehouse3dSearch && (
            <DropdownMenuItem
              onSelect={() =>
                navigate({
                  to: "/warehouse-3d",
                  search: warehouse3dSearch,
                })
              }
            >
              <FiBox className="mr-2 inline size-4 shrink-0" />
              Показать на складе 3D
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setDuplicateCell({
                storage_row: item.storage_row ?? 1,
                storage_level: item.storage_level ?? 1,
                storage_cell_x: item.storage_cell_x ?? 1,
                storage_cell_z: item.storage_cell_z ?? 1,
              })
              setDuplicateDialogOpen(true)
            }}
            disabled={duplicateItem.isPending}
          >
            <FiCopy className="mr-2 inline size-4 shrink-0" />
            Дублировать
          </DropdownMenuItem>
          <ItemHistoryDialogMenuItem
            item={item}
            onOpen={() => setHistoryDialogOpen(true)}
          />
          <EditItem item={item} />
          <DeleteItem id={item.id} />
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogRoot
        open={confirmOpen}
        onOpenChange={(e) => setConfirmOpen(e.open)}
      >
        <DialogContent>
          <DialogCloseTrigger />
          <DialogHeader>
            <DialogTitle>Переместить товар</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Переместить «{item.title}» в раздел «{targetLabel}»?
            </p>
          </DialogBody>
          <DialogFooter>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(false)}
              >
                Отмена
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConfirmMove}
                loading={move.isPending}
                disabled={move.isPending}
              >
                Переместить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <DialogRoot
        open={duplicateDialogOpen}
        onOpenChange={(e) => setDuplicateDialogOpen(e.open)}
      >
        <DialogContent>
          <DialogCloseTrigger />
          <DialogHeader>
            <DialogTitle>Дублировать товар</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="mb-3 text-sm text-muted-foreground">
              Выберите ячейку на складе для дубликата «{item.title}».
            </p>
            <div className="flex flex-wrap gap-3">
              <Field label="Ряд (1–12)">
                <Select
                  value={String(duplicateCell.storage_row)}
                  onValueChange={(v) =>
                    setDuplicateCell((c) => ({
                      ...c,
                      storage_row: Number(v),
                    }))
                  }
                >
                  <SelectTrigger className="h-9 min-w-[80px] w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: STORAGE_ROWS }, (_, i) => i + 1).map(
                      (n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Уровень (1–4)">
                <Select
                  value={String(duplicateCell.storage_level)}
                  onValueChange={(v) =>
                    setDuplicateCell((c) => ({
                      ...c,
                      storage_level: Number(v),
                    }))
                  }
                >
                  <SelectTrigger className="h-9 min-w-[80px] w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: STORAGE_LEVELS },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Позиция (1–20)">
                <Select
                  value={String(duplicateCell.storage_cell_x)}
                  onValueChange={(v) =>
                    setDuplicateCell((c) => ({
                      ...c,
                      storage_cell_x: Number(v),
                    }))
                  }
                >
                  <SelectTrigger className="h-9 min-w-[100px] w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: STORAGE_CELLS_LENGTH },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {isCellOccupied && (
              <p className="mt-2 text-sm font-medium text-destructive">
                Ячейка занята. Выберите другую ячейку.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDuplicateDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => duplicateItem.mutate(duplicateCell)}
                loading={duplicateItem.isPending}
                disabled={duplicateItem.isPending || isCellOccupied}
              >
                Создать дубликат
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <ItemHistoryDialog
        item={item}
        open={historyDialogOpen}
        onOpenChange={({ open: o }) => setHistoryDialogOpen(o)}
      />
    </>
  )
}
