import { Button, Flex, Text } from "@chakra-ui/react"
import { FiDownload, FiEdit3, FiPrinter, FiTruck, FiX } from "react-icons/fi"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu.tsx"

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
    <Flex
      gap={3}
      mb={4}
      p={3}
      bg="bg.subtle"
      borderRadius="md"
      align="center"
      flexWrap="wrap"
      // Важно: панель не должна "вставляться" в поток и сдвигать таблицу вниз.
      // Держим постоянную высоту и просто прячем содержимое, пока ничего не выбрано.
      minH="52px"
      visibility={active ? "visible" : "hidden"}
      pointerEvents={active ? "auto" : "none"}
    >
      <Text fontSize="sm" fontWeight="medium">
        Выбрано: {selectedCount}
      </Text>
      <Button
        size="sm"
        variant="outline"
        onClick={onPrintShippingNote}
        disabled={isPrinting}
      >
        <Flex as="span" gap={2} align="center">
          <FiPrinter />
          Печать накладной
        </Flex>
      </Button>
      <Button size="sm" variant="outline" onClick={onMove}>
        <Flex as="span" gap={2} align="center">
          <FiTruck />
          Переместить
        </Flex>
      </Button>
      {onMassEdit && (
        <Button size="sm" variant="outline" onClick={onMassEdit}>
          <Flex as="span" gap={2} align="center">
            <FiEdit3 />
            Изменить выбранные
          </Flex>
        </Button>
      )}
      {onExportSelected && (
        <MenuRoot>
          <MenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
            >
              <Flex as="span" gap={2} align="center">
                <FiDownload />
                Выгрузить выбранные
              </Flex>
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              value="csv"
              onClick={() => onExportSelected("csv")}
            >
              CSV
            </MenuItem>
            <MenuItem
              value="xlsx"
              onClick={() => onExportSelected("xlsx")}
            >
              Excel
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      )}
      <Button size="sm" variant="ghost" onClick={onClear}>
        <Flex as="span" gap={2} align="center">
          <FiX />
          Снять выделение
        </Flex>
      </Button>
    </Flex>
  )
}
