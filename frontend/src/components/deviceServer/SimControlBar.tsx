/** Панель управления симуляцией: запуск, скорость модельного времени, сброс. */

import type { ReactNode } from "react"
import {
  FiAlertOctagon,
  FiBellOff,
  FiChevronDown,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import { cn } from "@/lib/utils"
import { formatSimClock } from "./simFormat.ts"
import type { SimSpeed } from "./simStore.ts"
import { deviceSimulation, SPEED_OPTIONS } from "./simStore.ts"
import { useSimData } from "./useDeviceSimulation.ts"

function ControlGroup({
  label,
  children,
  className,
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 flex-wrap items-center gap-1",
        className,
      )}
    >
      {label ? (
        <span className="mr-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  )
}

function GroupDivider() {
  return (
    <div
      aria-hidden
      className="hidden h-7 w-px bg-border lg:block"
    />
  )
}

export function SimControlBar() {
  const data = useSimData()
  const faults = data.devices.filter(
    (device) => device.status === "fault" || device.status === "jam",
  ).length
  const alarms = data.devices.filter((device) => device.alarm).length
  const offline = data.devices.filter((device) => !device.online).length
  const running = data.state === "RUNNING"
  const paused = data.state === "PAUSED"
  const stopped = data.state === "STOPPED"
  const emergencyActive = offline > 0

  const stateLabel = running ? "RUNNING" : paused ? "PAUSED" : "STOPPED"

  return (
    <div className="sticky top-0 z-20 mb-4 rounded-lg border bg-card/95 px-3 py-2.5 backdrop-blur">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2.5 rounded-full",
                running
                  ? "animate-pulse bg-emerald-500"
                  : paused
                    ? "bg-amber-500"
                    : "bg-muted-foreground",
              )}
            />
            <span
              className={cn(
                "text-sm font-semibold tracking-wide",
                running
                  ? "text-emerald-600 dark:text-emerald-400"
                  : paused
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {stateLabel}
            </span>
          </div>
          <span className="font-mono text-sm tabular-nums">
            {formatSimClock(data.timeSec, deviceSimulation.dayStartSec)}
          </span>
          {data.realTime && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              Реальное время{" "}
              {new Date(data.realTime).toLocaleTimeString("ru-RU")}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="font-normal">
              События {data.metrics.eventsTotal}
            </Badge>
            {faults > 0 && (
              <Badge variant="destructive">Отказы {faults}</Badge>
            )}
            {alarms > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/60 text-amber-600 dark:text-amber-400"
              >
                Аварии {alarms}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:ml-auto">
          <ControlGroup>
            <div className="inline-flex overflow-hidden rounded-md border bg-background">
              <Button
                size="sm"
                variant={running ? "ghost" : "default"}
                className="rounded-none border-0"
                onClick={() => deviceSimulation.start()}
                disabled={running}
              >
                <FiPlay aria-hidden /> START
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-none border-0 border-l"
                onClick={() => deviceSimulation.pause()}
                disabled={!running}
              >
                <FiPause aria-hidden /> PAUSE
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-none border-0 border-l"
                onClick={() => deviceSimulation.stop()}
                disabled={stopped}
              >
                <FiSquare aria-hidden /> STOP
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-none border-0 border-l text-muted-foreground"
                onClick={() => deviceSimulation.reset()}
              >
                <FiRotateCcw aria-hidden /> RESET
              </Button>
            </div>
          </ControlGroup>

          <GroupDivider />

          <ControlGroup label="Demo">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => deviceSimulation.startDemo()}
              title="Полный складской цикл на реальных заказах, товарах и заданиях"
            >
              <FiPlay aria-hidden /> Start Demo
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => deviceSimulation.resetDemo()}
              title="Сбросить симуляцию и связанные заказы, остатки, задания и отгрузки"
            >
              <FiRotateCcw aria-hidden /> Reset Demo
            </Button>
          </ControlGroup>

          <GroupDivider />

          <ControlGroup label="Скорость">
            <div className="inline-flex overflow-hidden rounded-md bg-muted/50 p-0.5">
              {SPEED_OPTIONS.map((speed) => (
                <Button
                  key={speed}
                  size="xs"
                  variant={data.speed === speed ? "default" : "ghost"}
                  className={cn(
                    "min-w-9 rounded-sm px-1.5 font-mono",
                    data.speed !== speed && "text-muted-foreground",
                  )}
                  onClick={() => deviceSimulation.setSpeed(speed as SimSpeed)}
                >
                  {speed}×
                </Button>
              ))}
            </div>
          </ControlGroup>

          <GroupDivider />

          <ControlGroup>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="xs" variant="ghost">
                  Действия
                  <FiChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem
                  onClick={() => deviceSimulation.fastForward(900)}
                >
                  <FiFastForward aria-hidden />
                  +15 мин
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    deviceSimulation.command({ type: "spawnInboundTruck" })
                  }
                >
                  <FiTruck aria-hidden />
                  Добавить транспорт
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    deviceSimulation.command({ type: "spawnOutboundOrder" })
                  }
                >
                  <FiPlus aria-hidden />
                  Создать заказ
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    deviceSimulation.command({ type: "clearAllAlarms" })
                  }
                >
                  <FiBellOff aria-hidden />
                  Сбросить аварии
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ControlGroup>

          <Button
            size="xs"
            variant={emergencyActive ? "default" : "outlineDestructive"}
            className={cn(
              "ml-0 font-semibold tracking-wide",
              !emergencyActive && "border-destructive/70",
            )}
            onClick={() =>
              deviceSimulation.command({
                type: emergencyActive ? "resumeAll" : "emergencyStop",
              })
            }
          >
            <FiAlertOctagon aria-hidden />
            {emergencyActive ? "Возобновить" : "Аварийный стоп"}
          </Button>
        </div>
      </div>
    </div>
  )
}
