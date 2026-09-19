import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link as RouterLink } from "@tanstack/react-router"
import { useState } from "react"
import { outboundOrdersApi } from "@/api/outboundOrders.ts"
import { ApiError } from "@/client/index.ts"
import { OutboundOrderCard, OutboundOrderDetailDialog } from "@/components/outbound/OutboundOrderCard.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

const PER_PAGE = 20

export function OutboundShipmentBoard({
  stage,
}: {
  stage: "ready" | "shipped"
}) {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [customer, setCustomer] = useState("")
  const [transport, setTransport] = useState("")
  const [readyDate, setReadyDate] = useState("")
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  const params = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
    search: search.trim() || undefined,
    customer: customer.trim() || undefined,
    transport: (transport || undefined) as "assigned" | "unassigned" | undefined,
    ready_date: readyDate || undefined,
  }

  const listQ = useQuery({
    queryKey: ["outbound-orders", stage, params],
    queryFn: () =>
      stage === "ready"
        ? outboundOrdersApi.listReady(params)
        : outboundOrdersApi.listShippedBoard(params),
  })

  const shipMut = useMutation({
    mutationFn: (id: string) => outboundOrdersApi.ship(id),
    onSuccess: () => {
      showSuccessToast("Заказ отгружен")
      void qc.invalidateQueries({ queryKey: ["outbound-orders"] })
      void qc.invalidateQueries({ queryKey: ["items"] })
    },
    onError: (e: unknown) => {
      showErrorToast(e instanceof ApiError ? e.message : "Не удалось отгрузить заказ")
    },
  })

  const totalPages = Math.max(1, Math.ceil((listQ.data?.count ?? 0) / PER_PAGE))
  const rows = listQ.data?.data ?? []

  return (
    <div className="space-y-6">
      {stage === "ready" && listQ.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Готово к отгрузке" value={listQ.data.ready_count} />
          <Kpi label="Позиций" value={listQ.data.items_count} />
          <Kpi label="Паллет" value={listQ.data.pallets_count} />
          <Kpi label="Ожидает транспорта" value={listQ.data.awaiting_transport} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Номер заказа</p>
          <Input
            className="h-9 w-[220px] text-sm"
            placeholder="OUT-1024"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Клиент</p>
          <Input
            className="h-9 w-[220px] text-sm"
            placeholder="Клиент"
            value={customer}
            onChange={(e) => {
              setCustomer(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {stage === "ready" ? "Дата готовности" : "Дата отгрузки"}
          </p>
          <Input
            type="date"
            className="h-9 w-[180px] text-sm"
            value={readyDate}
            onChange={(e) => {
              setReadyDate(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Транспорт</p>
          <Select
            value={toSelectAll(transport)}
            onValueChange={(v) => {
              setTransport(fromSelectAll(v))
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-[200px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL_VALUE}>Все</SelectItem>
              <SelectItem value="assigned">Назначен</SelectItem>
              <SelectItem value="unassigned">Не назначен</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {listQ.isPending ? (
        <Skeleton className="h-64" />
      ) : listQ.isError ? (
        <p className="text-destructive">
          {listQ.error instanceof ApiError
            ? listQ.error.message
            : "Не удалось загрузить заказы"}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState stage={stage} />
      ) : (
        <div className="grid gap-4">
          {rows.map((order) => (
            <OutboundOrderCard
              key={order.id}
              order={order}
              stage={stage}
              onOpen={() => setOpenId(order.id)}
              onShip={
                stage === "ready"
                  ? () => shipMut.mutate(order.id)
                  : undefined
              }
              shipPending={shipMut.isPending && shipMut.variables === order.id}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && rows.length > 0 ? (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Вперёд
          </Button>
        </div>
      ) : null}

      {openId ? (
        <OutboundOrderDetailDialog
          orderId={openId}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ stage }: { stage: "ready" | "shipped" }) {
  if (stage === "shipped") {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">Нет отгруженных заказов</p>
        <p className="mt-1 text-sm text-muted-foreground">
          После отгрузки исходящий заказ появится здесь.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <p className="font-medium">Нет заказов, готовых к отгрузке</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Когда комплектация и упаковка исходящего заказа будут завершены, он
        появится здесь.
      </p>
      <Button asChild size="sm" className="mt-4">
        <RouterLink to="/outbound-orders">Перейти к исходящим заказам</RouterLink>
      </Button>
    </div>
  )
}
