import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"

import {
  auditApi,
  AUDIT_ACTION_LABELS,
  AUDIT_RESOURCE_LABELS,
  type AuditLogPublic,
} from "@/api/audit.ts"
import { type BrandPublic, brandsApi } from "@/api/brands.ts"
import { type ZonePublic, zonesApi } from "@/api/zones.ts"
import { CategoriesService, RolesService, UsersService } from "@/client/index.ts"
import AddUser from "@/components/Admin/AddUser.tsx"
import RestoreUser from "@/components/Admin/RestoreUser.tsx"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import { ShortId } from "@/components/Common/ShortId.tsx"
import { UserActionsMenu } from "@/components/Common/UserActionsMenu.tsx"
import PendingUsers from "@/components/Pending/PendingUsers.tsx"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer.tsx"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"

const usersSearchSchema = z.object({
  page: z.number().catch(1),
  deleted: z.boolean().catch(false),
})

const PER_PAGE = 5
const AUDIT_PAGE_SIZE = 20
const USER_AUDIT_PAGE_SIZE = 50

function formatDateTime(s: string | null | undefined): string {
  if (!s) return "—"
  return new Date(s).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function getUsersQueryOptions({
  page,
  deleted,
}: {
  page: number
  deleted: boolean
}) {
  return {
    queryFn: () =>
      UsersService.readUsers({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        deleted,
      }),
    queryKey: ["users", { page, deleted }],
  }
}

type UserPublic = {
  id: string
  email: string
  full_name?: string | null
  is_active?: boolean
  is_superuser?: boolean
  role_id?: string | null
  last_login_at?: string | null
  deleted_at?: string | null
}

function UserAuditBlock({
  title,
  queryKey,
  queryFn,
}: {
  title: string
  queryKey: unknown[]
  queryFn: () => Promise<{ data: AuditLogPublic[]; count: number }>
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn,
  })
  const rows = data?.data ?? []
  if (isLoading) return <Text fontSize="sm" color="fg.muted">Загрузка…</Text>
  if (isError) return <Text color="red.500">Не удалось загрузить записи.</Text>
  if (rows.length === 0) return <Text fontSize="sm" color="fg.muted">Записей нет.</Text>
  return (
    <Box>
      <Text fontWeight="semibold" mb={2} fontSize="sm">
        {title}
      </Text>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader whiteSpace="nowrap">Дата и время</Table.ColumnHeader>
            <Table.ColumnHeader>Действие</Table.ColumnHeader>
            <Table.ColumnHeader>Ресурс</Table.ColumnHeader>
            <Table.ColumnHeader>Детали</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((r: AuditLogPublic) => (
            <Table.Row key={r.id}>
              <Table.Cell whiteSpace="nowrap" fontSize="xs">
                {formatDateTime(r.created_at)}
              </Table.Cell>
              <Table.Cell>{AUDIT_ACTION_LABELS[r.action] ?? r.action}</Table.Cell>
              <Table.Cell>
                {AUDIT_RESOURCE_LABELS[r.resource_type] ?? r.resource_type}
              </Table.Cell>
              <Table.Cell maxW="200px" truncate title={r.details ?? undefined}>
                {r.details ?? "—"}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}

function UserDetailDrawer({
  user,
  onClose,
}: {
  user: UserPublic
  onClose: () => void
}) {
  return (
    <DrawerRoot
      open={true}
      onOpenChange={(e) => !e.open && onClose()}
      size="lg"
      placement="end"
    >
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {user.full_name
              ? `${user.full_name} (${user.email})`
              : user.email}
          </DrawerTitle>
          <DrawerCloseTrigger />
        </DrawerHeader>
        <DrawerBody overflowY="auto" gap={6}>
          <UserAuditBlock
            title="Действия пользователя (журнал аудита)"
            queryKey={["audit", "by-user", user.id]}
            queryFn={() =>
              auditApi.list({ user_id: user.id, limit: USER_AUDIT_PAGE_SIZE })
            }
          />
          <UserAuditBlock
            title="Изменения учётной записи (логи изменений)"
            queryKey={["audit", "user-account", user.id]}
            queryFn={() =>
              auditApi.list({
                resource_type: "user",
                resource_id: user.id,
                limit: USER_AUDIT_PAGE_SIZE,
              })
            }
          />
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  )
}

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  validateSearch: (search) => usersSearchSchema.parse(search),
})

function UsersTable() {
  const currentUser = useCurrentUser()
  const navigate = useNavigate({ from: Route.fullPath })
  const { page, deleted } = Route.useSearch()
  const [selectedUser, setSelectedUser] = useState<UserPublic | null>(null)

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: () => RolesService.readRoles(),
  })
  const roleNameById = Object.fromEntries(roles.map((r) => [r.id, r.name]))

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getUsersQueryOptions({ page, deleted }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (p: number) =>
    (navigate as unknown as (opts: { search: (prev: { page: number; deleted: boolean }) => { page: number; deleted: boolean } }) => void)({
      search: (prev) => ({ ...prev, page: p }),
    })
  const setDeleted = (d: boolean) =>
    (navigate as unknown as (opts: { search: (prev: { page: number; deleted: boolean }) => { page: number; deleted: boolean } }) => void)({
      search: (prev) => ({ ...prev, deleted: d, page: 1 }),
    })

  const users = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  if (isLoading) {
    return <PendingUsers />
  }

  return (
    <>
      <Tabs.Root
        value={deleted ? "deleted" : "active"}
        onValueChange={(e) => setDeleted(e.value === "deleted")}
        variant="subtle"
        mb={4}
      >
        <Tabs.List>
          <Tabs.Trigger value="active">Активные</Tabs.Trigger>
          <Tabs.Trigger value="deleted">Удалённые</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      <Table.Root size={{ base: "sm", md: "md" }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="sm">Полное имя</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Email</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Роль</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Статус</Table.ColumnHeader>
            {deleted ? (
              <Table.ColumnHeader w="sm">Удалён</Table.ColumnHeader>
            ) : (
              <Table.ColumnHeader w="sm">Последний вход</Table.ColumnHeader>
            )}
            <Table.ColumnHeader w="sm">Действия</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {users?.map((user) => (
            <Table.Row
              key={user.id}
              opacity={isPlaceholderData ? 0.5 : 1}
              cursor="pointer"
              _hover={{ bg: "gray.subtle" }}
              onClick={() => setSelectedUser(user)}
            >
              <Table.Cell color={!user.full_name ? "gray" : "inherit"}>
                {user.full_name || "N/A"}
                {!deleted && currentUser.id === user.id && (
                  <Badge ml="1" colorScheme="cyan">
                    You
                  </Badge>
                )}
              </Table.Cell>
              <Table.Cell truncate maxW="sm">
                {user.email}
              </Table.Cell>
              <Table.Cell>
                {user.is_superuser
                  ? "Суперпользователь"
                  : (user.role_id && roleNameById[user.role_id]) || "—"}
              </Table.Cell>
              <Table.Cell>
                {user.is_active ? "Активный" : "Неактивный"}
              </Table.Cell>
              {deleted ? (
                <Table.Cell whiteSpace="nowrap" fontSize="sm">
                  {formatDateTime(user.deleted_at)}
                </Table.Cell>
              ) : (
                <Table.Cell whiteSpace="nowrap" fontSize="sm">
                  {formatDateTime(user.last_login_at)}
                </Table.Cell>
              )}
              <Table.Cell onClick={(e) => e.stopPropagation()}>
                {deleted ? (
                  <RestoreUser id={user.id} />
                ) : (
                  <UserActionsMenu
                    user={user}
                    disabled={currentUser.id === user.id}
                  />
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex justifyContent="flex-end" mt={4}>
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page: p }) => setPage(p)}
        >
          <Flex>
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </Flex>
        </PaginationRoot>
      </Flex>
      {selectedUser && (
        <UserDetailDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </>
  )
}

function AddCategory() {
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState<string>("")
  const queryClient = useQueryClient()
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })
  const create = useMutation({
    mutationFn: () =>
      CategoriesService.createCategory({
        requestBody: { name, parent_id: parentId || null },
      }),
    onSuccess: () => {
      setName("")
      setParentId("")
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
  })
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
          padding: "6px 10px",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
          minWidth: "140px",
        }}
      >
        <option value="">— Категории —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button
        variant="solid"
        size="sm"
        onClick={() => create.mutate()}
        disabled={!name.trim()}
        loading={create.isPending}
      >
        Добавить категорию
      </Button>
    </Flex>
  )
}

function EditCategory({
  category,
  categories,
}: {
  category: { id: string; name: string; parent_id?: string | null }
  categories: Array<{ id: string; name: string; parent_id?: string | null }>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(category.name)
  const [parentId, setParentId] = useState(category.parent_id ?? "")
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: () =>
      CategoriesService.updateCategory({
        id: category.id,
        requestBody: { name: name || undefined, parent_id: parentId || null },
      }),
    onSuccess: () => {
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
  })
  const parentOpts = categories.filter((c) => c.id !== category.id)

  const onOpen = () => {
    setName(category.name)
    setParentId(category.parent_id ?? "")
    setOpen(true)
  }

  return (
    <>
      <Button size="xs" variant="ghost" onClick={onOpen}>
        Изменить
      </Button>
      {open && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={50}
          bg="blackAlpha.500"
          display="flex"
          alignItems="center"
          justifyContent="center"
          onClick={() => setOpen(false)}
        >
          <Box
            bg="bg"
            color="fg"
            p={4}
            borderRadius="md"
            shadow="lg"
            minW="280px"
            borderWidth="1px"
            borderColor="border"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Text fontWeight="bold" mb={3}>
              Редактировать категорию
            </Text>
            <Flex direction="column" gap={3} mb={4}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                size="sm"
              />
              <select
                value={parentId}
                onChange={(e) =>
                  setParentId((e.target as HTMLSelectElement).value)
                }
                style={{
                  padding: 8,
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                }}
              >
                <option value="">— Категории —</option>
                {parentOpts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Flex>
            <Flex gap={2} justifyContent="flex-end">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="solid"
                size="sm"
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
  )
}

function CategoriesList() {
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })
  const parentMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  const deleteCat = useMutation({
    mutationFn: (id: string) => CategoriesService.deleteCategory({ id }),
    onSuccess: () => {
      setDeleteConfirm(null)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
  })

  if (categories.length === 0) return null
  return (
    <>
      <Table.Root size="sm">
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
                  ? (parentMap[c.parent_id] ?? <ShortId id={c.parent_id} />)
                  : "—"}
              </Table.Cell>
              <Table.Cell>
                <Flex gap={2}>
                  <EditCategory category={c} categories={categories} />
                  <Button
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    onClick={() => setDeleteConfirm({ id: c.id, name: c.name })}
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
      <ConfirmDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Удалить категорию?"
        description={
          deleteConfirm
            ? `Удалить «${deleteConfirm.name}»? Это действие нельзя отменить.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleteCat.isPending}
        onConfirm={() =>
          deleteConfirm && deleteCat.mutate(deleteConfirm.id)
        }
      />
    </>
  )
}

function AddBrand() {
  const [name, setName] = useState("")
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: () => brandsApi.create({ name: name.trim() }),
    onSuccess: () => {
      setName("")
      queryClient.invalidateQueries({ queryKey: ["brands"] })
    },
  })
  return (
    <Flex gap={2} mb={4} flexWrap="wrap" align="center">
      <Input
        placeholder="Новый бренд техники"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxW="xs"
      />
      <Button
        variant="solid"
        size="sm"
        onClick={() => create.mutate()}
        disabled={!name.trim()}
        loading={create.isPending}
      >
        Добавить бренд
      </Button>
    </Flex>
  )
}

function EditBrand({ brand }: { brand: BrandPublic }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(brand.name)
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: () => brandsApi.update(brand.id, { name: name.trim() }),
    onSuccess: () => {
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["brands"] })
    },
  })

  const onOpen = () => {
    setName(brand.name)
    setOpen(true)
  }

  return (
    <>
      <Button size="xs" variant="ghost" onClick={onOpen}>
        Изменить
      </Button>
      {open && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={50}
          bg="blackAlpha.500"
          display="flex"
          alignItems="center"
          justifyContent="center"
          onClick={() => setOpen(false)}
        >
          <Box
            bg="bg"
            color="fg"
            p={4}
            borderRadius="md"
            shadow="lg"
            minW="280px"
            borderWidth="1px"
            borderColor="border"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Text fontWeight="bold" mb={3}>
              Редактировать бренд
            </Text>
            <Flex direction="column" gap={3} mb={4}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                size="sm"
              />
            </Flex>
            <Flex gap={2} justifyContent="flex-end">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="solid"
                size="sm"
                onClick={() => update.mutate()}
                loading={update.isPending}
                disabled={!name.trim()}
              >
                Сохранить
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </>
  )
}

function BrandsList() {
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const { data: brands = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: () => brandsApi.list(),
  })
  const deleteBrand = useMutation({
    mutationFn: (id: string) => brandsApi.delete(id),
    onSuccess: () => {
      setDeleteConfirm(null)
      queryClient.invalidateQueries({ queryKey: ["brands"] })
    },
  })

  if (brands.length === 0) return null
  return (
    <>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Название</Table.ColumnHeader>
            <Table.ColumnHeader>Действия</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {brands.map((b) => (
            <Table.Row key={b.id}>
              <Table.Cell>{b.name}</Table.Cell>
              <Table.Cell>
                <Flex gap={2}>
                  <EditBrand brand={b} />
                  <Button
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    onClick={() =>
                      setDeleteConfirm({ id: b.id, name: b.name })
                    }
                    disabled={deleteBrand.isPending}
                  >
                    Удалить
                  </Button>
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <ConfirmDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Удалить бренд?"
        description={
          deleteConfirm
            ? `Удалить бренд «${deleteConfirm.name}»? К нему не должна быть привязана техника.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleteBrand.isPending}
        onConfirm={() =>
          deleteConfirm && deleteBrand.mutate(deleteConfirm.id)
        }
      />
    </>
  )
}

function AddZone() {
  const [name, setName] = useState("")
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: () => zonesApi.create({ name: name.trim() }),
    onSuccess: () => {
      setName("")
      queryClient.invalidateQueries({ queryKey: ["zones"] })
    },
  })
  return (
    <Flex gap={2} mb={4} flexWrap="wrap" align="center">
      <Input
        placeholder="Новая зона склада"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxW="xs"
      />
      <Button
        variant="solid"
        size="sm"
        onClick={() => create.mutate()}
        disabled={!name.trim()}
        loading={create.isPending}
      >
        Добавить зону
      </Button>
    </Flex>
  )
}

function EditZone({ zone }: { zone: ZonePublic }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(zone.name)
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: () => zonesApi.update(zone.id, { name: name.trim() }),
    onSuccess: () => {
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["zones"] })
    },
  })

  const onOpen = () => {
    setName(zone.name)
    setOpen(true)
  }

  return (
    <>
      <Button size="xs" variant="ghost" onClick={onOpen}>
        Изменить
      </Button>
      {open && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={50}
          bg="blackAlpha.500"
          display="flex"
          alignItems="center"
          justifyContent="center"
          onClick={() => setOpen(false)}
        >
          <Box
            bg="bg"
            color="fg"
            p={4}
            borderRadius="md"
            shadow="lg"
            minW="280px"
            borderWidth="1px"
            borderColor="border"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Text fontWeight="bold" mb={3}>
              Редактировать зону
            </Text>
            <Flex direction="column" gap={3} mb={4}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                size="sm"
              />
            </Flex>
            <Flex gap={2} justifyContent="flex-end">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="solid"
                size="sm"
                onClick={() => update.mutate()}
                loading={update.isPending}
                disabled={!name.trim()}
              >
                Сохранить
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </>
  )
}

function AuditLogSection() {
  const [auditPage, setAuditPage] = useState(1)
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>("")

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: [
      "audit",
      {
        skip: (auditPage - 1) * AUDIT_PAGE_SIZE,
        limit: AUDIT_PAGE_SIZE,
        resource_type: resourceTypeFilter || undefined,
      },
    ],
    queryFn: () =>
      auditApi.list({
        skip: (auditPage - 1) * AUDIT_PAGE_SIZE,
        limit: AUDIT_PAGE_SIZE,
        resource_type: resourceTypeFilter || undefined,
      }),
    // Держим предыдущую страницу/фильтр на экране, чтобы таблица не "прыгала".
    placeholderData: (prev) => prev,
  })

  const rows = data?.data ?? []
  const count = data?.count ?? 0

  const formatDate = (s: string) =>
    new Date(s).toLocaleString("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    })

  return (
    <>
      <Flex gap={2} mb={4} flexWrap="wrap" align="center">
        <Text fontSize="sm" color="fg.muted">
          Тип ресурса:
        </Text>
        <select
          value={resourceTypeFilter}
          onChange={(e) => {
            setResourceTypeFilter(e.target.value)
            setAuditPage(1)
          }}
          style={{
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--chakra-colors-border)",
            minWidth: "140px",
          }}
        >
          <option value="">— Все —</option>
          {Object.entries(AUDIT_RESOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Flex>

      <FetchingIndicator active={isFetching && !!data} mb={2} />

      {isLoading && !data ? (
        <Text color="fg.muted">Загрузка журнала…</Text>
      ) : isError ? (
        <Text color="red.500">Не удалось загрузить журнал аудита.</Text>
      ) : rows.length === 0 ? (
        <Text color="fg.muted">Записей пока нет.</Text>
      ) : (
        <>
          <Table.Root size="sm" overflowX="auto">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader whiteSpace="nowrap">
                  Дата и время
                </Table.ColumnHeader>
                <Table.ColumnHeader>Пользователь</Table.ColumnHeader>
                <Table.ColumnHeader>Действие</Table.ColumnHeader>
                <Table.ColumnHeader>Ресурс</Table.ColumnHeader>
                <Table.ColumnHeader>Детали</Table.ColumnHeader>
                <Table.ColumnHeader>IP</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((r: AuditLogPublic) => (
                <Table.Row key={r.id}>
                  <Table.Cell whiteSpace="nowrap" fontSize="xs">
                    {formatDate(r.created_at)}
                  </Table.Cell>
                  <Table.Cell>{r.user_email ?? "—"}</Table.Cell>
                  <Table.Cell>
                    {AUDIT_ACTION_LABELS[r.action] ?? r.action}
                  </Table.Cell>
                  <Table.Cell>
                    {AUDIT_RESOURCE_LABELS[r.resource_type] ?? r.resource_type}
                  </Table.Cell>
                  <Table.Cell maxW="200px" truncate title={r.details ?? undefined}>
                    {r.details ?? "—"}
                  </Table.Cell>
                  <Table.Cell fontSize="xs">{r.ip_address ?? "—"}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
          <Flex justifyContent="flex-end" mt={4}>
            <PaginationRoot
              count={count}
              pageSize={AUDIT_PAGE_SIZE}
              onPageChange={({ page }) => setAuditPage(page)}
            >
              <Flex>
                <PaginationPrevTrigger />
                <PaginationItems />
                <PaginationNextTrigger />
              </Flex>
            </PaginationRoot>
          </Flex>
        </>
      )}
    </>
  )
}

function ZonesList() {
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const { data: zones = [] } = useQuery({
    queryKey: ["zones"],
    queryFn: () => zonesApi.list(),
  })
  const deleteZone = useMutation({
    mutationFn: (id: string) => zonesApi.delete(id),
    onSuccess: () => {
      setDeleteConfirm(null)
      queryClient.invalidateQueries({ queryKey: ["zones"] })
    },
  })

  if (zones.length === 0) return null
  return (
    <>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Название</Table.ColumnHeader>
            <Table.ColumnHeader>Действия</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {zones.map((z) => (
            <Table.Row key={z.id}>
              <Table.Cell>{z.name}</Table.Cell>
              <Table.Cell>
                <Flex gap={2}>
                  <EditZone zone={z} />
                  <Button
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    onClick={() =>
                      setDeleteConfirm({ id: z.id, name: z.name })
                    }
                    disabled={deleteZone.isPending}
                  >
                    Удалить
                  </Button>
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <ConfirmDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Удалить зону?"
        description={
          deleteConfirm
            ? `Удалить зону «${deleteConfirm.name}»? Это действие нельзя отменить.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleteZone.isPending}
        onConfirm={() =>
          deleteConfirm && deleteZone.mutate(deleteConfirm.id)
        }
      />
    </>
  )
}

function AppSettingsContent() {
  return (
    <Box>
      <Heading size="md" mt={4} mb={2}>
        Категории
      </Heading>
      <AddCategory />
      <CategoriesList />

      <Heading size="md" mt={10} mb={2}>
        Бренды техники
      </Heading>
      <Text fontSize="sm" color="fg.muted" mb={2}>
        Справочник брендов для раздела «Техника». Создание и изменение — только
        для суперпользователя.
      </Text>
      <AddBrand />
      <BrandsList />

      <Heading size="md" mt={10} mb={2}>
        Зоны склада
      </Heading>
      <Text fontSize="sm" color="fg.muted" mb={2}>
        Справочник зон для раздела «Техника». Создание и изменение — только для
        суперпользователя.
      </Text>
      <AddZone />
      <ZonesList />
    </Box>
  )
}

function Admin() {
  return (
    <Container maxW='full'>
      <Heading size='lg' pt={12}>
        Администрирование
      </Heading>

      <Tabs.Root
        defaultValue='app-settings'
        variant='subtle'
        mt={6}
      >
        <Tabs.List>
          <Tabs.Trigger value='app-settings'>
            Управление и настройка приложения
          </Tabs.Trigger>
          <Tabs.Trigger value='users'>
            Управление пользователями
          </Tabs.Trigger>
          <Tabs.Trigger value='audit'>
            Журнал аудита
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value='app-settings'>
          <AppSettingsContent />
        </Tabs.Content>
        <Tabs.Content value='users'>
          <Box pt={4}>
            <AddUser />
            <UsersTable />
          </Box>
        </Tabs.Content>
        <Tabs.Content value='audit'>
          <Box pt={4}>
            <Text fontSize='sm' color='fg.muted' mb={4}>
              Критичные действия администраторов: создание и
              изменение пользователей, категорий, брендов,
              зон, запросы сброса пароля.
            </Text>
            <AuditLogSection />
          </Box>
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  );
}
