import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { type BrandPublic, brandsApi } from "@/api/brands.ts"
import {
  EQUIPMENT_TYPE_LABELS,
  type EquipmentCreate,
  type EquipmentPublic,
  type EquipmentUpdate,
  equipmentApi,
} from "@/api/equipment.ts"
import { zonesApi } from "@/api/zones.ts"
import type { ApiError } from "@/client/core/ApiError.ts"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { handleError } from "@/utils.ts"

const STATUS_OPTIONS = [
  { value: "active", label: "В эксплуатации" },
  { value: "maintenance", label: "На обслуживании" },
  { value: "decommissioned", label: "Выведена из эксплуатации" },
]

const EQUIPMENT_TYPE_OPTIONS = Object.entries(EQUIPMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
)

type FormValues = Omit<EquipmentCreate, "brand_id"> & {
  brand_id: string
  instructions?: string | null
}

const getDefaultValues = (firstBrandId: string): FormValues => ({
  equipment_type: "elektropogruzchik",
  vin: "",
  serial_number: "",
  garage_number: "",
  brand_id: firstBrandId,
  model: "",
  commissioned_at: undefined,
  engine_hours: undefined,
  current_status: "active",
  zone: "",
  attachments: "",
  instructions: "",
})

function attachmentsDisplayValue(attachments: string | null): string {
  if (!attachments?.trim()) return ""
  try {
    const v = JSON.parse(attachments)
    return Array.isArray(v) ? v.join("\n") : attachments
  } catch {
    return attachments
  }
}

interface EquipmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editItem?: EquipmentPublic | null
  /** Показывать как выезжающую панель справа */
  asDrawer?: boolean
  /** Показывать как полноценную страницу (форма без диалога/панели) */
  asPage?: boolean
}

export function EquipmentFormDialog({
  open,
  onOpenChange,
  editItem,
  asDrawer = false,
  asPage = false,
}: EquipmentFormDialogProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const { data: brands = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: () => brandsApi.list(),
  })
  const { data: zones = [] } = useQuery({
    queryKey: ["zones"],
    queryFn: () => zonesApi.list(),
  })

  const isEdit = Boolean(editItem?.id)
  const firstBrandId = brands[0]?.id ?? ""

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: getDefaultValues(firstBrandId),
  })

  useEffect(() => {
    if (open && brands.length) {
      if (editItem) {
        reset({
          equipment_type: editItem.equipment_type ?? "elektropogruzchik",
          vin: editItem.vin ?? "",
          serial_number: editItem.serial_number ?? "",
          garage_number: editItem.garage_number ?? "",
          brand_id: editItem.brand_id,
          model: editItem.model,
          commissioned_at: editItem.commissioned_at ?? undefined,
          engine_hours: editItem.engine_hours ?? undefined,
          current_status: editItem.current_status,
          zone: editItem.zone ?? "",
          attachments: attachmentsDisplayValue(editItem.attachments),
          instructions: editItem.instructions ?? "",
        })
      } else {
        reset(getDefaultValues(brands[0]?.id ?? ""))
      }
    }
  }, [open, editItem, reset, brands])

  const createMutation = useMutation({
    mutationFn: (data: EquipmentCreate) => equipmentApi.create(data),
    onSuccess: () => {
      showSuccessToast("Техника добавлена")
      reset(getDefaultValues(firstBrandId))
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
    },
    onError: (err: ApiError) => handleError(err),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EquipmentUpdate }) =>
      equipmentApi.update(id, data),
    onSuccess: () => {
      showSuccessToast("Техника обновлена")
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
    },
    onError: (err: ApiError) => handleError(err),
  })

  const onSubmit: SubmitHandler<FormValues> = (data) => {
    if (!data.brand_id?.trim()) {
      setError("brand_id", { type: "required", message: "Укажите бренд" })
      return
    }
    const attachmentsStr =
      typeof data.attachments === "string" && data.attachments.trim()
        ? data.attachments.trim()
        : null
    let attachmentsParsed: string[] = []
    if (attachmentsStr) {
      try {
        const v = JSON.parse(attachmentsStr)
        attachmentsParsed = Array.isArray(v) ? v : [attachmentsStr]
      } catch {
        attachmentsParsed = attachmentsStr
          .split(/\n/)
          .map((x) => x.trim())
          .filter(Boolean)
      }
    }
    const body: EquipmentCreate = {
      equipment_type: data.equipment_type || "elektropogruzchik",
      vin: data.vin?.trim() || null,
      serial_number: data.serial_number?.trim() || null,
      garage_number: data.garage_number?.trim() || null,
      brand_id: data.brand_id || "",
      model: data.model?.trim() || "",
      commissioned_at: data.commissioned_at || null,
      engine_hours:
        data.engine_hours != null ? Number(data.engine_hours) : null,
      current_status: data.current_status || "active",
      zone: data.zone?.trim() || null,
      attachments: attachmentsParsed.length
        ? JSON.stringify(attachmentsParsed)
        : null,
      instructions: data.instructions?.trim() || null,
    }
    if (isEdit && editItem) {
      updateMutation.mutate({ id: editItem.id, data: body as EquipmentUpdate })
    } else {
      createMutation.mutate(body)
    }
  }

  const loading = createMutation.isPending || updateMutation.isPending

  const formContent = (
    <>
      <p className="mb-4 text-sm">
        Складская техника: тип, бренд (из справочника), VIN, модель, моточасы,
        место.
      </p>
      {brands.length === 0 && (
        <p className="mb-2 text-sm text-muted-foreground">
          Нет брендов. Добавьте их в разделе «Администрирование» → Бренды
          техники.
        </p>
      )}
      <div className="flex flex-col gap-4">
        <Field
          required
          invalid={!!errors.equipment_type}
          errorText={errors.equipment_type?.message}
          label="Тип техники"
        >
          <Select
            value={watch("equipment_type")}
            onValueChange={(v) =>
              setValue("equipment_type", v, { shouldValidate: true })
            }
          >
            <SelectTrigger id="equipment_type" className="h-9 w-full text-sm">
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          required
          invalid={!!errors.brand_id}
          errorText={errors.brand_id?.message}
          label="Бренд"
        >
          <Select
            value={toSelectAll(watch("brand_id") ?? "")}
            onValueChange={(v) =>
              setValue("brand_id", fromSelectAll(v), { shouldValidate: true })
            }
          >
            <SelectTrigger id="brand_id" className="h-9 w-full text-sm">
              <SelectValue placeholder="Бренд" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL_VALUE}>
                — Выберите бренд —
              </SelectItem>
              {brands.map((b: BrandPublic) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          invalid={!!errors.vin}
          errorText={errors.vin?.message}
          label="VIN"
        >
          <Input id="vin" {...register("vin")} placeholder="VIN" />
        </Field>
        <Field
          invalid={!!errors.serial_number}
          errorText={errors.serial_number?.message}
          label="Серийный номер"
        >
          <Input
            id="serial_number"
            {...register("serial_number")}
            placeholder="Серийный номер"
          />
        </Field>
        <Field
          invalid={!!errors.garage_number}
          errorText={errors.garage_number?.message}
          label="Гаражный номер"
        >
          <Input
            id="garage_number"
            {...register("garage_number")}
            placeholder="Гаражный номер"
          />
        </Field>
        <Field
          required
          invalid={!!errors.model}
          errorText={errors.model?.message}
          label="Модель"
        >
          <Input
            id="model"
            {...register("model", { required: "Укажите модель" })}
            placeholder="Модель"
          />
        </Field>
        <Field label="Дата ввода в эксплуатацию">
          <Input
            id="commissioned_at"
            {...register("commissioned_at")}
            type="date"
          />
        </Field>
        <Field
          invalid={!!errors.engine_hours}
          errorText={errors.engine_hours?.message}
          label="Моточасы"
        >
          <Input
            id="engine_hours"
            type="number"
            min={0}
            {...register("engine_hours", {
              setValueAs: (v) =>
                v === "" || v == null ? undefined : Number(v),
              min: { value: 0, message: "Не менее 0" },
            })}
            placeholder="0"
          />
        </Field>
        <Field label="Текущее состояние">
          <Select
            value={watch("current_status") ?? "active"}
            onValueChange={(v) => setValue("current_status", v)}
          >
            <SelectTrigger id="current_status" className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Зона склада">
          {zones.length > 0 ? (
            <Select
              value={toSelectAll(watch("zone") ?? "")}
              onValueChange={(v) =>
                setValue("zone", fromSelectAll(v), { shouldValidate: true })
              }
            >
              <SelectTrigger id="zone" className="h-9 w-full text-sm">
                <SelectValue placeholder="Зона" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_ALL_VALUE}>— Не указана —</SelectItem>
                {editItem?.zone?.trim() &&
                  !zones.some((z) => z.name === editItem.zone) && (
                    <SelectItem value={editItem.zone}>
                      {editItem.zone} (текущее)
                    </SelectItem>
                  )}
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.name}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="zone" {...register("zone")} placeholder="Зона склада" />
          )}
        </Field>
        <Field
          label="Фото / документация (ссылки)"
          helperText="По одной ссылке на строку или JSON-массив"
        >
          <Textarea
            id="attachments"
            {...register("attachments")}
            placeholder="https://...&#10;https://..."
            rows={3}
          />
        </Field>
        <Field label="Инструкции">
          <Textarea
            id="instructions"
            {...register("instructions")}
            placeholder="Инструкции по эксплуатации"
            rows={3}
          />
        </Field>
      </div>
    </>
  )

  if (asPage) {
    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex max-w-xl flex-col gap-6">
          {formContent}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Назад
            </Button>
            <Button
              variant={isEdit ? "solid" : "outlineSky"}
              size="sm"
              type="submit"
              disabled={loading}
              loading={loading}
            >
              {isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </form>
    )
  }

  if (asDrawer) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit(onSubmit)}
          >
            <SheetHeader className="border-b px-4 py-3 pr-10 text-left">
              <SheetTitle>
                {isEdit
                  ? `${editItem?.brand_name} ${editItem?.model}`
                  : "Добавить технику"}
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              {formContent}
            </div>
            <SheetFooter className="flex flex-row flex-wrap gap-2 border-t px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                type="button"
                onClick={() => onOpenChange(false)}
              >
                Закрыть
              </Button>
              <Button
                variant={isEdit ? "solid" : "outlineSky"}
                size="sm"
                type="submit"
                disabled={loading}
                loading={loading}
              >
                {isEdit ? "Сохранить" : "Добавить"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      size={{ base: "xs", md: "lg" }}
      placement="center"
    >
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Редактировать технику" : "Добавить технику"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>{formContent}</DialogBody>
          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button variant="outline" size="sm" disabled={loading}>
                Отмена
              </Button>
            </DialogActionTrigger>
            <Button
              variant={isEdit ? "solid" : "outlineSky"}
              size="sm"
              type="submit"
              disabled={loading}
              loading={loading}
            >
              {isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}
