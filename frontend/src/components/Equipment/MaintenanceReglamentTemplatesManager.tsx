import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { EQUIPMENT_TYPE_IDS, EQUIPMENT_TYPE_LABELS } from "@/api/equipment"
import type {
  MaintenanceReglamentTemplateCreateBody,
  MaintenanceReglamentTemplateDetailPublic,
} from "@/api/maintenanceTemplates"
import { maintenanceTemplatesApi } from "@/api/maintenanceTemplates"
import { type SparePartPublic, sparePartsApi } from "@/api/spareParts"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

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
    <div className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">Шаблоны регламентов</p>
        <div className="flex flex-wrap gap-2">
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
          <Button size="sm" variant="default" onClick={handleSave} loading={isSaving}>
            Сохранить
          </Button>
          {selectedId ? (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              Удалить
            </Button>
          ) : null}
        </div>
      </div>

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

      <div className="flex flex-wrap items-start gap-6">
        <div className="w-[320px] shrink-0">
          <p className="mb-2 text-sm text-muted-foreground">
            Шаблоны ({templatesCount})
          </p>
          {templatesLoading ? <p>Загрузка…</p> : null}
          {!templatesLoading && templates.length === 0 ? (
            <p className="text-muted-foreground">Пока нет шаблонов.</p>
          ) : null}
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <Button
                key={t.id}
                variant={t.id === selectedId ? "default" : "outline"}
                size="sm"
                className="h-auto justify-start py-2"
                onClick={() => setSelectedId(t.id)}
              >
                <div className="text-left">
                  <p className="text-sm font-medium">
                    {EQUIPMENT_TYPE_LABELS[t.equipment_type] ?? t.equipment_type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Интервал: {t.interval_hours == null ? "общий" : `${t.interval_hours} м/ч`}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        </div>

        <div className="min-w-[320px] flex-1">
          <p className="mb-2 text-sm text-muted-foreground">
            Форма шаблона
          </p>

          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-sm">
                Тип техники
              </p>
              <Select
                value={draft.equipment_type}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, equipment_type: v }))
                }
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPE_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {EQUIPMENT_TYPE_LABELS[id] ?? id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-sm">
                Интервал ТО (м/ч)
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={draft.interval_hours == null ? "default" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, interval_hours: null }))}
                >
                  Общий
                </Button>
                <Input
                  type="number"
                  className="h-8 max-w-[140px] text-sm"
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
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm">
                Чек-лист
              </p>
              <div className="flex flex-col gap-2">
                {draft.checklist_items.map((c, idx) => (
                  <div key={`${idx}-${c.id ?? "new"}`} className="flex flex-wrap gap-2">
                    <Input
                      value={c.title}
                      className="h-8 min-w-0 flex-1 text-sm"
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
                  </div>
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
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm">
                Требуемые запчасти
              </p>
              <div className="flex flex-col gap-2">
                {draft.spare_part_requirements.map((r, idx) => (
                  <div key={`${idx}-${r.id ?? "new"}`} className="flex flex-wrap gap-2">
                    <Select
                      value={toSelectAll(r.spare_part_id)}
                      onValueChange={(value) => {
                        const id = fromSelectAll(value)
                        setDraft((d) => {
                          const next = [...d.spare_part_requirements]
                          next[idx] = { ...next[idx], spare_part_id: id }
                          return { ...d, spare_part_requirements: next }
                        })
                      }}
                    >
                      <SelectTrigger className="h-9 min-w-0 flex-1 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_ALL_VALUE}>—</SelectItem>
                        {sparePartsOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.title}
                            {p.sku ? `(${p.sku})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      className="h-8 w-24 text-sm"
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
                  </div>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

