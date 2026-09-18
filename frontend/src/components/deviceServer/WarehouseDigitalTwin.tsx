import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import {
  occupancyStatsForTwin,
  occupiedCellKeysForTwin,
} from "./twinOccupancy.ts"
import { useSimData, useSimMotion } from "./useDeviceSimulation.ts"
import { WarehouseLiveMap } from "./WarehouseLiveMap.tsx"
import {
  type TwinViewMode,
  WarehouseViewSwitcher,
} from "./WarehouseViewSwitcher.tsx"

const Warehouse3D = lazy(async () => {
  const mod = await import("./Warehouse3D.tsx")
  return { default: mod.Warehouse3D }
})

export function WarehouseDigitalTwin({
  selectedDeviceId,
  onSelectDevice,
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
}) {
  const [view, setView] = useState<TwinViewMode>("2d")
  const [mounted3d, setMounted3d] = useState(false)
  const occupancy = useTwinOccupancy()

  useEffect(() => {
    if (view === "3d") setMounted3d(true)
  }, [view])

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Warehouse Digital Twin
        </h2>
        <WarehouseViewSwitcher value={view} onChange={setView} />
      </div>
      {view === "2d" && (
        <WarehouseLiveMap
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
          occupiedCellKeys={occupancy.keys}
        />
      )}
      {mounted3d && (
        <div className={view === "3d" ? undefined : "hidden"}>
          <Suspense
            fallback={
              <div className="flex h-[min(62vh,640px)] min-h-[420px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
                Загрузка 3D…
              </div>
            }
          >
            <Warehouse3D
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={onSelectDevice}
              active={view === "3d"}
            />
          </Suspense>
        </div>
      )}
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        Warehouse occupancy: total cells: {occupancy.stats.total} occupied
        cells: {occupancy.stats.occupied} empty cells: {occupancy.stats.empty}{" "}
        occupancy: {occupancy.stats.percent}%
      </p>
    </div>
  )
}

export function useTwinOccupancy() {
  const data = useSimData()
  const motion = useSimMotion()
  return useMemo(() => {
    const keys = occupiedCellKeysForTwin(
      data.occupiedCellIds,
      motion.rackFill,
    )
    const stats = occupancyStatsForTwin(
      data.cellsTotal,
      data.cellsOccupied,
      data.occupiedCellIds,
      motion.rackFill,
    )
    return { keys, stats }
  }, [
    data.cellsOccupied,
    data.cellsTotal,
    data.occupiedCellIds,
    motion.rackFill,
  ])
}
