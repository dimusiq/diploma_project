import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"

import {
  AUDIT_ACTION_LABELS,
  AUDIT_RESOURCE_LABELS,
  type AuditLogPublic,
  auditApi,
} from "@/api/audit.ts"
import { type BrandPublic, brandsApi } from "@/api/brands.ts"
import { type ZonePublic, zonesApi } from "@/api/zones.ts"
import { CategoriesService, RolesService, UsersService } from "@/client/index.ts"
import AddUser from "@/components/Admin/AddUser.tsx"
import { AdminPanel } from "@/components/Admin/AdminPanel.tsx"
import { AgentChatLogsAdmin } from "@/components/Admin/AgentChatLogsAdmin.tsx"
import { AgentGovernanceAdmin } from "@/components/Admin/AgentGovernanceAdmin.tsx"
import { AgentKnowledgeAdmin } from "@/components/Admin/AgentKnowledgeAdmin.tsx"
import RestoreUser from "@/components/Admin/RestoreUser.tsx"
import { WarehouseTopologyAdmin } from "@/components/Admin/WarehouseTopologyAdmin.tsx"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import { ShortId } from "@/components/Common/ShortId.tsx"
import { UserActionsMenu } from "@/components/Common/UserActionsMenu.tsx"
import PendingUsers from "@/components/Pending/PendingUsers.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { cn } from "@/lib/utils.ts"

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
  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">Загрузка…</p>
    )
  if (isError)
    return <p className="text-sm text-destructive">Не удалось загрузить записи.</p>
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Записей нет.</p>
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Дата и время</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Ресурс</TableHead>
              <TableHead>Детали</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: AuditLogPublic) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {formatDateTime(r.created_at)}
                </TableCell>
                <TableCell>{AUDIT_ACTION_LABELS[r.action] ?? r.action}</TableCell>
                <TableCell>
                  {AUDIT_RESOURCE_LABELS[r.resource_type] ?? r.resource_type}
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate"
                  title={r.details ?? undefined}
                >
                  {r.details ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
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
        <DrawerBody className="flex flex-col gap-6 overflow-y-auto">
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
      <div className="mb-4 inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            !deleted
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setDeleted(false)}
        >
          Активные
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            deleted
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setDeleted(true)}
        >
          Удалённые
        </button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Полное имя</TableHead>
              <TableHead className="w-32">Email</TableHead>
              <TableHead className="w-32">Роль</TableHead>
              <TableHead className="w-32">Статус</TableHead>
              {deleted ? (
                <TableHead className="w-32">Удалён</TableHead>
              ) : (
                <TableHead className="w-32">Последний вход</TableHead>
              )}
              <TableHead className="w-32">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user) => (
              <TableRow
                key={user.id}
                className={cn(
                  "cursor-pointer",
                  isPlaceholderData && "opacity-50",
                )}
                onClick={() => setSelectedUser(user)}
              >
                <TableCell
                  className={cn(!user.full_name && "text-muted-foreground")}
                >
                  {user.full_name || "N/A"}
                  {!deleted && currentUser.id === user.id && (
                    <span className="ml-1 inline-flex rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-800 dark:text-cyan-300">
                      You
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-sm truncate">{user.email}</TableCell>
                <TableCell>
                  {user.is_superuser
                    ? "Суперпользователь"
                    : (user.role_id && roleNameById[user.role_id]) || "—"}
                </TableCell>
                <TableCell>
                  {user.is_active ? "Активный" : "Неактивный"}
                </TableCell>
                {deleted ? (
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(user.deleted_at)}
                  </TableCell>
                ) : (
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(user.last_login_at)}
                  </TableCell>
                )}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {deleted ? (
                    <RestoreUser id={user.id} />
                  ) : (
                    <UserActionsMenu
                      user={user}
                      disabled={currentUser.id === user.id}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex justify-end">
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page: p }) => setPage(p)}
        >
          <div className="flex">
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </div>
        </PaginationRoot>
      </div>
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
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Новая категория"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-xs"
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
    </div>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          role="presentation"
        >
          <div
            className="min-w-[280px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="mb-3 font-bold">Редактировать категорию</p>
            <div className="mb-4 flex flex-col gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                className="h-7 text-sm"
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
            </div>
            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        </div>
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Категории</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell>
                  {c.parent_id
                    ? (parentMap[c.parent_id] ?? <ShortId id={c.parent_id} />)
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <EditCategory category={c} categories={categories} />
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() =>
                        setDeleteConfirm({ id: c.id, name: c.name })
                      }
                      disabled={deleteCat.isPending}
                    >
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Новый бренд техники"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-xs"
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
    </div>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="min-w-[280px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="mb-3 font-bold">Редактировать бренд</p>
            <div className="mb-4 flex flex-col gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                className="h-7 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        </div>
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.name}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <EditBrand brand={b} />
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() =>
                        setDeleteConfirm({ id: b.id, name: b.name })
                      }
                      disabled={deleteBrand.isPending}
                    >
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Новая зона склада"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-xs"
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
    </div>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="min-w-[280px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="mb-3 font-bold">Редактировать зону</p>
            <div className="mb-4 flex flex-col gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                className="h-7 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        </div>
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Тип ресурса:</span>
        <select
          value={resourceTypeFilter}
          onChange={(e) => {
            setResourceTypeFilter(e.target.value)
            setAuditPage(1)
          }}
          className="min-w-[140px] rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
        >
          <option value="">— Все —</option>
          {Object.entries(AUDIT_RESOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <FetchingIndicator active={isFetching && !!data} mb={2} />

      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Загрузка журнала…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Не удалось загрузить журнал аудита.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Записей пока нет.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">
                    Дата и время
                  </TableHead>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Действие</TableHead>
                  <TableHead>Ресурс</TableHead>
                  <TableHead>Детали</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: AuditLogPublic) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell>{r.user_email ?? "—"}</TableCell>
                    <TableCell>
                      {AUDIT_ACTION_LABELS[r.action] ?? r.action}
                    </TableCell>
                    <TableCell>
                      {AUDIT_RESOURCE_LABELS[r.resource_type] ??
                        r.resource_type}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate"
                      title={r.details ?? undefined}
                    >
                      {r.details ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.ip_address ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex justify-end">
            <PaginationRoot
              count={count}
              pageSize={AUDIT_PAGE_SIZE}
              onPageChange={({ page }) => setAuditPage(page)}
            >
              <div className="flex">
                <PaginationPrevTrigger />
                <PaginationItems />
                <PaginationNextTrigger />
              </div>
            </PaginationRoot>
          </div>
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zones.map((z) => (
              <TableRow key={z.id}>
                <TableCell>{z.name}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <EditZone zone={z} />
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() =>
                        setDeleteConfirm({ id: z.id, name: z.name })
                      }
                      disabled={deleteZone.isPending}
                    >
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
    <div>
      <AdminPanel
        mt={4}
        title="Категории"
        description="Иерархия категорий для товаров склада."
      >
        <AddCategory />
        <CategoriesList />
      </AdminPanel>

      <AdminPanel
        title="Бренды техники"
        description="Справочник брендов для раздела «Техника». Создание и изменение — только для суперпользователя."
      >
        <AddBrand />
        <BrandsList />
      </AdminPanel>

      <AdminPanel
        title="Зоны склада"
        description="Справочник зон для раздела «Техника». Создание и изменение — только для суперпользователя."
        mb={0}
      >
        <AddZone />
        <ZonesList />
      </AdminPanel>
    </div>
  )
}

function Admin() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 md:px-6 md:py-6">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Администрирование
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Настройки приложения, пользователи, журнал аудита и сервисы ассистента.
        </p>
      </div>

      <Tabs defaultValue="app-settings" className="w-full">
        <TabsList
          variant="line"
          className="mb-0 h-auto w-full flex-wrap justify-start gap-1 gap-y-2"
        >
          <TabsTrigger value="app-settings">Приложение</TabsTrigger>
          <TabsTrigger value="users">Пользователи</TabsTrigger>
          <TabsTrigger value="audit">Журнал аудита</TabsTrigger>
          <TabsTrigger value="agent-knowledge">База знаний</TabsTrigger>
          <TabsTrigger value="agent-logs">Чат ассистента</TabsTrigger>
          <TabsTrigger value="agent-governance">Агент</TabsTrigger>
          <TabsTrigger value="warehouse-topology">Топология склада</TabsTrigger>
        </TabsList>
        <TabsContent value="app-settings" className="mt-4 outline-none">
          <AppSettingsContent />
        </TabsContent>
        <TabsContent value="users" className="mt-4 outline-none">
          <AdminPanel
            title="Пользователи"
            description="Роли, статус учётной записи. Клик по строке открывает журнал действий пользователя."
            headerExtra={
              <div className="flex w-full justify-end">
                <AddUser />
              </div>
            }
          >
            <UsersTable />
          </AdminPanel>
        </TabsContent>
        <TabsContent value="audit" className="mt-4 outline-none">
          <AdminPanel
            title="Журнал аудита"
            description="Критичные действия администраторов: пользователи, категории, бренды, зоны, сброс пароля."
          >
            <AuditLogSection />
          </AdminPanel>
        </TabsContent>
        <TabsContent value="agent-knowledge" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <AgentKnowledgeAdmin />
          </AdminPanel>
        </TabsContent>
        <TabsContent value="agent-logs" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <AgentChatLogsAdmin />
          </AdminPanel>
        </TabsContent>
        <TabsContent value="agent-governance" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <AgentGovernanceAdmin />
          </AdminPanel>
        </TabsContent>
        <TabsContent value="warehouse-topology" className="mt-4 outline-none">
          <AdminPanel mb={0}>
            <WarehouseTopologyAdmin />
          </AdminPanel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
