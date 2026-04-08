import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  AUDIT_ACTION_LABELS,
  AUDIT_RESOURCE_LABELS,
  type AuditLogPublic,
  auditApi,
} from "@/api/audit.ts"
import { RolesService, UsersService } from "@/client/index.ts"
import AddUser from "@/components/Admin/AddUser.tsx"
import { AdminPanel } from "@/components/Admin/AdminPanel.tsx"
import RestoreUser from "@/components/Admin/RestoreUser.tsx"
import { UserActionsMenu } from "@/components/Common/UserActionsMenu.tsx"
import PendingUsers from "@/components/Pending/PendingUsers.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { cn } from "@/lib/utils.ts"

const PER_PAGE = 5
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
    return <p className="text-sm text-muted-foreground">Загрузка…</p>
  if (isError)
    return (
      <p className="text-sm text-destructive">Не удалось загрузить записи.</p>
    )
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
                <TableCell>
                  {AUDIT_ACTION_LABELS[r.action] ?? r.action}
                </TableCell>
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
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex h-full max-h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b px-4 py-3 pr-10 text-left">
          <SheetTitle>
            {user.full_name ? `${user.full_name} (${user.email})` : user.email}
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
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
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface AdminUsersProps {
  page: number
  deleted: boolean
  setPage: (page: number) => void
  setDeleted: (deleted: boolean) => void
}

export function AdminUsers({
  page,
  deleted,
  setPage,
  setDeleted,
}: AdminUsersProps) {
  const currentUser = useCurrentUser()
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

  const users = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  if (isLoading) {
    return <PendingUsers />
  }

  return (
    <AdminPanel
      title="Пользователи"
      description="Роли, статус учётной записи. Клик по строке открывает журнал действий пользователя."
      headerExtra={
        <div className="flex w-full justify-end">
          <AddUser />
        </div>
      }
    >
      <div className="mb-4 inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <Button
          type="button"
          variant={!deleted ? "secondary" : "ghost"}
          size="sm"
          className="rounded-md shadow-none"
          onClick={() => setDeleted(false)}
        >
          Активные
        </Button>
        <Button
          type="button"
          variant={deleted ? "secondary" : "ghost"}
          size="sm"
          className="rounded-md shadow-none"
          onClick={() => setDeleted(true)}
        >
          Удалённые
        </Button>
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
                <TableCell className="max-w-sm truncate">
                  {user.email}
                </TableCell>
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
    </AdminPanel>
  )
}
