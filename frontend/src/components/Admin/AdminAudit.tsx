import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  AUDIT_ACTION_LABELS,
  AUDIT_RESOURCE_LABELS,
  type AuditLogPublic,
  auditApi,
} from "@/api/audit.ts"
import { AdminPanel } from "@/components/Admin/AdminPanel.tsx"
import { FetchingIndicator } from "@/components/Common/FetchingIndicator.tsx"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

const AUDIT_PAGE_SIZE = 20

export function AdminAudit() {
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
    <AdminPanel
      title="Журнал аудита"
      description="Критичные действия администраторов: пользователи, категории, бренды, зоны, сброс пароля."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Тип ресурса:</span>
        <Select
          value={toSelectAll(resourceTypeFilter)}
          onValueChange={(v) => {
            setResourceTypeFilter(fromSelectAll(v))
            setAuditPage(1)
          }}
        >
          <SelectTrigger className="h-8 min-w-[140px] text-sm">
            <SelectValue placeholder="Тип ресурса" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL_VALUE}>— Все —</SelectItem>
            {Object.entries(AUDIT_RESOURCE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FetchingIndicator active={isFetching && !!data} mb={2} />

      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Загрузка журнала…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Не удалось загрузить журнал аудита.
        </p>
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
                    <TableCell className="text-xs">
                      {r.ip_address ?? "—"}
                    </TableCell>
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
    </AdminPanel>
  )
}
