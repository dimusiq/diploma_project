import { lazy, Suspense, useState } from "react"
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

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Warehouse Digital Twin
        </h2>
        <WarehouseViewSwitcher value={view} onChange={setView} />
      </div>
      {view === "2d" ? (
        <WarehouseLiveMap
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
        />
      ) : (
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
          />
        </Suspense>
      )}
    </div>
  )
}
