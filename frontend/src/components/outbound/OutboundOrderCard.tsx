import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink } from "@tanstack/react-router"
import {
  type OutboundFulfillmentPublic,
  outboundOrdersApi,
} from "@/api/outboundOrders.ts"
import { outboundStatusBadge, stepLabel } from "@/components/outbound/outboundLabels.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import {
  getEventTypeLabel,
  getItemStatusLabel,
  getShipmentStatusLabel,
  getTaskStatusLabel,
  getTaskTypeLabel,
} from "@/lib/statusLabels.ts"

export function OutboundOrderCard({
  order,
  stage,
  onOpen,
  onShip,
  shipPending,
}: {
  order: OutboundFulfillmentPublic
  stage: "ready" | "shipped"
  onOpen: () => void
  onShip?: () => void
  shipPending?: boolean
}) {
  const readyAt = order.ready_at
    ? new Date(order.ready_at).toLocaleString("ru-RU")
    : "—"
  const shippedAt = new Date(order.updated_at).toLocaleString("ru-RU")

  return (
    <Card className="ring-foreground/10">
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">
            Заказ #{order.code}
          </h2>
          {outboundStatusBadge(order.status)}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Клиент</dt>
            <dd>{order.customer ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Позиций</dt>
            <dd>{order.items_count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Паллет</dt>
            <dd>{order.pallets_count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Количество</dt>
            <dd>{order.total_quantity}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Комплектация</dt>
            <dd>
              {stepLabel(
                order.picking_status === "complete",
                "Завершена",
                "В работе",
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Упаковка</dt>
            <dd>
              {stepLabel(
                order.packing_status === "complete",
                "Завершена",
                "Не завершена",
              )}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          {stage === "ready"
            ? `Время готовности: ${readyAt}`
            : `Отгружен: ${shippedAt}`}
        </p>
        <p className="text-sm">
          Транспорт:{" "}
          {order.transport_assigned
            ? `${order.transport_label ?? order.transport_id} (${order.transport_status ? getShipmentStatusLabel(order.transport_status) : "назначен"})`
            : "Не назначен"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onOpen}>
            Подробнее
          </Button>
          {stage === "ready" && onShip ? (
            <Button size="sm" loading={shipPending} onClick={onShip}>
              Отгрузить
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function OutboundOrderDetailDialog({
  orderId,
  onClose,
}: {
  orderId: string
  onClose: () => void
}) {
  const q = useQuery({
    queryKey: ["outbound-orders", "fulfillment", orderId],
    queryFn: () => outboundOrdersApi.getFulfillment(orderId),
  })
  const order = q.data

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              {order ? `Заказ #${order.code}` : "Заказ"}
            </h2>
            {order ? outboundStatusBadge(order.status) : null}
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        {q.isPending ? (
          <Skeleton className="h-48" />
        ) : q.isError || !order ? (
          <p className="text-sm text-destructive">Не удалось загрузить заказ</p>
        ) : (
          <Tabs defaultValue="general" className="text-sm">
            <TabsList className="flex h-auto flex-wrap">
              <TabsTrigger value="general">Общее</TabsTrigger>
              <TabsTrigger value="items">Позиции</TabsTrigger>
              <TabsTrigger value="timeline">Хронология</TabsTrigger>
              <TabsTrigger value="tasks">Задания</TabsTrigger>
              <TabsTrigger value="equipment">Техника</TabsTrigger>
              <TabsTrigger value="shipment">Отгрузка</TabsTrigger>
              <TabsTrigger value="events">События</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="grid grid-cols-2 gap-2">
              <p>Номер: {order.code}</p>
              <p>Клиент: {order.customer ?? "—"}</p>
              <p>Создан: {new Date(order.created_at).toLocaleString("ru-RU")}</p>
              <p>Позиций: {order.items_count}</p>
              <p>Количество: {order.total_quantity}</p>
              <p>Паллет: {order.pallets_count}</p>
            </TabsContent>
            <TabsContent value="items">
              {order.line_items.length === 0 && order.items.length === 0 ? (
                <p className="text-muted-foreground">Состав заказа не указан</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {order.line_items.map((line, i) => (
                    <li key={`${line.sku_id ?? "line"}-${i}`} className="px-3 py-2">
                      SKU {line.sku_id ?? "—"} · паллет {line.pallets} · кол-во{" "}
                      {line.quantity} · отобрано {line.picked}
                    </li>
                  ))}
                  {order.items.map((item) => (
                    <li key={item.id} className="px-3 py-2">
                      {item.title} · {item.sku ?? "без SKU"} ·{" "}
                      {getItemStatusLabel(item.status)} · {item.quantity}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="timeline">
              {order.timeline.length === 0 ? (
                <p className="text-muted-foreground">Событий пока нет</p>
              ) : (
                <ol className="space-y-2 border-l border-border pl-4">
                  {order.timeline.map((ev, i) => (
                    <li key={`${ev.kind}-${i}`}>
                      <p className="font-medium">{ev.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ev.at).toLocaleString("ru-RU")}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
            <TabsContent value="tasks">
              {order.tasks.length === 0 ? (
                <p className="text-muted-foreground">Связанных заданий нет</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {order.tasks.map((task) => (
                    <li key={task.id} className="px-3 py-2">
                      {getTaskTypeLabel(task.task_type)} · {getTaskStatusLabel(task.status)}
                      {task.source ? ` · ${task.source}` : ""}
                      {task.destination ? ` → ${task.destination}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="equipment">
              {(order.equipment ?? []).length === 0 ? (
                <p className="text-muted-foreground">Техника к заказу не назначена</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {(order.equipment ?? []).map((device) => (
                    <li key={device.id} className="px-3 py-2">
                      <RouterLink
                        className="text-primary hover:underline"
                        to="/equipment/$deviceId"
                        params={{ deviceId: device.id }}
                      >
                        {device.name}
                        {device.code ? ` · ${device.code}` : ""}
                      </RouterLink>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="shipment" className="space-y-1">
              <p>
                Статус отбора:{" "}
                {stepLabel(order.picking_status === "complete", "Отобрано", "Ожидает отбора")}
              </p>
              <p>
                Статус упаковки:{" "}
                {stepLabel(order.packing_status === "complete", "Упаковано", "Ожидает упаковки")}
              </p>
              <p>
                Транспорт:{" "}
                {order.transport_assigned
                  ? (order.transport_label ?? "Назначен")
                  : "Не назначен"}
              </p>
              <p>
                Статус транспорта:{" "}
                {order.transport_status
                  ? getShipmentStatusLabel(order.transport_status)
                  : "—"}
              </p>
              <RouterLink className="text-primary hover:underline" to="/shipment">
                Открыть отгрузки
              </RouterLink>
            </TabsContent>
            <TabsContent value="events">
              {(order.events ?? []).length === 0 ? (
                <p className="text-muted-foreground">Событий по заказу нет</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {(order.events ?? []).map((event) => (
                    <li key={event.id} className="px-3 py-2">
                      <p>{event.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {getEventTypeLabel(event.event_type)} ·{" "}
                        {new Date(event.at).toLocaleString("ru-RU")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
