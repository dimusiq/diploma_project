/** Документы и транспорт: поставки, заказы на отгрузку, машины на площадке. */

import { Badge } from "@/components/ui/badge.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { cn } from "@/lib/utils"
import {
  formatDuration,
  orderStatusTone,
  outboundStatusLabel,
  truckStatusLabel,
} from "./simFormat.ts"
import type { DataSnapshot } from "./simStore.ts"
import { useSimData } from "./useDeviceSimulation.ts"

const INBOUND_STATUS_LABELS: Record<string, string> = {
  awaiting: "Ожидает ворот",
  unloading: "Разгрузка",
  received: "Принято",
  closed: "Закрыто",
}

function dockCode(data: DataSnapshot, dockId: string | null): string {
  if (!dockId) return "—"
  const door = data.devices.find((device) => device.id === dockId)
  return door ? door.name.replace("Ворота ", "") : dockId
}

export function OrdersPanel() {
  const data = useSimData()
  const outbound = [...data.outbound].reverse()
  const inbound = [...data.inbound].reverse()

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-heading mb-2 text-sm font-semibold">
          Транспорт на площадке ({data.trucks.length})
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Номер</TableHead>
                <TableHead>Перевозчик</TableHead>
                <TableHead>Направление</TableHead>
                <TableHead>Состояние</TableHead>
                <TableHead>Ворота</TableHead>
                <TableHead className="text-right">Паллет</TableHead>
                <TableHead className="text-right">На площадке</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trucks.map((truck) => (
                <TableRow key={truck.id}>
                  <TableCell className="font-medium">{truck.plate}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {truck.carrier}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {truck.direction === "inbound" ? "Приёмка" : "Отгрузка"}
                    </Badge>
                  </TableCell>
                  <TableCell>{truckStatusLabel(truck.status)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {dockCode(data, truck.dockId)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {truck.palletsDone} / {truck.palletsPlanned}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatDuration(data.timeSec - truck.arrivedAt)}
                  </TableCell>
                </TableRow>
              ))}
              {data.trucks.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    Транспорта на площадке нет
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h3 className="font-heading mb-2 text-sm font-semibold">
          Исходящие заказы (
          {data.outbound.filter((o) => o.status !== "shipped").length} в работе)
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заказ</TableHead>
                <TableHead>Клиент</TableHead>
                <TableHead>Строки</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Срок</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbound.slice(0, 25).map((order) => {
                const left = order.dueAt - data.timeSec
                const overdue = left < 0 && order.status !== "shipped"
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {order.code}
                        {order.priority === "urgent" && (
                          <Badge variant="destructive">срочно</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.customer}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.lines
                        .map(
                          (line) =>
                            `${data.skuLabels[line.skuId] ?? line.skuId}: ${line.picked}/${line.pallets}`,
                        )
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                          orderStatusTone(order.status),
                        )}
                      >
                        {outboundStatusLabel(order.status)}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        overdue ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {order.status === "shipped"
                        ? "отгружен"
                        : overdue
                          ? `просрочка ${formatDuration(-left)}`
                          : formatDuration(left)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {outbound.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    Заказов пока нет
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h3 className="font-heading mb-2 text-sm font-semibold">
          Входящие поставки ({inbound.length})
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Документ</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Принято</TableHead>
                <TableHead className="text-right">Размещено</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inbound.slice(0, 20).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.code}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {data.skuLabels[item.skuId] ?? item.skuId}
                  </TableCell>
                  <TableCell>
                    {INBOUND_STATUS_LABELS[item.status] ?? item.status}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.palletsReceived} / {item.palletsPlanned}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.palletsPutaway}
                  </TableCell>
                </TableRow>
              ))}
              {inbound.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    Поставок пока нет
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
