import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  DeviceFleetPanel,
  DeviceInspector,
} from "@/components/deviceServer/DeviceFleetPanel.tsx"
import { EventStreamPanel } from "@/components/deviceServer/EventStreamPanel.tsx"
import { GeneratorPanel } from "@/components/deviceServer/GeneratorPanel.tsx"
import { OrdersPanel } from "@/components/deviceServer/OrdersPanel.tsx"
import { RuntimeStatusCard } from "@/components/deviceServer/RuntimeStatusCard.tsx"
import { SimControlBar } from "@/components/deviceServer/SimControlBar.tsx"
import { deviceSimulation } from "@/components/deviceServer/simStore.ts"
import { TasksPanel } from "@/components/deviceServer/TasksPanel.tsx"
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

  useEffect(() => {
    deviceSimulation.autoStart()
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
      <h1 className="font-heading mb-1 text-2xl font-semibold tracking-tight">
        Device Monitor
      </h1>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Engineering / Runtime Console. Управление SimulationManager, диагностика
        устройств и сырой поток событий. Карта склада — в Digital Twin.
      </p>

      <SimControlBar />
      <RuntimeStatusCard />

      <Tabs defaultValue="devices">
        <TabsList variant="line" className="mb-4 flex-wrap">
          <TabsTrigger value="devices">Диагностика устройств</TabsTrigger>
          <TabsTrigger value="events">Сырые события</TabsTrigger>
          <TabsTrigger value="orders">Заказы runtime</TabsTrigger>
          <TabsTrigger value="tasks">Задания runtime</TabsTrigger>
          <TabsTrigger value="generator">Генератор</TabsTrigger>
        </TabsList>

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
          <EventStreamPanel variant="technical" />
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
