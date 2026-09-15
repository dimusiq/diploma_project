/** Панель управления симуляцией: запуск, скорость модельного времени, сброс. */

import {
  FiAlertOctagon,
  FiBellOff,
  FiFastForward,
  FiPause,
  FiPlay,
  FiPlus,
  FiRotateCcw,
  FiSquare,
  FiTruck,
} from "react-icons/fi"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils"
import { formatSimClock } from "./simFormat.ts"
import type { SimSpeed } from "./simStore.ts"
import { deviceSimulation, SPEED_OPTIONS } from "./simStore.ts"
import { useSimData } from "./useDeviceSimulation.ts"

export function SimControlBar() {
  const data = useSimData()
  const faults = data.devices.filter(
    (device) => device.status === "fault" || device.status === "jam",
  ).length
  const alarms = data.devices.filter((device) => device.alarm).length
  const offline = data.devices.filter((device) => !device.online).length

  const stateLabel =
    data.state === "RUNNING"
      ? "RUNNING"
      : data.state === "PAUSED"
        ? "PAUSED"
        : "STOPPED"

  return (
    <div className="sticky top-0 z-20 mb-4 rounded-lg border bg-card/95 p-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2.5 rounded-full",
              data.state === "RUNNING"
                ? "animate-pulse bg-emerald-500"
                : data.state === "PAUSED"
                  ? "bg-amber-500"
                  : "bg-muted-foreground",
            )}
          />
          <span className="text-sm font-medium">{stateLabel}</span>
        </div>

        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatSimClock(data.timeSec, deviceSimulation.dayStartSec)}
        </span>
        {data.realTime && (
          <span className="text-xs text-muted-foreground">
            реальное {new Date(data.realTime).toLocaleTimeString("ru-RU")}
          </span>
        )}

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={data.state === "RUNNING" ? "outline" : "default"}
            onClick={() => deviceSimulation.start()}
            disabled={data.state === "RUNNING"}
          >
            <FiPlay aria-hidden /> START
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => deviceSimulation.pause()}
            disabled={data.state !== "RUNNING"}
          >
            <FiPause aria-hidden /> PAUSE
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => deviceSimulation.stop()}
            disabled={data.state === "STOPPED"}
          >
            <FiSquare aria-hidden /> STOP
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => deviceSimulation.reset()}
          >
            <FiRotateCcw aria-hidden /> RESET
          </Button>
          <Button
            size="sm"
            onClick={() => deviceSimulation.startDemo()}
            title="Полный складской цикл на реальных заказах, товарах и заданиях"
          >
            <FiPlay aria-hidden /> Start Demo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => deviceSimulation.resetDemo()}
            title="Сбросить симуляцию и связанные заказы, остатки, задания и отгрузки"
          >
            <FiRotateCcw aria-hidden /> Reset Demo
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Скорость</span>
          {SPEED_OPTIONS.map((speed) => (
            <Button
              key={speed}
              size="xs"
              variant={data.speed === speed ? "default" : "outline"}
              onClick={() => deviceSimulation.setSpeed(speed as SimSpeed)}
            >
              ×{speed}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => deviceSimulation.fastForward(900)}
            title="Прокрутить модель на 15 минут"
          >
            <FiFastForward aria-hidden /> +15 мин
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              deviceSimulation.command({ type: "spawnInboundTruck" })
            }
          >
            <FiTruck aria-hidden /> Транспорт
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              deviceSimulation.command({ type: "spawnOutboundOrder" })
            }
          >
            <FiPlus aria-hidden /> Заказ
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => deviceSimulation.command({ type: "clearAllAlarms" })}
          >
            <FiBellOff aria-hidden /> Сбросить аварии
          </Button>
          <Button
            size="xs"
            variant={offline > 0 ? "default" : "destructive"}
            onClick={() =>
              deviceSimulation.command({
                type: offline > 0 ? "resumeAll" : "emergencyStop",
              })
            }
          >
            <FiAlertOctagon aria-hidden />
            {offline > 0 ? "Возобновить" : "Аварийный стоп"}
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">События: {data.metrics.eventsTotal}</Badge>
          {faults > 0 && <Badge variant="destructive">Отказы: {faults}</Badge>}
          {alarms > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/60 text-amber-600 dark:text-amber-400"
            >
              Аварии датчиков: {alarms}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
