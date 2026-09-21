import { useEffect, useState } from "react"
import { DeviceInspector } from "@/components/deviceServer/DeviceFleetPanel.tsx"
import { EventStreamPanel } from "@/components/deviceServer/EventStreamPanel.tsx"
import { WarehouseDigitalTwin } from "@/components/deviceServer/WarehouseDigitalTwin.tsx"
import { DigitalTwinOverview } from "@/components/digitalTwin/DigitalTwinOverview.tsx"
import { TwinAnalyticsPanel } from "@/components/digitalTwin/TwinAnalyticsPanel.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { WarehouseTasksView } from "@/components/warehouse/WarehouseTasksView.tsx"
import type {
  DigitalTwinTab,
  DigitalTwinView,
} from "@/lib/digitalTwinSearch.ts"

export function DigitalTwinWorkspace({
  tab,
  view,
  deviceId,
  onTabChange,
  onViewChange,
}: {
  tab: DigitalTwinTab
  view: DigitalTwinView
  deviceId?: string
  onTabChange: (tab: DigitalTwinTab) => void
  onViewChange: (view: DigitalTwinView) => void
}) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    deviceId ?? null,
  )

  useEffect(() => {
    if (deviceId) setSelectedDeviceId(deviceId)
  }, [deviceId])

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:py-8">
      <h1 className="font-heading mb-1 text-2xl font-semibold tracking-tight">
        Digital Twin
      </h1>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Операционное пространство склада: карта, задания, события и аналитика.
        Управление runtime симуляции — в Device Monitor.
      </p>

      <Tabs
        value={tab}
        onValueChange={(next) => onTabChange(next as DigitalTwinTab)}
      >
        <TabsList variant="line" className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="map">Карта</TabsTrigger>
          <TabsTrigger value="tasks">Задания</TabsTrigger>
          <TabsTrigger value="events">События</TabsTrigger>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <DigitalTwinOverview />
        </TabsContent>

        <TabsContent value="map" forceMount className="mt-0">
          <div className={tab === "map" ? undefined : "hidden"}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <WarehouseDigitalTwin
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={setSelectedDeviceId}
                view={view}
                onViewChange={onViewChange}
                sceneActive={tab === "map"}
                title={null}
              />
              <DeviceInspector deviceId={selectedDeviceId} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <WarehouseTasksView showChrome={false} />
        </TabsContent>

        <TabsContent value="events">
          <EventStreamPanel
            variant="operator"
            deviceId={selectedDeviceId}
            persistHistory
          />
        </TabsContent>

        <TabsContent value="analytics">
          <TwinAnalyticsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
