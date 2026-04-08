import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FiPlus, FiTrash2 } from "react-icons/fi"
import {
  outboundOrdersApi,
  type OutboundOrderCreate,
  type OutboundOrderPublic,
  type OutboundOrderUpdate,
} from "@/api/outboundOrders.ts"
import { ApiError } from "@/client/index.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/app-dialog.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

export const Route = createFileRoute("/_layout/outbound-orders")({
  component: OutboundOrdersPage,
})

const PER_PAGE = 20

const STATUS_OPTIONS = [
  { value: SELECT_ALL_VALUE, label: "Все статусы" },
  { value: "open", label: "Открыт" },
  { value: "picking", label: "Комплектация" },
  { value: "packed", label: "Упакован" },
  { value: "shipped", label: "Отгружен" },
  { value: "closed", label: "Закрыт" },
  { value: "cancelled", label: "Отменён" },
] as const

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Открыт", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    picking: { label: "Комплектация", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
    packed: { label: "Упакован", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
    shipped: { label: "Отгружен", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    closed: { label: "Закрыт", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    cancelled: { label: "Отменён", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  }
  const m = map[status] ?? { label: status, cls: "" }
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>
}

function linesCount(lines: Record<string, unknown> | null): number {
  if (!lines) return 0
  if (Array.isArray(lines)) return lines.length
  const arr = (lines as Record<string, unknown>).items
  if (Array.isArray(arr)) return arr.length
  return Object.keys(lines).length
}

function OutboundOrdersPage() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState("")
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editOrder, setEditOrder] = useState<OutboundOrderPublic | null>(null)

  const listQ = useQuery({
    queryKey: ["outbound-orders", statusFilter, page],
    queryFn: () =>
      outboundOrdersApi.list({
        status: statusFilter || undefined,
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
      }),
  })

  const createMut = useMutation({
    mutationFn: (body: OutboundOrderCreate) => outboundOrdersApi.create(body),
    onSuccess: () => {
      showSuccessToast("Заказ создан")
      setDialogOpen(false)
      void qc.invalidateQueries({ queryKey: ["outbound-orders"] })
    },
    onError: (e: unknown) => {
      showErrorToast(e instanceof ApiError ? e.message : "Ошибка создания")
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: OutboundOrderUpdate }) =>
      outboundOrdersApi.update(id, body),
    onSuccess: () => {
      showSuccessToast("Заказ обновлён")
      setEditOrder(null)
      void qc.invalidateQueries({ queryKey: ["outbound-orders"] })
    },
    onError: (e: unknown) => {
      showErrorToast(e instanceof ApiError ? e.message : "Ошибка обновления")
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => outboundOrdersApi.delete(id),
    onSuccess: () => {
      showSuccessToast("Заказ удалён")
      void qc.invalidateQueries({ queryKey: ["outbound-orders"] })
    },
    onError: (e: unknown) => {
      showErrorToast(e instanceof ApiError ? e.message : "Ошибка удаления")
    },
  })

  const totalPages = Math.max(1, Math.ceil((listQ.data?.count ?? 0) / PER_PAGE))

  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-6 md:px-4 md:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Исходящие заказы</h1>
          <p className="text-sm text-muted-foreground">Управление отгрузками со склада</p>
        </div>
        <DialogRoot open={dialogOpen} onOpenChange={({ open }) => setDialogOpen(open)} size="md">
          <DialogTrigger asChild>
            <Button size="sm">
              <FiPlus className="mr-1 size-4" /> Новый заказ
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogCloseTrigger />
            <DialogHeader>
              <DialogTitle>Новый исходящий заказ</DialogTitle>
            </DialogHeader>
            <OutboundOrderForm
              onSubmit={(data) => createMut.mutate(data)}
              isPending={createMut.isPending}
            />
          </DialogContent>
        </DialogRoot>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={toSelectAll(statusFilter)}
          onValueChange={(v) => { setStatusFilter(fromSelectAll(v)); setPage(1) }}
        >
          <SelectTrigger className="h-9 w-full min-w-[200px] text-sm sm:w-auto">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQ.isPending ? (
        <Skeleton className="h-[300px]" />
      ) : listQ.isError ? (
        <p className="text-destructive">
          {listQ.error instanceof ApiError ? listQ.error.message : "Не удалось загрузить заказы"}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Код</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Отгрузить до</TableHead>
                  <TableHead className="text-center">Позиций</TableHead>
                  <TableHead>Создан</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQ.data?.data ?? []).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.code}</TableCell>
                    <TableCell>{statusBadge(order.status)}</TableCell>
                    <TableCell className="text-sm">
                      {order.ship_by_at
                        ? new Date(order.ship_by_at).toLocaleDateString("ru-RU")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">{linesCount(order.lines)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="outline" onClick={() => setEditOrder(order)}>
                          Изменить
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                          loading={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(order.id)}
                        >
                          <FiTrash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(listQ.data?.data ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Нет исходящих заказов для выбранного фильтра.
              </p>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Назад
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Вперёд
              </Button>
            </div>
          )}
        </>
      )}

      {editOrder && (
        <DialogRoot open onOpenChange={({ open }) => { if (!open) setEditOrder(null) }} size="md">
          <DialogContent>
            <DialogCloseTrigger />
            <DialogHeader>
              <DialogTitle>Редактировать заказ {editOrder.code}</DialogTitle>
            </DialogHeader>
            <OutboundOrderForm
              initial={editOrder}
              onSubmit={(data) => updateMut.mutate({ id: editOrder.id, body: data })}
              isPending={updateMut.isPending}
            />
          </DialogContent>
        </DialogRoot>
      )}
    </div>
  )
}

function OutboundOrderForm({
  initial,
  onSubmit,
  isPending,
}: {
  initial?: OutboundOrderPublic
  onSubmit: (data: OutboundOrderCreate & OutboundOrderUpdate) => void
  isPending: boolean
}) {
  const [code, setCode] = useState(initial?.code ?? "")
  const [status, setStatus] = useState(initial?.status ?? "open")
  const [shipByAt, setShipByAt] = useState(
    initial?.ship_by_at ? initial.ship_by_at.slice(0, 16) : "",
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      code,
      status,
      ship_by_at: shipByAt ? new Date(shipByAt).toISOString() : null,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogBody className="space-y-4">
        <div>
          <Label htmlFor="oo-code">Код заказа</Label>
          <Input
            id="oo-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            maxLength={64}
            placeholder="OUT-001"
          />
        </div>
        <div>
          <Label htmlFor="oo-status">Статус</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="oo-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Открыт</SelectItem>
              <SelectItem value="picking">Комплектация</SelectItem>
              <SelectItem value="packed">Упакован</SelectItem>
              <SelectItem value="shipped">Отгружен</SelectItem>
              <SelectItem value="closed">Закрыт</SelectItem>
              <SelectItem value="cancelled">Отменён</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="oo-ship-by">Отгрузить до</Label>
          <Input
            id="oo-ship-by"
            type="datetime-local"
            value={shipByAt}
            onChange={(e) => setShipByAt(e.target.value)}
          />
        </div>
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button type="submit" loading={isPending}>
          {initial ? "Сохранить" : "Создать"}
        </Button>
      </DialogFooter>
    </form>
  )
}
