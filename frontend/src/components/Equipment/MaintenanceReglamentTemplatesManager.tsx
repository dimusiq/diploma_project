import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

import useCustomToast from "@/hooks/useCustomToast.ts"
import { maintenanceTemplatesApi } from "@/api/maintenanceTemplates"
import type {
  MaintenanceReglamentTemplateCreateBody,
  MaintenanceReglamentTemplateDetailPublic,
} from "@/api/maintenanceTemplates"
import { sparePartsApi, type SparePartPublic } from "@/api/spareParts"
import { EQUIPMENT_TYPE_IDS, EQUIPMENT_TYPE_LABELS } from "@/api/equipment"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"

type ChecklistItemDraft = {
  id?: string
  title: string
  sort_order: number
}

type SpareRequirementDraft = {
  id?: string
  spare_part_id: string
  quantity: number
}

function emptyDraftForType(equipmentType: string): {
  equipment_type: string
  interval_hours: number | null
  checklist_items: ChecklistItemDraft[]
  spare_part_requirements: SpareRequirementDraft[]
} {
  return {
    equipment_type: equipmentType,
    interval_hours: null,
    checklist_items: [{ title: "", sort_order: 0 }],
    spare_part_requirements: [],
  }
}

export function MaintenanceReglamentTemplatesManager() {
  const toast = useCustomToast()
  const queryClient = useQueryClient()

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["maintenance-templates"],
    queryFn: () => maintenanceTemplatesApi.list(),
  })

  const templates = templatesData?.data ?? []
  const templatesCount = templatesData?.count ?? 0

  const { data: sparePartsData } = useQuery({
    queryKey: ["spare-parts", "for-template"],
    queryFn: () => sparePartsApi.list({ limit: 500 }),
  })

  const spareParts: SparePartPublic[] = sparePartsData?.data ?? []
  const sparePartsOptions = useMemo(() => spareParts, [spareParts])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const initialType = EQUIPMENT_TYPE_IDS[0] ?? "autopogruzchik"
  const [draft, setDraft] = useState(() => emptyDraftForType(initialType))

  const selectedTemplateQuery = useQuery({
    queryKey: ["maintenance-templates", "detail", selectedId],
    queryFn: () => maintenanceTemplatesApi.get(selectedId as string),
    enabled: !!selectedId,
  })

  useEffect(() => {
    const t = selectedTemplateQuery.data as
      | MaintenanceReglamentTemplateDetailPublic
      | undefined
    if (!t) return
    setDraft({
      equipment_type: t.equipment_type,
      interval_hours: t.interval_hours,
      checklist_items: (t.checklist_items ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        sort_order: c.sort_order,
      })),
      spare_part_requirements: (t.spare_part_requirements ?? []).map((r) => ({
        id: r.id,
        spare_part_id: r.spare_part_id,
        quantity: r.quantity,
      })),
    })
  }, [selectedTemplateQuery.data])

  const [isSaving, setIsSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const buildBody = (): MaintenanceReglamentTemplateCreateBody => {
    const checklist_items = draft.checklist_items
      .map((c, idx) => ({
        title: c.title.trim(),
        sort_order: idx,
      }))
      .filter((c) => c.title.length > 0)

    const spare_part_requirements = draft.spare_part_requirements
      .filter((r) => r.spare_part_id && r.quantity >= 1)
      .map((r) => ({
        spare_part_id: r.spare_part_id,
        quantity: Math.floor(r.quantity),
      }))

    return {
      equipment_type: draft.equipment_type,
      interval_hours: draft.interval_hours,
      checklist_items,
      spare_part_requirements,
    }
  }

  const handleSave = async () => {
    if (!draft.equipment_type.trim()) {
      toast.showErrorToast("Выберите тип техники")
      return
    }

    const checklistTitles = draft.checklist_items
      .map((c) => c.title.trim())
      .filter(Boolean)
    if (checklistTitles.length === 0) {
      toast.showErrorToast("Добавьте хотя бы один пункт чек-листа")
      return
    }

    const body = buildBody()
    setIsSaving(true)
    try {
      if (selectedId) {
        await maintenanceTemplatesApi.update(selectedId, body)
        toast.showSuccessToast("Шаблон обновлён")
      } else {
        await maintenanceTemplatesApi.create(body)
        toast.showSuccessToast("Шаблон создан")
      }
      setSelectedId(null)
      queryClient.invalidateQueries({ queryKey: ["maintenance-templates"] })
    } catch (e) {
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    setIsSaving(true)
    try {
      await maintenanceTemplatesApi.delete(selectedId)
      toast.showSuccessToast("Шаблон удалён")
      setSelectedId(null)
      queryClient.invalidateQueries({ queryKey: ["maintenance-templates"] })
    } catch (e) {
      toast.showErrorToast(e instanceof Error ? e.message : "Ошибка удаления")
    } finally {
      setIsSaving(false)
      setDeleteOpen(false)
    }
  }

  return (
    <Box mt={10}>
      <Flex justify="space-between" align="center" mb={3} wrap="wrap" gap={2}>
        <Text fontWeight="bold">Шаблоны регламентов</Text>
        <HStack gap={2}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedId(null)
              setDraft(emptyDraftForType(initialType))
            }}
          >
            Новый шаблон
          </Button>
          <Button size="sm" onClick={handleSave} loading={isSaving}>
            Сохранить
          </Button>
          {selectedId ? (
            <Button
              size="sm"
              variant="outline"
              colorPalette="red"
              onClick={() => setDeleteOpen(true)}
            >
              Удалить
            </Button>
          ) : null}
        </HStack>
      </Flex>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить шаблон?"
        description="Данные чек-листа и требуемых запчастей также будут удалены."
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={handleDelete}
        isLoading={isSaving}
      />

      <Flex gap={6} align="flex-start" wrap="wrap">
        <Box w="320px" flexShrink={0}>
          <Text fontSize="sm" color="fg.muted" mb={2}>
            Шаблоны ({templatesCount})
          </Text>
          {templatesLoading ? <Text>Загрузка…</Text> : null}
          {!templatesLoading && templates.length === 0 ? (
            <Text color="fg.muted">Пока нет шаблонов.</Text>
          ) : null}
          <Stack gap={2}>
            {templates.map((t) => (
              <Button
                key={t.id}
                variant={t.id === selectedId ? "solid" : "outline"}
                size="sm"
                onClick={() => setSelectedId(t.id)}
                justifyContent="flex-start"
              >
                <Box textAlign="left">
                  <Text fontSize="sm" fontWeight="medium">
                    {EQUIPMENT_TYPE_LABELS[t.equipment_type] ?? t.equipment_type}
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    Интервал: {t.interval_hours == null ? "общий" : `${t.interval_hours} м/ч`}
                  </Text>
                </Box>
              </Button>
            ))}
          </Stack>
        </Box>

        <Box flex={1} minW={320}>
          <Text fontSize="sm" color="fg.muted" mb={2}>
            Форма шаблона
          </Text>

          <Stack gap={3}>
            <Box>
              <Text fontSize="sm" mb={1}>
                Тип техники
              </Text>
              <select
                value={draft.equipment_type}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, equipment_type: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--chakra-colors-border)",
                }}
              >
                {EQUIPMENT_TYPE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {EQUIPMENT_TYPE_LABELS[id] ?? id}
                  </option>
                ))}
              </select>
            </Box>

            <Box>
              <Text fontSize="sm" mb={1}>
                Интервал ТО (м/ч)
              </Text>
              <HStack gap={2}>
                <Button
                  size="sm"
                  variant={draft.interval_hours == null ? "solid" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, interval_hours: null }))}
                >
                  Общий
                </Button>
                <Input
                  type="number"
                  size="sm"
                  value={draft.interval_hours ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    setDraft((d) => ({
                      ...d,
                      interval_hours: v === "" ? null : Math.max(1, Number(v)),
                    }))
                  }}
                  disabled={draft.interval_hours == null}
                  min={1}
                />
              </HStack>
            </Box>

            <Box>
              <Text fontSize="sm" mb={1}>
                Чек-лист
              </Text>
              <Stack gap={2}>
                {draft.checklist_items.map((c, idx) => (
                  <HStack key={`${idx}-${c.id ?? "new"}`} gap={2}>
                    <Input
                      value={c.title}
                      size="sm"
                      placeholder="Название пункта"
                      onChange={(e) => {
                        const value = e.target.value
                        setDraft((d) => {
                          const next = [...d.checklist_items]
                          next[idx] = { ...next[idx], title: value, sort_order: idx }
                          return { ...d, checklist_items: next }
                        })
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDraft((d) => {
                          const next = d.checklist_items.filter((_, i) => i !== idx)
                          return { ...d, checklist_items: next.length ? next : [{ title: "", sort_order: 0 }] }
                        })
                      }}
                      disabled={draft.checklist_items.length <= 1}
                    >
                      Удалить
                    </Button>
                  </HStack>
                ))}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      checklist_items: [
                        ...d.checklist_items,
                        { title: "", sort_order: d.checklist_items.length },
                      ],
                    }))
                  }
                >
                  Добавить пункт
                </Button>
              </Stack>
            </Box>

            <Box>
              <Text fontSize="sm" mb={1}>
                Требуемые запчасти
              </Text>
              <Stack gap={2}>
                {draft.spare_part_requirements.map((r, idx) => (
                  <HStack key={`${idx}-${r.id ?? "new"}`} gap={2}>
                    <select
                      value={r.spare_part_id}
                      onChange={(e) => {
                        const value = e.target.value
                        setDraft((d) => {
                          const next = [...d.spare_part_requirements]
                          next[idx] = { ...next[idx], spare_part_id: value }
                          return { ...d, spare_part_requirements: next }
                        })
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "1px solid var(--chakra-colors-border)",
                      }}
                    >
                      <option value="">—</option>
                      {sparePartsOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                          {p.sku ? `(${p.sku})` : ""}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      size="sm"
                      value={r.quantity}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        setDraft((d) => {
                          const next = [...d.spare_part_requirements]
                          next[idx] = {
                            ...next[idx],
                            quantity: v === "" ? 1 : Math.max(1, Number(v)),
                          }
                          return { ...d, spare_part_requirements: next }
                        })
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDraft((d) => ({
                          ...d,
                          spare_part_requirements: d.spare_part_requirements.filter(
                            (_, i) => i !== idx,
                          ),
                        }))
                      }}
                    >
                      Удалить
                    </Button>
                  </HStack>
                ))}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      spare_part_requirements: [
                        ...d.spare_part_requirements,
                        { spare_part_id: "", quantity: 1 },
                      ],
                    }))
                  }
                >
                  Добавить запчасть
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Flex>
    </Box>
  )
}

