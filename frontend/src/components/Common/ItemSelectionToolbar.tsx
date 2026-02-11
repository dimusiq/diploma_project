import { Button, Flex, Text } from '@chakra-ui/react';
import { FiPrinter, FiTruck, FiX } from 'react-icons/fi';

interface ItemSelectionToolbarProps {
  selectedCount: number;
  onClear: () => void;
  onPrintShippingNote: () => void;
  onMove: () => void;
  isPrinting?: boolean;
}

export function ItemSelectionToolbar({
  selectedCount,
  onClear,
  onPrintShippingNote,
  onMove,
  isPrinting = false,
}: ItemSelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <Flex
      gap={3}
      mb={4}
      p={3}
      bg="bg.subtle"
      borderRadius="md"
      align="center"
      flexWrap="wrap"
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
      <Button size="sm" variant="ghost" onClick={onClear}>
        <Flex as="span" gap={2} align="center">
          <FiX />
          Снять выделение
        </Flex>
      </Button>
    </Flex>
  );
}
