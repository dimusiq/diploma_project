import { Box, Button, ButtonGroup, IconButton, Text } from '@chakra-ui/react';
import { useNavigate } from '@tanstack/react-router';
import { FiCopy, FiBox, FiPrinter } from 'react-icons/fi';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { ItemsService, type ItemPublic } from '@/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '../ui/menu';
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import { openLabelPdf } from '@/api/printPdf';
import useCustomToast from '@/hooks/useCustomToast';
import { getAllowedNextStatuses, getStatusLabel } from '@/utils/statusTransitions';
import EditItem from '../Items/EditItem';
import DeleteItem from '../Items/DeleteItem';
import ItemHistoryDialog from '../Items/ItemHistoryDialog';

interface ItemActionsMenuProps {
  item: ItemPublic;
}

export const ItemActionsMenu = ({ item }: ItemActionsMenuProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showErrorToast, showSuccessToast } = useCustomToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTargetStatus, setConfirmTargetStatus] = useState<string | null>(null);

  const allowedNext = getAllowedNextStatuses(item.status);

  const duplicateItem = useMutation({
    mutationFn: () =>
      ItemsService.createItem({
        requestBody: {
          title: item.title,
          description: item.description ?? undefined,
          quantity: item.quantity,
          sku: item.sku ?? undefined,
          barcode: item.barcode ?? undefined,
          unit: item.unit ?? undefined,
          expires_at: item.expires_at ?? undefined,
          location: item.location ?? undefined,
          category_id: item.category_id ?? undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      showSuccessToast('Товар скопирован');
    },
    onError: (e: Error) => {
      showErrorToast(e.message || 'Ошибка при копировании товара');
    },
  });

  const handlePrintLabel = async () => {
    try {
      await openLabelPdf(item.id);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Ошибка печати этикетки');
    }
  };

  const move = useMutation({
    mutationFn: (status: string) =>
      ItemsService.updateItem({
        id: item.id,
        requestBody: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setConfirmOpen(false);
      setConfirmTargetStatus(null);
    },
    onError: (e: Error) => {
      showErrorToast(e.message || 'Ошибка при перемещении');
    },
  });

  const openConfirm = (targetStatus: string) => {
    setConfirmTargetStatus(targetStatus);
    setConfirmOpen(true);
  };

  const handleConfirmMove = () => {
    if (confirmTargetStatus) move.mutate(confirmTargetStatus);
  };

  const targetLabel = confirmTargetStatus ? getStatusLabel(confirmTargetStatus) : '';

  const hasStorageCell =
    item.storage_row != null &&
    item.storage_level != null &&
    item.storage_cell_x != null;
  const warehouse3dSearch = hasStorageCell
    ? {
        row: item.storage_row,
        level: item.storage_level,
        cellX: item.storage_cell_x,
        cellZ: item.storage_cell_z ?? 1,
      }
    : null;

  return (
    <>
      <MenuRoot>
        <MenuTrigger asChild>
          <IconButton variant="ghost" color="inherit" aria-label="Действия с товаром">
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
              onClick={() => navigate({ to: '/warehouse-3d', search: warehouse3dSearch })}
            >
              <Box as={FiBox} mr="2" />
              Показать на складе 3D
            </MenuItem>
          )}
          <MenuItem
            value="duplicate"
            onClick={() => duplicateItem.mutate()}
            disabled={duplicateItem.isPending}
          >
            <Box as={FiCopy} mr="2" />
            Дублировать
          </MenuItem>
          <ItemHistoryDialog item={item} />
          <EditItem item={item} />
          <DeleteItem id={item.id} />
        </MenuContent>
      </MenuRoot>

      <DialogRoot open={confirmOpen} onOpenChange={(e) => setConfirmOpen(e.open)}>
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
    </>
  );
};
