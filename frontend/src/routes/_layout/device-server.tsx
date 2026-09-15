import { createFileRoute } from "@tanstack/react-router"
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
import { WarehouseLiveMap } from "@/components/deviceServer/WarehouseLiveMap.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"

export const Route = createFileRoute("/_layout/device-server")({
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
        Сервер устройств и генератор событий
      </h1>
      <p className="mb-6 max-w-4xl text-sm text-muted-foreground">
        Симулятор автоматизированного склада в реальном времени. Виртуальные
        устройства — погрузчики, AGV и AMR-роботы, конвейеры, сканеры, датчики,
        терминалы, ворота и зарядные станции — живут собственным состоянием,
        получают задания и порождают поток событий: приёмка транспорта,
        размещение в ячейки, отбор и упаковка заказов, отгрузка, отказы техники
        и аварии датчиков. Симуляция идёт непрерывно, пока вы её не остановите.
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
            <WarehouseLiveMap
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
