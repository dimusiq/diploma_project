/**
 * Настройки генератора событий: интенсивность потоков, надёжность оборудования,
 * состав парка устройств и ручная инъекция событий.
 */

import { fetchSimScenarios } from "@/api/deviceServer.ts"
import { type ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { Input } from "@/components/ui/input.tsx"
import { deviceSimulation } from "./simStore.ts"
import type { SimConfig } from "./simTypes.ts"
import { useSimData } from "./useDeviceSimulation.ts"

function toNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : fallback
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="w-[190px]">
      <p className="mb-1 text-xs">{label}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Параметр, применяемый к работающей модели сразу. */
function LiveNumberField({
  label,
  hint,
  value,
  step,
  min,
  max,
  onCommit,
}: {
  label: string
  hint?: string
  value: number
  step: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  return (
    <Field label={label} hint={hint}>
      <Input
        className="h-8 text-sm"
        type="number"
        step={step}
        min={min}
        max={max}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = toNumber(event.target.value, value)
          onCommit(Math.min(max, Math.max(min, parsed)))
        }}
      />
    </Field>
  )
}

export function GeneratorPanel() {
  const data = useSimData()
  const config = data.config
  const [scenarios, setScenarios] = useState<
    Array<{ code: string; name: string; description: string }>
  >([])

  useEffect(() => {
    void fetchSimScenarios().then(setScenarios).catch(() => undefined)
  }, [])

  const [draft, setDraft] = useState({
    forklifts: String(config.forklifts),
    agvs: String(config.agvs),
    amrs: String(config.amrs),
    workers: String(config.workers),
    seed: String(config.seed),
    initialFillRatio: String(Math.round(config.initialFillRatio * 100)),
  })

  const applyLive = (patch: Partial<SimConfig>) =>
    deviceSimulation.setConfig(patch)

  const rebuild = () => {
    deviceSimulation.reset({
      forklifts: Math.max(
        1,
        Math.round(toNumber(draft.forklifts, config.forklifts)),
      ),
      agvs: Math.max(0, Math.round(toNumber(draft.agvs, config.agvs))),
      amrs: Math.max(0, Math.round(toNumber(draft.amrs, config.amrs))),
      workers: Math.max(1, Math.round(toNumber(draft.workers, config.workers))),
      seed: Math.round(toNumber(draft.seed, config.seed)),
      initialFillRatio: Math.min(
        0.95,
        Math.max(0, toNumber(draft.initialFillRatio, 55) / 100),
      ),
    })
  }

  const randomDeviceId = (): string | null => {
    const candidates = data.devices.filter(
      (device) =>
        device.online && device.status !== "fault" && device.status !== "jam",
    )
    if (candidates.length === 0) return null
    return candidates[Math.floor(Math.random() * candidates.length)].id
  }

  return (
    <div className="space-y-4">
      <Card className="ring-foreground/5">
        <CardContent className="px-4 py-4">
          <h3 className="font-heading mb-1 text-sm font-semibold">Сценарии</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Start Demo запускает полный цикл на реальных заказах и остатках.
            Сценарий ниже меняет интенсивность потоков и может сразу ввести отказ
            техники или конвейера.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="xs" onClick={() => deviceSimulation.startDemo()}>
              Start Demo
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => deviceSimulation.resetDemo()}
            >
              Reset Demo
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {scenarios.map((scenario) => (
              <Button
                key={scenario.code}
                size="xs"
                variant={
                  data.scenario === scenario.code ? "default" : "outline"
                }
                title={scenario.description}
                onClick={() => deviceSimulation.applyScenario(scenario.code)}
              >
                {scenario.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-muted/30 ring-foreground/5">
        <CardContent className="px-4 py-4">
          <h3 className="font-heading mb-1 text-sm font-semibold">
            Интенсивность потоков
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Применяется к работающей модели сразу: меняет частоту прибытия машин
            и появления заказов.
          </p>
          <div className="flex flex-wrap gap-4">
            <LiveNumberField
              label="Машин в час"
              hint={`≈ ${(config.truckArrivalsPerHour * 7).toFixed(0)} паллет/ч приёмки`}
              value={config.truckArrivalsPerHour}
              step={0.5}
              min={0}
              max={40}
              onCommit={(value) => applyLive({ truckArrivalsPerHour: value })}
            />
            <LiveNumberField
              label="Заказов в час"
              hint="каждый заказ — 1–3 строки по 1–3 паллеты"
              value={config.ordersPerHour}
              step={1}
              min={0}
              max={120}
              onCommit={(value) => applyLive({ ordersPerHour: value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30 ring-foreground/5">
        <CardContent className="px-4 py-4">
          <h3 className="font-heading mb-1 text-sm font-semibold">
            Надёжность оборудования
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Управляет частотой отказов техники, замятий конвейеров, ошибок
            считывания и расходом заряда.
          </p>
          <div className="flex flex-wrap gap-4">
            <LiveNumberField
              label="Отказов в час на устройство"
              value={config.faultRatePerHour}
              step={0.05}
              min={0}
              max={5}
              onCommit={(value) => applyLive({ faultRatePerHour: value })}
            />
            <LiveNumberField
              label="Замятий конвейера в час"
              value={config.jamRatePerHour}
              step={0.1}
              min={0}
              max={10}
              onCommit={(value) => applyLive({ jamRatePerHour: value })}
            />
            <LiveNumberField
              label="Доля ошибок сканера"
              hint="0.04 — это 4% нечитаемых этикеток"
              value={config.scanErrorRate}
              step={0.01}
              min={0}
              max={0.5}
              onCommit={(value) => applyLive({ scanErrorRate: value })}
            />
            <LiveNumberField
              label="Расход заряда, %/мин"
              value={config.batteryDrainPerMin}
              step={0.05}
              min={0}
              max={5}
              onCommit={(value) => applyLive({ batteryDrainPerMin: value })}
            />
            <div className="flex w-[220px] items-center pt-5">
              <Checkbox
                checked={config.autoRepair}
                onCheckedChange={(checked) =>
                  applyLive({ autoRepair: checked === true })
                }
              >
                Автоматически восстанавливать устройства
              </Checkbox>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30 ring-foreground/5">
        <CardContent className="px-4 py-4">
          <h3 className="font-heading mb-1 text-sm font-semibold">
            Парк устройств
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Изменение состава парка и стартовых остатков требует пересборки
            модели: история событий и текущие задания будут сброшены.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Погрузчики">
              <Input
                className="h-8 text-sm"
                value={draft.forklifts}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    forklifts: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="AGV">
              <Input
                className="h-8 text-sm"
                value={draft.agvs}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, agvs: event.target.value }))
                }
              />
            </Field>
            <Field label="AMR-роботы">
              <Input
                className="h-8 text-sm"
                value={draft.amrs}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, amrs: event.target.value }))
                }
              />
            </Field>
            <Field label="Сотрудников в смене">
              <Input
                className="h-8 text-sm"
                value={draft.workers}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, workers: event.target.value }))
                }
              />
            </Field>
            <Field label="Заполнение склада, %">
              <Input
                className="h-8 text-sm"
                value={draft.initialFillRatio}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    initialFillRatio: event.target.value,
                  }))
                }
              />
            </Field>
            <Field
              label="Зерно случайности"
              hint="одинаковое зерно — одинаковый сценарий"
            >
              <Input
                className="h-8 text-sm"
                value={draft.seed}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, seed: event.target.value }))
                }
              />
            </Field>
            <Button size="sm" variant="outline" onClick={rebuild}>
              Применить и пересобрать
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="ring-foreground/5">
        <CardContent className="px-4 py-4">
          <h3 className="font-heading mb-1 text-sm font-semibold">
            Инъекция событий
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Ручные воздействия на работающую модель — чтобы посмотреть, как
            склад реагирует на нештатные ситуации.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                deviceSimulation.command({ type: "spawnInboundTruck" })
              }
            >
              Машина на приёмку
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                deviceSimulation.command({ type: "spawnOutboundOrder" })
              }
            >
              Новый заказ
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                deviceSimulation.command({
                  type: "spawnOutboundOrder",
                  urgent: true,
                })
              }
            >
              Срочный заказ
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const deviceId = randomDeviceId()
                if (deviceId)
                  deviceSimulation.command({ type: "injectFault", deviceId })
              }}
            >
              Отказ случайного устройства
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                deviceSimulation.command({ type: "clearAllAlarms" })
              }
            >
              Сбросить все аварии
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={() =>
                deviceSimulation.command({ type: "emergencyStop" })
              }
            >
              Аварийный останов
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => deviceSimulation.command({ type: "resumeAll" })}
            >
              Возобновить работу
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => deviceSimulation.fastForward(3600)}
            >
              Прокрутить 1 час
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
