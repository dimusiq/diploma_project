import {
  Button,
  ButtonGroup,
  DialogActionTrigger,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { FaExchangeAlt } from 'react-icons/fa';

import { type ApiError, type ItemPublic, type ItemUpdate, CategoriesService, ItemsService } from '@/client';
import useCustomToast from '@/hooks/useCustomToast';
import { handleError } from '@/utils';
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Field } from '../ui/field';

interface EditItemProps {
  item: ItemPublic;
}

const EditItem = ({ item }: EditItemProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { showSuccessToast } = useCustomToast();
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesService.readCategories(),
  });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ItemUpdate>({
    mode: 'onBlur',
    criteriaMode: 'all',
    defaultValues: {
      title: item.title,
      description: item.description ?? undefined,
      quantity: item.quantity ?? 1,
      sku: item.sku ?? undefined,
      barcode: item.barcode ?? undefined,
      unit: item.unit ?? undefined,
      expires_at: item.expires_at ?? undefined,
      location: item.location ?? undefined,
      category_id: item.category_id ?? undefined,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: item.title,
        description: item.description ?? undefined,
        quantity: item.quantity ?? 1,
        sku: item.sku ?? undefined,
        barcode: item.barcode ?? undefined,
        unit: item.unit ?? undefined,
        expires_at: item.expires_at ?? undefined,
        location: item.location ?? undefined,
        category_id: item.category_id ?? undefined,
      });
    }
  }, [isOpen, item, reset]);

  const mutation = useMutation({
    mutationFn: (data: ItemUpdate) =>
      ItemsService.updateItem({ id: item.id, requestBody: data }),
    onSuccess: () => {
      showSuccessToast('Поступление успешно обновлено.');
      reset();
      setIsOpen(false);
    },
    onError: (err: ApiError) => {
      handleError(err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  const onSubmit: SubmitHandler<ItemUpdate> = (data) => {
    const body: ItemUpdate = {
      ...data,
      quantity: (typeof data.quantity === 'number' && data.quantity >= 1) ? data.quantity : undefined,
      category_id: data.category_id && data.category_id !== '' ? data.category_id : null,
      expires_at: data.expires_at && data.expires_at !== '' ? data.expires_at : null,
    };
    mutation.mutate(body);
  };

  return (
    <DialogRoot
      size={{ base: 'xs', md: 'lg' }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button variant="ghost">
          <FaExchangeAlt fontSize="16px" />
          Изменить поступление
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Изменить поступление</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>Обновите поля ниже.</Text>
            <VStack gap={4}>
              <Field required invalid={!!errors.title} errorText={errors.title?.message} label="Название">
                <Input id="title" {...register('title', { required: 'Название обязательно.' })} placeholder="Название" type="text" />
              </Field>
              <Field invalid={!!errors.description} errorText={errors.description?.message} label="Описание">
                <Input id="description" {...register('description')} placeholder="Описание" type="text" />
              </Field>
              <Field invalid={!!errors.quantity} errorText={errors.quantity?.message} label="Количество">
                <Input id="quantity" {...register('quantity', { valueAsNumber: true, min: { value: 1, message: 'Минимум 1' } })} type="number" min={1} />
              </Field>
              <Field invalid={!!errors.sku} errorText={errors.sku?.message} label="Артикул (SKU)">
                <Input id="sku" {...register('sku')} placeholder="Артикул" type="text" />
              </Field>
              <Field invalid={!!errors.barcode} errorText={errors.barcode?.message} label="Штрихкод">
                <Input id="barcode" {...register('barcode')} placeholder="Штрихкод" type="text" />
              </Field>
              <Field invalid={!!errors.unit} errorText={errors.unit?.message} label="Ед. измерения">
                <Input id="unit" {...register('unit')} placeholder="шт, кг, л" type="text" />
              </Field>
              <Field label="Категория">
                <select
                  id="category_id"
                  {...register('category_id')}
                  value={watch('category_id') ?? ''}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <option value="">Выберите категорию</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field invalid={!!errors.expires_at} errorText={errors.expires_at?.message} label="Срок годности">
                <Input id="expires_at" {...register('expires_at')} type="date" />
              </Field>
              <Field invalid={!!errors.location} errorText={errors.location?.message} label="Ячейка/зона">
                <Input id="location" {...register('location')} placeholder="Зона склада" type="text" />
              </Field>
            </VStack>
          </DialogBody>
          <DialogFooter gap={2}>
            <ButtonGroup>
              <DialogActionTrigger asChild>
                <Button variant="subtle" colorPalette="gray" disabled={isSubmitting}>Отменить</Button>
              </DialogActionTrigger>
              <Button variant="solid" type="submit" loading={isSubmitting}>Сохранить</Button>
            </ButtonGroup>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
};

export default EditItem;
