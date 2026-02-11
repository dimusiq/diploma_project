import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Table,
  Text,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { CategoriesService, type UserPublic, UsersService, RolesService } from '@/client';
import AddUser from '@/components/Admin/AddUser';
import { ShortId } from '@/components/Common/ShortId';
import { UserActionsMenu } from '@/components/Common/UserActionsMenu';
import PendingUsers from '@/components/Pending/PendingUsers';
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from '@/components/ui/pagination.tsx';

const usersSearchSchema = z.object({
  page: z.number().catch(1),
});

const PER_PAGE = 5;

function getUsersQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      UsersService.readUsers({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
      }),
    queryKey: ['users', { page }],
  };
}

export const Route = createFileRoute('/_layout/admin')({
  component: Admin,
  validateSearch: (search) =>
    usersSearchSchema.parse(search),
});

function UsersTable() {
  const queryClient = useQueryClient();
  const currentUser = queryClient.getQueryData<UserPublic>([
    'currentUser',
  ]);
  const navigate = useNavigate({ from: Route.fullPath });
  const { page } = Route.useSearch();

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => RolesService.readRoles(),
  });
  const roleNameById = Object.fromEntries(roles.map((r) => [r.id, r.name]));

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getUsersQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  });

  const setPage = (page: number) =>
    navigate({
      search: (prev: { [key: string]: string }) => ({
        ...prev,
        page,
      }),
    });

  const users = data?.data.slice(0, PER_PAGE) ?? [];
  const count = data?.count ?? 0;

  if (isLoading) {
    return <PendingUsers />;
  }

  return (
    <>
      <Table.Root size={{ base: 'sm', md: 'md' }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w='sm'>
              Полное имя
            </Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>
              Email
            </Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>
              Роль
            </Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>
              Статус
            </Table.ColumnHeader>
            <Table.ColumnHeader w='sm'>
              Дейсвия
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {users?.map((user) => (
            <Table.Row
              key={user.id}
              opacity={isPlaceholderData ? 0.5 : 1}
            >
              <Table.Cell
                color={!user.full_name ? 'gray' : 'inherit'}
              >
                {user.full_name || 'N/A'}
                {currentUser?.id === user.id && (
                  <Badge ml='1' colorScheme='cyan'>
                    You
                  </Badge>
                )}
              </Table.Cell>
              <Table.Cell truncate maxW='sm'>
                {user.email}
              </Table.Cell>
              <Table.Cell>
                {user.is_superuser
                  ? 'Суперпользователь'
                  : (user.role_id && roleNameById[user.role_id]) || '—'}
              </Table.Cell>
              <Table.Cell>
                {user.is_active ? 'Активный' : 'Неактивный'}
              </Table.Cell>
              <Table.Cell>
                <UserActionsMenu
                  user={user}
                  disabled={currentUser?.id === user.id}
                />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex justifyContent='flex-end' mt={4}>
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page }) => setPage(page)}
        >
          <Flex>
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </Flex>
        </PaginationRoot>
      </Flex>
    </>
  );
}

function AddCategory() {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesService.readCategories(),
  });
  const create = useMutation({
    mutationFn: () =>
      CategoriesService.createCategory({
        requestBody: { name, parent_id: parentId || null },
      }),
    onSuccess: () => {
      setName('');
      setParentId('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  return (
    <Flex gap={2} mb={4} flexWrap="wrap" align="center">
      <Input
        placeholder="Новая категория"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxW="xs"
      />
      <select
        value={parentId}
        onChange={(e) => setParentId((e.target as HTMLSelectElement).value)}
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          minWidth: '140px',
        }}
      >
        <option value="">— Категории —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <Button onClick={() => create.mutate()} disabled={!name.trim()} loading={create.isPending}>
        Добавить категорию
      </Button>
    </Flex>
  );
}

function EditCategory({
  category,
  categories,
}: {
  category: { id: string; name: string; parent_id?: string | null };
  categories: Array<{ id: string; name: string; parent_id?: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parent_id ?? '');
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: () =>
      CategoriesService.updateCategory({
        id: category.id,
        requestBody: { name: name || undefined, parent_id: parentId || null },
      }),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  const parentOpts = categories.filter((c) => c.id !== category.id);

  const onOpen = () => {
    setName(category.name);
    setParentId(category.parent_id ?? '');
    setOpen(true);
  };

  return (
    <>
      <Button size='xs' variant='ghost' onClick={onOpen}>
        Изменить
      </Button>
      {open && (
        <Box
          position='fixed'
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={50}
          bg='blackAlpha.500'
          display='flex'
          alignItems='center'
          justifyContent='center'
          onClick={() => setOpen(false)}
        >
          <Box
            bg='white'
            p={4}
            borderRadius='md'
            shadow='lg'
            minW='280px'
            onClick={(e: React.MouseEvent) =>
              e.stopPropagation()
            }
          >
            <Text fontWeight='bold' mb={3}>
              Редактировать категорию
            </Text>
            <Flex direction='column' gap={3} mb={4}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Название'
                size='sm'
              />
              <select
                value={parentId}
                onChange={(e) =>
                  setParentId(
                    (e.target as HTMLSelectElement).value,
                  )
                }
                style={{
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <option value=''>— Категории —</option>
                {parentOpts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Flex>
            <Flex gap={2} justifyContent='flex-end'>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => setOpen(false)}
              >
                Отмена
              </Button>
              <Button
                size='sm'
                onClick={() => update.mutate()}
                loading={update.isPending}
              >
                Сохранить
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </>
  );
}

function CategoriesList() {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesService.readCategories(),
  });
  const parentMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const deleteCat = useMutation({
    mutationFn: (id: string) => CategoriesService.deleteCategory({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  if (categories.length === 0) return null;
  return (
    <Table.Root size='sm'>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Название</Table.ColumnHeader>
          <Table.ColumnHeader>Категории</Table.ColumnHeader>
          <Table.ColumnHeader>Действия</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {categories.map((c) => (
          <Table.Row key={c.id}>
            <Table.Cell>{c.name}</Table.Cell>
            <Table.Cell>
              {c.parent_id
                ? parentMap[c.parent_id] ?? (
                    <ShortId id={c.parent_id} />
                  )
                : '—'}
            </Table.Cell>
            <Table.Cell>
              <Flex gap={2}>
                <EditCategory
                  category={c}
                  categories={categories}
                />
                <Button
                  size='xs'
                  variant='ghost'
                  colorPalette='red'
                  onClick={() => {
                    if (
                      window.confirm(`Удалить «${c.name}»?`)
                    )
                      deleteCat.mutate(c.id);
                  }}
                  disabled={deleteCat.isPending}
                >
                  Удалить
                </Button>
              </Flex>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function Admin() {
  return (
    <Container maxW="full">
      <Heading size="lg" pt={12}>
        Управление пользователями
      </Heading>
      <AddUser />
      <UsersTable />

      <Heading size="md" mt={10} mb={2}>
        Категории
      </Heading>
      <AddCategory />
      <CategoriesList />
    </Container>
  );
}
