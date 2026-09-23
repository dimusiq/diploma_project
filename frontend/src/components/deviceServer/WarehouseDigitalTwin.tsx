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
  selectedPersonId = null,
  onSelectPerson,
  view: viewProp,
  onViewChange,
  sceneActive = true,
  title = "Warehouse Digital Twin",
}: {
  selectedDeviceId: string | null
  onSelectDevice: (deviceId: string | null) => void
  selectedPersonId?: string | null
  onSelectPerson?: (personId: string | null) => void
  view?: TwinViewMode
  onViewChange?: (view: TwinViewMode) => void
  sceneActive?: boolean
  title?: string | null
}) {
  const [uncontrolledView, setUncontrolledView] = useState<TwinViewMode>("2d")
  const view = viewProp ?? uncontrolledView
  const setView = onViewChange ?? setUncontrolledView
  const [mounted3d, setMounted3d] = useState(false)
  const occupancy = useTwinOccupancy()

  useEffect(() => {
    if (view === "3d") setMounted3d(true)
  }, [view])

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {title ? (
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {title}
          </h2>
        ) : (
          <span />
        )}
        <WarehouseViewSwitcher value={view} onChange={setView} />
      </div>
      <div className={view === "2d" ? "min-w-0" : "hidden"}>
        <WarehouseLiveMap
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
          occupiedCellKeys={occupancy.keys}
        />
      </div>
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
              selectedPersonId={selectedPersonId}
              onSelectPerson={onSelectPerson}
              active={view === "3d" && sceneActive}
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
