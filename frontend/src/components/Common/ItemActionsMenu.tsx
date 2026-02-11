import { IconButton } from '@chakra-ui/react';
import { BsThreeDotsVertical } from 'react-icons/bs';
import { ItemsService, type ItemPublic } from '@/client';
import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '../ui/menu';
import EditItem from '../Items/EditItem';
import DeleteItem from '../Items/DeleteItem';
import ItemHistoryDialog from '../Items/ItemHistoryDialog';

interface ItemActionsMenuProps {
  item: ItemPublic;
}

export const ItemActionsMenu = ({
  item,
}: ItemActionsMenuProps) => {
  const queryClient = useQueryClient();
  const move = useMutation({
    mutationFn: (
      status: 'incoming' | 'warehouse' | 'shipment'
    ) =>
      ItemsService.updateItem({
        id: item.id,
        requestBody: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['items'],
      });
    },
  });

  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <IconButton variant='ghost' color='inherit'>
          <BsThreeDotsVertical />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem
          value='incoming'
          onClick={() => move.mutate('incoming')}
        >
          В Поступления
        </MenuItem>
        <MenuItem
          value='warehouse'
          onClick={() => move.mutate('warehouse')}
        >
          На Склад
        </MenuItem>
        <MenuItem
          value='shipment'
          onClick={() => move.mutate('shipment')}
        >
          В Отгрузку
        </MenuItem>
        <ItemHistoryDialog item={item} />
        <EditItem item={item} />
        <DeleteItem id={item.id} />
      </MenuContent>
    </MenuRoot>
  );
};
