/**
 * Живой план склада: зоны, стеллажи с заполнением, ворота, транспорт
 * и движущаяся техника. Перерисовывается 20 раз в секунду из снимка движения.
 */

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  PACKING_POINT,
  RECEIVING_STAGING,
  SHIPPING_STAGING,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
} from "./simLayout.ts"
import type { DeviceMotion, TruckMotion } from "./simStore.ts"
import { deviceSimulation } from "./simStore.ts"
import type { ZoneKind } from "./simTypes.ts"
import { occupiedCellKeysForTwin } from "./twinOccupancy.ts"
import { useSimData, useSimMotion } from "./useDeviceSimulation.ts"

const ZONE_TONE: Record<ZoneKind, string> = {
  receiving: "fill-sky-500/10 stroke-sky-500/40",
  storage: "fill-foreground/[0.03] stroke-border",
  picking: "fill-orange-500/10 stroke-orange-500/40",
  packing: "fill-violet-500/10 stroke-violet-500/40",
  shipping: "fill-emerald-500/10 stroke-emerald-500/40",
  charging: "fill-amber-500/10 stroke-amber-500/40",
  yard: "fill-muted stroke-border",
}

const STAGING_MARKERS = [
  { pos: RECEIVING_STAGING, label: "Буфер приёмки" },
  { pos: PACKING_POINT, label: "Упаковка" },
  { pos: SHIPPING_STAGING, label: "Буфер отгрузки" },
]

function deviceTone(device: DeviceMotion): string {
  if (!device.online) return "fill-muted-foreground/40"
  if (device.status === "fault" || device.status === "jam")
    return "fill-destructive"
  if (device.alarm) return "fill-amber-500"
  switch (device.kind) {
    case "forklift":
      return "fill-amber-500"
    case "agv":
      return "fill-sky-500"
    case "amr":
      return "fill-violet-500"
    case "conveyor":
      return "fill-emerald-600"
    case "charger":
      return "fill-amber-600"
    case "dock_door":
      return device.status === "occupied"
        ? "fill-emerald-500"
        : "fill-muted-foreground"
    default:
      return "fill-muted-foreground"
  }
}

function DeviceShape({ device }: { device: DeviceMotion }) {
  const tone = deviceTone(device)
  switch (device.kind) {
    case "forklift":
      return (
        <rect
          x={-1.5}
          y={-0.9}
          width={3}
          height={1.8}
          rx={0.4}
          className={tone}
        />
      )
    case "agv":
      return (
        <rect
          x={-1.1}
          y={-1.1}
          width={2.2}
          height={2.2}
          rx={1.1}
          className={tone}
        />
      )
    case "amr":
      return <polygon points="0,-1.3 1.2,0.9 -1.2,0.9" className={tone} />
    case "conveyor":
      return (
        <rect
          x={-6}
          y={-0.8}
          width={12}
          height={1.6}
          rx={0.4}
          className={tone}
        />
      )
    case "scanner":
      return (
        <rect
          x={-0.7}
          y={-1.4}
          width={1.4}
          height={2.8}
          rx={0.3}
          className={tone}
        />
      )
    case "sensor":
      return <circle r={0.9} className={tone} />
    case "terminal":
      return (
        <rect
          x={-0.9}
          y={-1.1}
          width={1.8}
          height={2.2}
          rx={0.3}
          className={tone}
        />
      )
    case "charger":
      return (
        <rect
          x={-1.2}
          y={-1}
          width={2.4}
          height={2}
          rx={0.3}
          className={tone}
        />
      )
    case "printer":
      return (
        <rect
          x={-0.9}
          y={-0.7}
          width={1.8}
          height={1.4}
          rx={0.3}
          className={tone}
        />
      )
    default:
      return <circle r={1} className={tone} />
  }
}

function TruckShape({ truck }: { truck: TruckMotion }) {
  return (
    <g>
      <rect
        x={-5}
        y={-1.8}
        width={10}
        height={3.6}
        rx={0.6}
        className={
          truck.direction === "inbound"
            ? "fill-sky-600/80"
            : "fill-emerald-600/80"
        }
      />
      <rect
        x={truck.direction === "inbound" ? 3.4 : -5}
        y={-1.8}
        width={1.6}
        height={3.6}
        className="fill-foreground/40"
      />
      <text
        y={-2.8}
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 1.9 }}
      >
        {truck.plate}
      </text>
    </g>
  )
}

interface WarehouseLiveMapProps {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
  occupiedCellKeys?: Set<string>
}

export function WarehouseLiveMap({
  selectedDeviceId,
  onSelectDevice,
  occupiedCellKeys,
}: WarehouseLiveMapProps) {
  const motion = useSimMotion()
  const data = useSimData()
  const topology = deviceSimulation.topology

  const fillByRack = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of motion.rackFill) {
      map.set(item.rackId, item.total > 0 ? item.occupied / item.total : 0)
    }
    return map
  }, [motion.rackFill])

  const cellKeys = useMemo(
    () =>
      occupiedCellKeys ??
      occupiedCellKeysForTwin(data.occupiedCellIds, motion.rackFill),
    [occupiedCellKeys, data.occupiedCellIds, motion.rackFill],
  )

  return (
    <div className="rounded-lg border bg-card p-2">
      <svg
        viewBox={`-26 -7 ${WAREHOUSE_WIDTH + 52} ${WAREHOUSE_DEPTH + 14}`}
        className="h-auto w-full"
        role="img"
        aria-label="План склада в реальном времени"
      >
        {/* Контур здания */}
        <rect
          x={0}
          y={0}
          width={WAREHOUSE_WIDTH}
          height={WAREHOUSE_DEPTH}
          rx={1}
          className="fill-background stroke-foreground/30"
          strokeWidth={0.4}
        />

        {/* Зоны */}
        {topology.zones.map((zone) => (
          <g key={zone.id}>
            <rect
              x={zone.x}
              y={zone.z}
              width={zone.w}
              height={zone.d}
              rx={0.8}
              className={ZONE_TONE[zone.kind]}
              strokeWidth={0.25}
              strokeDasharray="1.5 1"
            />
            <text
              x={zone.x + 1}
              y={zone.z + 3}
              className="fill-muted-foreground"
              style={{ fontSize: 2.4, fontWeight: 600 }}
            >
              {zone.name}
            </text>
          </g>
        ))}

        {/* Проезды */}
        {topology.aisleZ.map((z) => (
          <line
            key={`aisle-${z}`}
            x1={topology.corridorX[0]}
            y1={z}
            x2={topology.corridorX[topology.corridorX.length - 1]}
            y2={z}
            className="stroke-muted-foreground/30"
            strokeWidth={0.15}
            strokeDasharray="2 2"
          />
        ))}
        {topology.corridorX.map((x) => (
          <line
            key={`corridor-${x}`}
            x1={x}
            y1={2}
            x2={x}
            y2={WAREHOUSE_DEPTH - 2}
            className="stroke-muted-foreground/30"
            strokeWidth={0.15}
            strokeDasharray="2 2"
          />
        ))}

        {/* Стеллажи с заполнением */}
        {topology.racks.map((rack, rackIndex) => {
          const ratio = fillByRack.get(rack.id) ?? 0
          const bayW = rack.w / Math.max(1, rack.bays)
          return (
            <g key={rack.id}>
              <rect
                x={rack.x}
                y={rack.z}
                width={rack.w}
                height={rack.d}
                rx={0.3}
                className="fill-foreground stroke-border"
                fillOpacity={0.08 + ratio * 0.2}
                strokeWidth={0.2}
              />
              {Array.from({ length: rack.bays }, (_, bay) => {
                const occupiedLevels = [0, 1, 2].filter((level) =>
                  cellKeys.has(`${rackIndex}-${level}-${bay}-0`),
                ).length
                if (!occupiedLevels) return null
                return (
                  <rect
                    key={`${rack.id}-occ-${bay}`}
                    x={rack.x + bay * bayW + 0.08}
                    y={rack.z + 0.12}
                    width={bayW - 0.16}
                    height={rack.d - 0.24}
                    className="fill-foreground"
                    fillOpacity={0.18 + occupiedLevels * 0.18}
                  />
                )
              })}
              {Array.from({ length: Math.max(0, rack.bays - 1) }, (_, i) => {
                const x = rack.x + ((i + 1) / rack.bays) * rack.w
                return (
                  <line
                    key={`${rack.id}-bay-${i}`}
                    x1={x}
                    y1={rack.z + 0.15}
                    x2={x}
                    y2={rack.z + rack.d - 0.15}
                    className="stroke-border"
                    strokeWidth={0.08}
                  />
                )
              })}
              <text
                x={rack.x - 1.2}
                y={rack.z + rack.d / 2 + 0.8}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: 2 }}
              >
                {rack.code}
              </text>
              <text
                x={rack.x + rack.w + 1.2}
                y={rack.z + rack.d / 2 + 0.8}
                className="fill-muted-foreground"
                style={{ fontSize: 1.8 }}
              >
                {Math.round(ratio * 100)}%
              </text>
            </g>
          )
        })}

        {/* Ворота */}
        {topology.docks.map((dock) => {
          const door = motion.devices.find((device) => device.id === dock.id)
          const busy = door?.status === "occupied"
          return (
            <g key={dock.id}>
              <rect
                x={dock.pos.x - 2}
                y={dock.pos.z - 2.5}
                width={4}
                height={5}
                rx={0.4}
                className={
                  busy ? "fill-emerald-500/70" : "fill-muted-foreground/40"
                }
              />
              <text
                x={dock.pos.x}
                y={dock.pos.z + 4.6}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 1.8 }}
              >
                {dock.code}
              </text>
            </g>
          )
        })}

        {/* Буферные точки */}
        {STAGING_MARKERS.map((marker) => (
          <g key={marker.label}>
            <circle
              cx={marker.pos.x}
              cy={marker.pos.z}
              r={1.6}
              className="fill-none stroke-muted-foreground/60"
              strokeWidth={0.25}
              strokeDasharray="1 0.8"
            />
          </g>
        ))}

        {/* Паллеты в буферных зонах */}
        {Object.entries(motion.zonePallets).map(([zoneId, count]) => {
          const zone = topology.zones.find((item) => item.id === zoneId)
          if (!zone || count === 0) return null
          return (
            <text
              key={zoneId}
              x={zone.x + zone.w - 1}
              y={zone.z + zone.d - 1.5}
              textAnchor="end"
              className="fill-foreground"
              style={{ fontSize: 2.2, fontWeight: 600 }}
            >
              {count} пал.
            </text>
          )
        })}

        {/* Транспорт */}
        {motion.trucks.map((truck) => (
          <g key={truck.id} transform={`translate(${truck.x} ${truck.z})`}>
            <TruckShape truck={truck} />
          </g>
        ))}

        {/* Устройства */}
        {motion.devices.map((device) => {
          const selected = device.id === selectedDeviceId
          const alerting =
            device.status === "fault" || device.status === "jam" || device.alarm
          return (
            <g
              key={device.id}
              transform={`translate(${device.x} ${device.z})`}
              aria-label={device.name}
              className="cursor-pointer"
              onClick={() => onSelectDevice(device.id)}
            >
              {alerting && (
                <circle
                  r={3}
                  className={cn(
                    "fill-none",
                    device.alarm && device.status !== "fault"
                      ? "stroke-amber-500"
                      : "stroke-destructive",
                  )}
                  strokeWidth={0.35}
                  opacity={0.8}
                />
              )}
              {selected && (
                <circle
                  r={4}
                  className="fill-none stroke-primary"
                  strokeWidth={0.4}
                />
              )}
              <DeviceShape device={device} />
              {device.carrying && (
                <rect
                  x={-0.8}
                  y={-2.6}
                  width={1.6}
                  height={1.4}
                  rx={0.2}
                  className="fill-orange-400 stroke-orange-700"
                  strokeWidth={0.15}
                />
              )}
              {(device.kind === "forklift" ||
                device.kind === "agv" ||
                device.kind === "amr") && (
                <text
                  y={3.4}
                  textAnchor="middle"
                  className={
                    selected ? "fill-foreground" : "fill-foreground/60"
                  }
                  style={{ fontSize: 1.7, fontWeight: selected ? 700 : 400 }}
                >
                  {/* Заряд — только у выбранного: иначе подписи наезжают друг на друга. */}
                  {selected && device.battery !== null
                    ? `${device.id.toUpperCase()} ${Math.round(device.battery)}%`
                    : device.id.toUpperCase()}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <MapLegend />
    </div>
  )
}

function MapLegend() {
  const items = [
    { tone: "bg-amber-500", label: "Погрузчики" },
    { tone: "bg-sky-500", label: "AGV" },
    { tone: "bg-violet-500", label: "AMR" },
    { tone: "bg-emerald-600", label: "Конвейеры и занятые ворота" },
    { tone: "bg-orange-400", label: "Паллета на технике" },
    { tone: "bg-destructive", label: "Отказ / замятие" },
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", item.tone)} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
