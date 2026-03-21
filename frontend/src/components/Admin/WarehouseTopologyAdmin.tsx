/**
 * Редактор топологии склада (зоны, проходы, буферы, доки) + упрощённый план (вид сверху).
 */
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Table,
  Tabs,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type TopologyAisle,
  type TopologyBufferZone,
  type TopologyDock,
  type TopologyDocument,
  type TopologyStorageZone,
  warehouseTopologyApi,
} from "@/api/warehouseTopology.ts"
import { fetchWarehouseLayout } from "@/api/warehouseLayout.ts"
import { Field } from "@/components/ui/field.tsx"
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
    >
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
        const w =
          ((z.cell_x_to_1based - z.cell_x_from_1based + 1) / cx) * iw
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
        Ось X — позиции по длине стеллажа; ось Y — ряды (1…{rr}). Доки — норм. координаты.
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
    mutationFn: () =>
      warehouseTopologyApi.syncRouteGraph(layout?.id ?? null),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["warehouse", "route-graph"] })
      showSuccessToast(
        `Граф маршрутов: узлов ${res.nodes_created}, рёбер ${res.edges_created}`,
      )
    },
    onError: (e: Error) =>
      showErrorToast(e.message || "Не удалось синхронизировать граф"),
  })

  const updateZone = useCallback((i: number, patch: Partial<TopologyStorageZone>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const zones = [...prev.zones]
      zones[i] = { ...zones[i], ...patch }
      return { ...prev, zones }
    })
  }, [])

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

  const updateAisle = useCallback((i: number, patch: Partial<TopologyAisle>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const aisles = [...prev.aisles]
      aisles[i] = { ...aisles[i], ...patch }
      return { ...prev, aisles }
    })
  }, [])

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

  const updateBuffer = useCallback((i: number, patch: Partial<TopologyBufferZone>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const buffer_zones = [...prev.buffer_zones]
      buffer_zones[i] = { ...buffer_zones[i], ...patch }
      return { ...prev, buffer_zones }
    })
  }, [])

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
      <Text color="red.500" pt={4}>
        Нет активного warehouse layout — топология недоступна.
      </Text>
    )
  }

  if (isLoading || !draft) {
    return <Text pt={4}>Загрузка топологии…</Text>
  }

  if (isError) {
    return (
      <Text color="red.500" pt={4}>
        {(error as Error)?.message ?? "Ошибка загрузки"}
      </Text>
    )
  }

  return (
    <Box pt={4}>
      <Text fontSize="sm" color="fg.muted" mb={4}>
        Зоны задают диапазоны{" "}
        <strong>рядов / уровней / ячеек</strong> (нумерация как в карточке товара).
        Проходы — полилиния в координатах 0…1 (x,z через «;»). Доки — точка на
        плане. Сохранение требует право <strong>zones.manage</strong> (как у
        справочника зон).
      </Text>
      <Flex gap={2} flexWrap="wrap" mb={4}>
        <Button
          size="sm"
          colorPalette="blue"
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
      </Flex>

      <Box mb={6}>
        <Heading size="sm" mb={2}>
          План (схема)
        </Heading>
        <TopologyPlanSvg
          rows={Number(rows) || 12}
          cellX={Number(cellX) || 20}
          zones={planZones}
          aisles={planAisles}
          docks={planDocks}
        />
      </Box>

      <Tabs.Root defaultValue="zones" variant="subtle">
        <Tabs.List flexWrap="wrap">
          <Tabs.Trigger value="zones">Зоны</Tabs.Trigger>
          <Tabs.Trigger value="aisles">Проходы</Tabs.Trigger>
          <Tabs.Trigger value="buffers">Буферные зоны</Tabs.Trigger>
          <Tabs.Trigger value="docks">Доки</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="zones">
          <Flex justify="flex-end" mb={2}>
            <Button size="sm" variant="outline" onClick={addZone}>
              Добавить зону
            </Button>
          </Flex>
          <Table.Root size="sm" variant="line">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Название</Table.ColumnHeader>
                <Table.ColumnHeader>Тип</Table.ColumnHeader>
                <Table.ColumnHeader>Ряды</Table.ColumnHeader>
                <Table.ColumnHeader>Уровни</Table.ColumnHeader>
                <Table.ColumnHeader>Яч. X</Table.ColumnHeader>
                <Table.ColumnHeader>Яч. Z</Table.ColumnHeader>
                <Table.ColumnHeader>Цвет</Table.ColumnHeader>
                <Table.ColumnHeader />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {draft.zones.map((z, i) => (
                <Table.Row key={z.id}>
                  <Table.Cell>
                    <Input
                      size="sm"
                      value={z.name}
                      onChange={(e) => updateZone(i, { name: e.target.value })}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <select
                      value={z.zone_type}
                      onChange={(e) =>
                        updateZone(i, {
                          zone_type: e.target.value as TopologyStorageZone["zone_type"],
                        })
                      }
                      style={{ fontSize: 13, maxWidth: 120 }}
                    >
                      <option value="storage">Хранение</option>
                      <option value="staging">Стадирование</option>
                      <option value="buffer">Буфер</option>
                      <option value="dock_area">Зона доков</option>
                      <option value="cross_dock">Кросс-док</option>
                      <option value="receiving">Приёмка</option>
                      <option value="shipping">Отгрузка</option>
                      <option value="other">Прочее</option>
                    </select>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap={1} align="center">
                      <Input
                        type="number"
                        size="sm"
                        w="14"
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
                        size="sm"
                        w="14"
                        value={z.row_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            row_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap={1} align="center">
                      <Input
                        type="number"
                        size="sm"
                        w="12"
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
                        size="sm"
                        w="12"
                        value={z.level_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            level_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap={1} align="center">
                      <Input
                        type="number"
                        size="sm"
                        w="12"
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
                        size="sm"
                        w="12"
                        value={z.cell_x_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            cell_x_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap={1} align="center">
                      <Input
                        type="number"
                        size="sm"
                        w="12"
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
                        size="sm"
                        w="12"
                        value={z.cell_z_to_1based}
                        onChange={(e) =>
                          updateZone(i, {
                            cell_z_to_1based: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Input
                      size="sm"
                      w="24"
                      value={z.color}
                      onChange={(e) => updateZone(i, { color: e.target.value })}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Button size="xs" variant="ghost" onClick={() => removeZone(i)}>
                      Удалить
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Tabs.Content>

        <Tabs.Content value="aisles">
          <Flex justify="flex-end" mb={2}>
            <Button size="sm" variant="outline" onClick={addAisle}>
              Добавить проход
            </Button>
          </Flex>
          {draft.aisles.map((a, i) => (
            <Box
              key={a.id}
              borderWidth="1px"
              borderRadius="md"
              p={3}
              mb={3}
            >
              <Field label="Название">
                <Input
                  value={a.name}
                  onChange={(e) => updateAisle(i, { name: e.target.value })}
                />
              </Field>
              <Field label="Тип" mt={2}>
                <select
                  value={a.kind}
                  onChange={(e) =>
                    updateAisle(i, { kind: e.target.value as TopologyAisle["kind"] })
                  }
                  style={{ fontSize: 14 }}
                >
                  <option value="main">Главный</option>
                  <option value="cross">Поперечный</option>
                  <option value="feeder">Подъездной</option>
                </select>
              </Field>
              <Field label="Ширина, м" mt={2}>
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
                mt={2}
              >
                <Textarea
                  rows={2}
                  fontFamily="mono"
                  fontSize="sm"
                  value={formatPolylineText(a.polyline_norm)}
                  onChange={(e) =>
                    updateAisle(i, {
                      polyline_norm: parsePolylineText(e.target.value),
                    })
                  }
                />
              </Field>
              <Button size="xs" variant="ghost" mt={2} onClick={() => removeAisle(i)}>
                Удалить проход
              </Button>
            </Box>
          ))}
        </Tabs.Content>

        <Tabs.Content value="buffers">
          <Flex justify="flex-end" mb={2}>
            <Button size="sm" variant="outline" onClick={addBuffer}>
              Добавить буфер
            </Button>
          </Flex>
          {draft.buffer_zones.map((b, i) => (
            <Box
              key={b.id}
              borderWidth="1px"
              borderRadius="md"
              p={3}
              mb={3}
            >
              <Field label="Название">
                <Input
                  value={b.name}
                  onChange={(e) => updateBuffer(i, { name: e.target.value })}
                />
              </Field>
              <Flex gap={2} mt={2}>
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
              </Flex>
              <Field label="Заметки" mt={2}>
                <Textarea
                  rows={2}
                  value={b.notes}
                  onChange={(e) => updateBuffer(i, { notes: e.target.value })}
                />
              </Field>
              <Button size="xs" variant="ghost" mt={2} onClick={() => removeBuffer(i)}>
                Удалить
              </Button>
            </Box>
          ))}
        </Tabs.Content>

        <Tabs.Content value="docks">
          <Flex justify="flex-end" mb={2}>
            <Button size="sm" variant="outline" onClick={addDock}>
              Добавить док
            </Button>
          </Flex>
          {draft.docks.map((d, i) => (
            <Box
              key={d.id}
              borderWidth="1px"
              borderRadius="md"
              p={3}
              mb={3}
            >
              <Flex gap={2} flexWrap="wrap">
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
                  <select
                    value={d.dock_type}
                    onChange={(e) =>
                      updateDock(i, {
                        dock_type: e.target.value as TopologyDock["dock_type"],
                      })
                    }
                    style={{ fontSize: 14 }}
                  >
                    <option value="inbound">Вход</option>
                    <option value="outbound">Выход</option>
                    <option value="cross">Кросс</option>
                  </select>
                </Field>
              </Flex>
              <Flex gap={2} mt={2} flexWrap="wrap">
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
              </Flex>
              <Button size="xs" variant="ghost" mt={2} onClick={() => removeDock(i)}>
                Удалить док
              </Button>
            </Box>
          ))}
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  )
}
