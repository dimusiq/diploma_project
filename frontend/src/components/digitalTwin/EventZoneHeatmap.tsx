import { useMemo, useState } from "react"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"

const MODES = [
  { id: "movement", label: "Движение" },
  { id: "picking", label: "Отбор" },
  { id: "putaway", label: "Размещение" },
  { id: "congestion", label: "Заторы" },
  { id: "utilization", label: "Заполнение" },
] as const

type Mode = (typeof MODES)[number]["id"]
type RangeId = "shift" | "day" | "h24"

function matchesMode(type: string, severity: string, mode: Mode): boolean {
  const value = type.toUpperCase()
  if (mode === "movement") {
    return value.startsWith("AGV_") || value.startsWith("DEVICE_") || value.includes("MOV")
  }
  if (mode === "picking") return value.includes("PICK")
  if (mode === "putaway") return value.includes("PUTAWAY") || value === "ITEM_STORED"
  if (mode === "congestion") {
    return severity === "error" || severity === "warning" || value.includes("JAM")
  }
  return false
}

export function EventZoneHeatmap() {
  const data = useSimData()
  const [mode, setMode] = useState<Mode>("movement")
  const [range, setRange] = useState<RangeId>("day")

  const rows = useMemo(() => {
    if (mode === "utilization") return []
    const windowSec = range === "shift" ? 8 * 3600 : range === "h24" ? 24 * 3600 : 24 * 3600
    const from = data.timeSec - windowSec
    const counts = new Map<string, number>()
    for (const event of data.events) {
      if (event.at < from) continue
      if (!event.zoneId) continue
      if (!matchesMode(event.type, event.severity, mode)) continue
      counts.set(event.zoneId, (counts.get(event.zoneId) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([zone, count]) => ({ zone, count }))
      .sort((a, b) => b.count - a.count)
  }, [data.events, data.timeSec, mode, range])

  const max = rows[0]?.count ?? 0

  return (
    <Card className="mt-6 ring-foreground/10">
      <CardContent className="px-4 py-4">
        <h2 className="font-heading mb-1 text-sm font-semibold">Тепловая карта</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Только события с зоной. Если зона не записана, показывается пустое состояние.
        </p>
        <div className="mb-3 flex flex-wrap gap-1">
          {MODES.map((item) => (
            <Button
              key={item.id}
              size="xs"
              variant={mode === item.id ? "default" : "outline"}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </Button>
          ))}
          {(["shift", "day", "h24"] as const).map((item) => (
            <Button
              key={item}
              size="xs"
              variant={range === item ? "secondary" : "ghost"}
              onClick={() => setRange(item)}
            >
              {item === "shift" ? "Смена" : item === "day" ? "Сутки" : "24 ч"}
            </Button>
          ))}
        </div>
        {mode === "utilization" ? (
          <p className="text-sm">
            Заполнение ячеек: {data.cellsOccupied} из {data.cellsTotal}
            {data.cellsTotal === 0 ? ". Нет данных за выбранный период." : "."}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет данных за выбранный период
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.zone} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="truncate">{row.zone}</span>
                <span className="h-2 overflow-hidden rounded bg-muted">
                  <span
                    className="block h-full bg-orange-500"
                    style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }}
                  />
                </span>
                <span className="tabular-nums text-muted-foreground">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
