import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  DeviceFleetPanel,
  DeviceInspector,
} from "@/components/deviceServer/DeviceFleetPanel.tsx"
import { EventStreamPanel } from "@/components/deviceServer/EventStreamPanel.tsx"
import { GeneratorPanel } from "@/components/deviceServer/GeneratorPanel.tsx"
import { OrdersPanel } from "@/components/deviceServer/OrdersPanel.tsx"
import { SimControlBar } from "@/components/deviceServer/SimControlBar.tsx"
import { SimKpiStrip } from "@/components/deviceServer/SimKpiStrip.tsx"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { TasksPanel } from "@/components/deviceServer/TasksPanel.tsx"
import { WarehouseDigitalTwin } from "@/components/deviceServer/WarehouseDigitalTwin.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { canAccessWarehouseSim } from "@/lib/warehouseSimAccess.ts"

export const Route = createFileRoute("/_layout/device-server")({
  beforeLoad: ({ context }) => {
    const user = context.queryClient.getQueryData<{
      is_superuser?: boolean
      role_name?: string | null
    }>(["currentUser"])
    if (!canAccessWarehouseSim(user)) {
      throw redirect({ to: "/" })
    }
  },
  component: DeviceServerPage,
})

function DeviceServerPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)

  // Модель живёт в модульном синглтоне: она продолжает работать при переходе
  // на другие вкладки и останавливается только кнопкой «Пауза».
  useEffect(() => {
    deviceSimulation.autoStart()
  }, [])

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:py-8">
      <h1 className="font-heading mb-2 text-2xl font-semibold tracking-tight">
        Warehouse Device Server
      </h1>
      <p className="mb-6 max-w-4xl text-sm text-muted-foreground">
        Warehouse Simulation &amp; Event Generator — сервер устройств и
        генератор событий. Состояние склада считается на backend: техника едет
        по проездам, задания назначаются, товар принимается и отгружается.
        Эта страница только отображает снимок и отправляет команды.
      </p>

      <SimControlBar />
      <SimKpiStrip />

      <Tabs defaultValue="map">
        <TabsList variant="line" className="mb-4 flex-wrap">
          <TabsTrigger value="map">План склада</TabsTrigger>
          <TabsTrigger value="devices">Устройства</TabsTrigger>
          <TabsTrigger value="events">Поток событий</TabsTrigger>
          <TabsTrigger value="orders">Заказы и транспорт</TabsTrigger>
          <TabsTrigger value="tasks">Задания и смена</TabsTrigger>
          <TabsTrigger value="generator">Генератор</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <WarehouseDigitalTwin
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
            />
            <DeviceInspector deviceId={selectedDeviceId} />
          </div>
        </TabsContent>

        <TabsContent value="devices">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <DeviceFleetPanel
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
            />
            <DeviceInspector deviceId={selectedDeviceId} />
          </div>
        </TabsContent>

        <TabsContent value="events">
          <EventStreamPanel />
        </TabsContent>

        <TabsContent value="orders">
          <OrdersPanel />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksPanel />
        </TabsContent>

        <TabsContent value="generator">
          <GeneratorPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
