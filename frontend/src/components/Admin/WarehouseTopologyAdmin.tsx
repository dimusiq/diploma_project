/**
 * Редактор топологии склада (зоны, проходы, буферы, доки) + упрощённый план (вид сверху).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchWarehouseLayout } from "@/api/warehouseLayout.ts"
import {
  type TopologyAisle,
  type TopologyBufferZone,
  type TopologyDock,
  type TopologyDocument,
  type TopologyStorageZone,
  warehouseTopologyApi,
} from "@/api/warehouseTopology.ts"
import { Button } from "@/components/ui/button.tsx"
import { Field } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

function newId(): string {
  return crypto.randomUUID()
}

function parsePolylineText(s: string): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (const part of s.split(";")) {
    const t = part.trim()
    if (!t) continue
    const [a, b] = t.split(",").map((x) => Number.parseFloat(x.trim()))
    if (Number.isFinite(a) && Number.isFinite(b)) {
      out.push({
        x: Math.min(1, Math.max(0, a)),
        z: Math.min(1, Math.max(0, b)),
      })
    }
  }
  return out
}

function formatPolylineText(pts: { x: number; z: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join("; ")
}

function TopologyPlanSvg({
  rows,
  cellX,
  zones,
  aisles,
  docks,
}: {
  rows: number
  cellX: number
  zones: TopologyStorageZone[]
  aisles: TopologyAisle[]
  docks: TopologyDock[]
}) {
  const W = 520
  const H = 360
  const pad = 16
  const iw = W - 2 * pad
  const ih = H - 2 * pad
  const rr = Math.max(1, rows)
  const cx = Math.max(1, cellX)

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ borderRadius: 8, background: "#f8fafc" }}
      role="img"
      aria-label="Схема склада"
    >
      <title>Схема склада</title>
      <rect
        x={pad}
        y={pad}
        width={iw}
        height={ih}
        fill="white"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      {aisles.map((a) => {
        if (a.polyline_norm.length < 2) return null
        const pts = a.polyline_norm
          .map((p) => `${pad + p.x * iw},${pad + p.z * ih}`)
          .join(" ")
        return (
          <polyline
            key={a.id}
            points={pts}
            fill="none"
            stroke="#ea580c"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )
      })}
      {zones.map((z) => {
        const x = pad + ((z.cell_x_from_1based - 1) / cx) * iw
        const w = ((z.cell_x_to_1based - z.cell_x_from_1based + 1) / cx) * iw
        const y = pad + ((z.row_from_1based - 1) / rr) * ih
        const h = ((z.row_to_1based - z.row_from_1based + 1) / rr) * ih
        return (
          <rect
            key={z.id}
            x={x}
            y={y}
            width={Math.max(2, w)}
            height={Math.max(2, h)}
            fill={z.color}
            fillOpacity={0.35}
            stroke={z.color}
            strokeWidth={1}
          />
        )
      })}
      {docks.map((d) => {
        const cx0 = pad + d.x_norm * iw
        const cy0 = pad + d.z_norm * ih
        return (
          <g key={d.id}>
            <circle cx={cx0} cy={cy0} r={8} fill="#0f766e" opacity={0.9} />
            <text
              x={cx0 + 10}
              y={cy0 + 4}
              fontSize={10}
              fill="#334155"
              style={{ fontFamily: "system-ui" }}
            >
              {d.code}
            </text>
          </g>
        )
      })}
      <text
        x={pad}
        y={H - 6}
        fontSize={10}
        fill="#64748b"
        style={{ fontFamily: "system-ui" }}
      >
        Ось X — позиции по длине стеллажа; ось Y — ряды (1…{rr}). Доки — норм.
        координаты.
      </text>
    </svg>
  )
}

export function WarehouseTopologyAdmin() {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const qc = useQueryClient()
  const { data: layout, isError: layoutErr } = useQuery({
    queryKey: ["warehouse", "layout"],
    queryFn: fetchWarehouseLayout,
  })
  const {
    data: topologyRemote,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["warehouse", "topology"],
    queryFn: warehouseTopologyApi.get,
    enabled: !layoutErr,
  })

  const [draft, setDraft] = useState<TopologyDocument | null>(null)

  useEffect(() => {
    if (topologyRemote) setDraft(structuredClone(topologyRemote))
  }, [topologyRemote])

  const rows = Number(layout?.spec?.rows) || 12
  const cellX = Number(layout?.spec?.cellX) || 20
  const levelsCount = Number(layout?.spec?.levels) || 4
  const cellZCount = Number(layout?.spec?.cellZ) || 1

  const putMut = useMutation({
    mutationFn: warehouseTopologyApi.put,
    onSuccess: (d) => {
      setDraft(structuredClone(d))
      void qc.invalidateQueries({ queryKey: ["warehouse", "topology"] })
      showSuccessToast("Топология сохранена")
    },
    onError: (e: Error) => showErrorToast(e.message || "Не удалось сохранить"),
  })

  const resetMut = useMutation({
    mutationFn: warehouseTopologyApi.resetDefaults,
    onSuccess: (d) => {
      setDraft(structuredClone(d))
      void qc.invalidateQueries({ queryKey: ["warehouse", "topology"] })
      showSuccessToast("Подставлен шаблон по текущему layout")
    },
    onError: (e: Error) => showErrorToast(e.message || "Сброс не выполнен"),
  })

  const syncGraphMut = useMutation({
    mutationFn: () => warehouseTopologyApi.syncRouteGraph(layout?.id ?? null),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["warehouse", "route-graph"] })
      showSuccessToast(
        `Граф маршрутов: узлов ${res.nodes_created}, рёбер ${res.edges_created}`,
      )
    },
    onError: (e: Error) =>
      showErrorToast(e.message || "Не удалось синхронизировать граф"),
  })

  const updateZone = useCallback(
    (i: number, patch: Partial<TopologyStorageZone>) => {
      setDraft((prev) => {
        if (!prev) return prev
        const zones = [...prev.zones]
        zones[i] = { ...zones[i], ...patch }
        return { ...prev, zones }
      })
    },
    [],
  )

  const addZone = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev
      const z: TopologyStorageZone = {
        id: newId(),
        name: "Новая зона",
        zone_type: "storage",
        row_from_1based: 1,
        row_to_1based: Math.max(1, rows),
        level_from_1based: 1,
        level_to_1based: Math.max(1, levelsCount),
        cell_x_from_1based: 1,
        cell_x_to_1based: Math.max(1, cellX),
        cell_z_from_1based: 1,
        cell_z_to_1based: Math.max(1, cellZCount),
        color: "#8b5cf6",
      }
      return { ...prev, zones: [...prev.zones, z] }
    })
  }, [rows, cellX, levelsCount, cellZCount])

  const removeZone = useCallback((i: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, zones: prev.zones.filter((_, j) => j !== i) }
    })
  }, [])

  const updateAisle = useCallback(
    (i: number, patch: Partial<TopologyAisle>) => {
      setDraft((prev) => {
        if (!prev) return prev
        const aisles = [...prev.aisles]
        aisles[i] = { ...aisles[i], ...patch }
        return { ...prev, aisles }
      })
    },
    [],
  )

  const addAisle = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev
      const a: TopologyAisle = {
        id: newId(),
        name: "Проход",
        kind: "feeder",
        polyline_norm: [
          { x: 0.2, z: 0.5 },
          { x: 0.8, z: 0.5 },
        ],
        width_m: 2.5,
      }
      return { ...prev, aisles: [...prev.aisles, a] }
    })
  }, [])

  const removeAisle = useCallback((i: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, aisles: prev.aisles.filter((_, j) => j !== i) }
    })
  }, [])

  const updateBuffer = useCallback(
    (i: number, patch: Partial<TopologyBufferZone>) => {
      setDraft((prev) => {
        if (!prev) return prev
        const buffer_zones = [...prev.buffer_zones]
        buffer_zones[i] = { ...buffer_zones[i], ...patch }
        return { ...prev, buffer_zones }
      })
    },
    [],
  )

  const addBuffer = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev
      const b: TopologyBufferZone = {
        id: newId(),
        name: "Буфер",
        row_from_1based: null,
        row_to_1based: null,
        notes: "",
      }
      return { ...prev, buffer_zones: [...prev.buffer_zones, b] }
    })
  }, [])

  const removeBuffer = useCallback((i: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        buffer_zones: prev.buffer_zones.filter((_, j) => j !== i),
      }
    })
  }, [])

  const updateDock = useCallback((i: number, patch: Partial<TopologyDock>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const docks = [...prev.docks]
      docks[i] = { ...docks[i], ...patch }
      return { ...prev, docks }
    })
  }, [])

  const addDock = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev
      const d: TopologyDock = {
        id: newId(),
        name: "Док",
        code: `D-${prev.docks.length + 1}`,
        dock_type: "inbound",
        x_norm: 0.5,
        z_norm: 0.1,
        yaw_deg: 0,
        bay_count: 1,
      }
      return { ...prev, docks: [...prev.docks, d] }
    })
  }, [])

  const removeDock = useCallback((i: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, docks: prev.docks.filter((_, j) => j !== i) }
    })
  }, [])

  const planZones = useMemo(() => draft?.zones ?? [], [draft?.zones])
  const planAisles = useMemo(() => draft?.aisles ?? [], [draft?.aisles])
  const planDocks = useMemo(() => draft?.docks ?? [], [draft?.docks])

  if (layoutErr) {
    return (
      <p className="pt-4 text-sm text-destructive">
        Нет активного warehouse layout — топология недоступна.
      </p>
    )
  }

  if (isLoading || !draft) {
    return <p className="pt-4 text-sm">Загрузка топологии…</p>
  }

  if (isError) {
    return (
      <p className="pt-4 text-sm text-destructive">
        {(error as Error)?.message ?? "Ошибка загрузки"}
      </p>
    )
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Зоны задают диапазоны <strong>рядов / уровней / ячеек</strong>{" "}
        (нумерация как в карточке товара). Проходы — полилиния в координатах 0…1
        (x,z через «;»). Доки — точка на плане. Сохранение требует право{" "}
        <strong>zones.manage</strong> (как у справочника зон).
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          loading={putMut.isPending}
          onClick={() => putMut.mutate(draft)}
        >
          Сохранить топологию
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={resetMut.isPending}
          onClick={() => {
            if (window.confirm("Перезаписать топологию шаблоном из layout?")) {
              resetMut.mutate()
            }
          }}
        >
          Шаблон из layout
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={syncGraphMut.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Пересобрать граф маршрутов (route_node/route_edge) из проходов и доков? Текущий граф для активного layout будет заменён.",
              )
            ) {
              syncGraphMut.mutate()
            }
          }}
        >
          Синхронизировать граф маршрутов
        </Button>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-heading text-sm font-semibold">
          План (схема)
        </h3>
        <TopologyPlanSvg
          rows={Number(rows) || 12}
          cellX={Number(cellX) || 20}
          zones={planZones}
          aisles={planAisles}
          docks={planDocks}
        />
      </div>

      <Tabs defaultValue="zones" className="w-full">
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="zones">Зоны</TabsTrigger>
          <TabsTrigger value="aisles">Проходы</TabsTrigger>
          <TabsTrigger value="buffers">Буферные зоны</TabsTrigger>
          <TabsTrigger value="docks">Доки</TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="mt-0 outline-none">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="outlineSky" onClick={addZone}>
              Добавить зону
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Ряды</TableHead>
                <TableHead>Уровни</TableHead>
                <TableHead>Яч. X</TableHead>
                <TableHead>Яч. Z</TableHead>
                <TableHead>Цвет</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.zones.map((z, i) => (
                <TableRow key={z.id}>
                  <TableCell>
                    <Input
                      className="h-8"
                      value={z.name}
                      onChange={(e) => updateZone(i, { name: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={z.zone_type}
                      onValueChange={(v) =>
                        updateZone(i, {
                          zone_type: v as TopologyStorageZone["zone_type"],
                        })
                      }
                    >
                      <SelectTrigger
                        className="h-8 max-w-[120px] text-[13px]"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="storage">Хранение</SelectItem>
                        <SelectItem value="staging">Стадирование</SelectItem>
                        <SelectItem value="buffer">Буфер</SelectItem>
                        <SelectItem value="dock_area">Зона доков</SelectItem>
                        <SelectItem value="cross_dock">Кросс-док</SelectItem>
                        <SelectItem value="receiving">Приёмка</SelectItem>
                        <SelectItem value="shipping">Отгрузка</SelectItem>
                        <SelectItem value="other">Прочее</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-8 w-14"
                        value={z.row_from_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            row_from_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                      <span>—</span>
                      <Input
                        type="number"
                        className="h-8 w-14"
                        value={z.row_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            row_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-8 w-12"
                        value={z.level_from_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            level_from_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                      <span>—</span>
                      <Input
                        type="number"
                        className="h-8 w-12"
                        value={z.level_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            level_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-8 w-12"
                        value={z.cell_x_from_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            cell_x_from_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                      <span>—</span>
                      <Input
                        type="number"
                        className="h-8 w-12"
                        value={z.cell_x_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            cell_x_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-8 w-12"
                        value={z.cell_z_from_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            cell_z_from_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                      <span>—</span>
                      <Input
                        type="number"
                        className="h-8 w-12"
                        value={z.cell_z_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            cell_z_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 w-24"
                      value={z.color}
                      onChange={(e) => updateZone(i, { color: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="xs"
                      variant="outlineDestructive"
                      onClick={() => removeZone(i)}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="aisles" className="mt-0 outline-none">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="outlineSky" onClick={addAisle}>
              Добавить проход
            </Button>
          </div>
          {draft.aisles.map((a, i) => (
            <div
              key={a.id}
              className="mb-3 rounded-md border border-border p-3"
            >
              <Field label="Название">
                <Input
                  value={a.name}
                  onChange={(e) => updateAisle(i, { name: e.target.value })}
                />
              </Field>
              <Field label="Тип" className="mt-2">
                <Select
                  value={a.kind}
                  onValueChange={(v) =>
                    updateAisle(i, { kind: v as TopologyAisle["kind"] })
                  }
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Главный</SelectItem>
                    <SelectItem value="cross">Поперечный</SelectItem>
                    <SelectItem value="feeder">Подъездной</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ширина, м" className="mt-2">
                <Input
                  type="number"
                  step={0.1}
                  value={a.width_m}
                  onChange={(e) =>
                    updateAisle(i, { width_m: Number(e.target.value) || 2.5 })
                  }
                />
              </Field>
              <Field
                label="Полилиния (x,z через точку с запятой; координаты 0…1)"
                className="mt-2"
              >
                <Textarea
                  rows={2}
                  className="font-mono text-sm"
                  value={formatPolylineText(a.polyline_norm)}
                  onChange={(e) =>
                    updateAisle(i, {
                      polyline_norm: parsePolylineText(e.target.value),
                    })
                  }
                />
              </Field>
              <Button
                size="xs"
                variant="outlineDestructive"
                className="mt-2"
                onClick={() => removeAisle(i)}
              >
                Удалить проход
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="buffers" className="mt-0 outline-none">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="outlineSky" onClick={addBuffer}>
              Добавить буфер
            </Button>
          </div>
          {draft.buffer_zones.map((b, i) => (
            <div
              key={b.id}
              className="mb-3 rounded-md border border-border p-3"
            >
              <Field label="Название">
                <Input
                  value={b.name}
                  onChange={(e) => updateBuffer(i, { name: e.target.value })}
                />
              </Field>
              <div className="mt-2 flex gap-2">
                <Field label="Ряд с">
                  <Input
                    type="number"
                    placeholder="—"
                    value={b.row_from_1based ?? ""}
                    onChange={(e) =>
                      updateBuffer(i, {
                        row_from_1based: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </Field>
                <Field label="Ряд по">
                  <Input
                    type="number"
                    placeholder="—"
                    value={b.row_to_1based ?? ""}
                    onChange={(e) =>
                      updateBuffer(i, {
                        row_to_1based: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="Заметки" className="mt-2">
                <Textarea
                  rows={2}
                  value={b.notes}
                  onChange={(e) => updateBuffer(i, { notes: e.target.value })}
                />
              </Field>
              <Button
                size="xs"
                variant="outlineDestructive"
                className="mt-2"
                onClick={() => removeBuffer(i)}
              >
                Удалить
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="docks" className="mt-0 outline-none">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="outlineSky" onClick={addDock}>
              Добавить док
            </Button>
          </div>
          {draft.docks.map((d, i) => (
            <div
              key={d.id}
              className="mb-3 rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap gap-2">
                <Field label="Название">
                  <Input
                    value={d.name}
                    onChange={(e) => updateDock(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="Код">
                  <Input
                    value={d.code}
                    onChange={(e) => updateDock(i, { code: e.target.value })}
                  />
                </Field>
                <Field label="Тип">
                  <Select
                    value={d.dock_type}
                    onValueChange={(v) =>
                      updateDock(i, {
                        dock_type: v as TopologyDock["dock_type"],
                      })
                    }
                  >
                    <SelectTrigger className="h-9 min-w-[100px] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">Вход</SelectItem>
                      <SelectItem value="outbound">Выход</SelectItem>
                      <SelectItem value="cross">Кросс</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Field label="x (0…1)">
                  <Input
                    type="number"
                    step={0.01}
                    value={d.x_norm}
                    onChange={(e) =>
                      updateDock(i, { x_norm: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="z (0…1)">
                  <Input
                    type="number"
                    step={0.01}
                    value={d.z_norm}
                    onChange={(e) =>
                      updateDock(i, { z_norm: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Поворот °">
                  <Input
                    type="number"
                    value={d.yaw_deg}
                    onChange={(e) =>
                      updateDock(i, { yaw_deg: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Боксов">
                  <Input
                    type="number"
                    value={d.bay_count}
                    onChange={(e) =>
                      updateDock(i, { bay_count: Number(e.target.value) || 1 })
                    }
                  />
                </Field>
              </div>
              <Button
                size="xs"
                variant="outlineDestructive"
                className="mt-2"
                onClick={() => removeDock(i)}
              >
                Удалить док
              </Button>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
