import {
  Box,
  Button,
  ButtonGroup,
  Flex,
  IconButton,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiBox, FiCopy, FiPrinter } from "react-icons/fi"
import { openLabelPdf } from "@/api/printPdf.ts"
import { type ItemPublic, ItemsService } from "@/client/index.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Field } from "@/components/ui/field.tsx"
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
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/menu.tsx"

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

  const { data: allItemsData } = useQuery({
    queryKey: ["items", "all-for-warehouse-3d"],
    queryFn: () => ItemsService.readItems({ skip: 0, limit: 1000 }),
    enabled: duplicateDialogOpen,
  })

  const occupiedCellKeys = useMemo(() => {
    const items = allItemsData?.data ?? []
    const set = new Set<string>()
    items.forEach((i) => {
      const r = i.storage_row
      const l = i.storage_level
      const x = i.storage_cell_x
      const z = i.storage_cell_z
      if (r != null && l != null && x != null && z != null) {
        set.add(`${r}-${l}-${x}-${z}`)
      }
    })
    return set
  }, [allItemsData?.data])

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
      queryClient.invalidateQueries({ queryKey: ["items"] })
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
    mutationFn: (status: string) =>
      ItemsService.updateItem({
        id: item.id,
        requestBody: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
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
      <MenuRoot>
        <MenuTrigger asChild>
          <IconButton
            variant="ghost"
            color="inherit"
            aria-label="Действия с товаром"
          >
            <BsThreeDotsVertical />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          {allowedNext.map((status) => (
            <MenuItem
              key={status}
              value={status}
              onClick={() => openConfirm(status)}
            >
              В {getStatusLabel(status)}
            </MenuItem>
          ))}
          <MenuItem value="print-label" onClick={handlePrintLabel}>
            <Box as={FiPrinter} mr="2" />
            Печать этикетки
          </MenuItem>
          {warehouse3dSearch && (
            <MenuItem
              value="warehouse-3d"
              onClick={() =>
                navigate({ to: "/warehouse-3d", search: warehouse3dSearch })
              }
            >
              <Box as={FiBox} mr="2" />
              Показать на складе 3D
            </MenuItem>
          )}
          <MenuItem
            value="duplicate"
            onClick={() => {
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
            <Box as={FiCopy} mr="2" />
            Дублировать
          </MenuItem>
          <ItemHistoryDialogMenuItem
            item={item}
            onOpen={() => setHistoryDialogOpen(true)}
          />
          <EditItem item={item} />
          <DeleteItem id={item.id} />
        </MenuContent>
      </MenuRoot>

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
            <Text>
              Переместить «{item.title}» в раздел «{targetLabel}»?
            </Text>
          </DialogBody>
          <DialogFooter>
            <ButtonGroup>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={handleConfirmMove}
                loading={move.isPending}
                disabled={move.isPending}
              >
                Переместить
              </Button>
            </ButtonGroup>
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
            <Text fontSize="sm" color="fg.muted" mb={3}>
              Выберите ячейку на складе для дубликата «{item.title}».
            </Text>
            <Flex gap={3} flexWrap="wrap">
              <Field label="Ряд (1–12)">
                <select
                  value={duplicateCell.storage_row}
                  onChange={(e) =>
                    setDuplicateCell((c) => ({
                      ...c,
                      storage_row: Number(e.target.value),
                    }))
                  }
                  style={{
                    width: "100%",
                    minWidth: "80px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--chakra-colors-border)",
                  }}
                >
                  {Array.from({ length: STORAGE_ROWS }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Уровень (1–4)">
                <select
                  value={duplicateCell.storage_level}
                  onChange={(e) =>
                    setDuplicateCell((c) => ({
                      ...c,
                      storage_level: Number(e.target.value),
                    }))
                  }
                  style={{
                    width: "100%",
                    minWidth: "80px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--chakra-colors-border)",
                  }}
                >
                  {Array.from({ length: STORAGE_LEVELS }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Позиция (1–20)">
                <select
                  value={duplicateCell.storage_cell_x}
                  onChange={(e) =>
                    setDuplicateCell((c) => ({
                      ...c,
                      storage_cell_x: Number(e.target.value),
                    }))
                  }
                  style={{
                    width: "100%",
                    minWidth: "100px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--chakra-colors-border)",
                  }}
                >
                  {Array.from(
                    { length: STORAGE_CELLS_LENGTH },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </Flex>
            {isCellOccupied && (
              <Text fontSize="sm" color="red.500" mt={2} fontWeight="medium">
                Ячейка занята. Выберите другую ячейку.
              </Text>
            )}
          </DialogBody>
          <DialogFooter>
            <ButtonGroup>
              <Button
                variant="outline"
                onClick={() => setDuplicateDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button
                onClick={() => duplicateItem.mutate(duplicateCell)}
                loading={duplicateItem.isPending}
                disabled={duplicateItem.isPending || isCellOccupied}
              >
                Создать дубликат
              </Button>
            </ButtonGroup>
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
