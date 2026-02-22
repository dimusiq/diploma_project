import {
  Button,
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  Flex,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
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
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer.tsx"
import { Field } from "@/components/ui/field.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
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
      <Text mb={4}>
        Складская техника: тип, бренд (из справочника), VIN, модель, моточасы,
        место.
      </Text>
      {brands.length === 0 && (
        <Text fontSize="sm" color="fg.muted" mb={2}>
          Нет брендов. Добавьте их в разделе «Администрирование» → Бренды
          техники.
        </Text>
      )}
      <VStack gap={4}>
        <Field
          required
          invalid={!!errors.equipment_type}
          errorText={errors.equipment_type?.message}
          label="Тип техники"
        >
          <select
            id="equipment_type"
            {...register("equipment_type", { required: "Укажите тип" })}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
            }}
          >
            {EQUIPMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          required
          invalid={!!errors.brand_id}
          errorText={errors.brand_id?.message}
          label="Бренд"
        >
          <select
            id="brand_id"
            {...register("brand_id", { required: "Укажите бренд" })}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
            }}
          >
            <option value="">— Выберите бренд —</option>
            {brands.map((b: BrandPublic) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
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
          <select
            id="current_status"
            {...register("current_status")}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--chakra-colors-border)",
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Зона склада">
          {zones.length > 0 ? (
            <select
              id="zone"
              {...register("zone")}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--chakra-colors-border)",
              }}
            >
              <option value="">— Не указана —</option>
              {editItem?.zone?.trim() &&
                !zones.some((z) => z.name === editItem.zone) && (
                  <option value={editItem.zone}>
                    {editItem.zone} (текущее)
                  </option>
                )}
              {zones.map((z) => (
                <option key={z.id} value={z.name}>
                  {z.name}
                </option>
              ))}
            </select>
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
      </VStack>
    </>
  )

  if (asPage) {
    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <VStack align="stretch" gap={6} maxW="xl">
          {formContent}
          <Flex gap={3} pt={2}>
            <Button
              variant="outline"
              type="button"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Назад
            </Button>
            <Button type="submit" disabled={loading} loading={loading}>
              {isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </Flex>
        </VStack>
      </form>
    )
  }

  if (asDrawer) {
    return (
      <DrawerRoot
        open={open}
        onOpenChange={(e) => onOpenChange(e.open)}
        placement="end"
        size="md"
      >
        <DrawerBackdrop />
        <DrawerContent>
          <DrawerCloseTrigger />
          <form onSubmit={handleSubmit(onSubmit)}>
            <DrawerHeader>
              <DrawerTitle>
                {isEdit
                  ? `${editItem?.brand_name} ${editItem?.model}`
                  : "Добавить технику"}
              </DrawerTitle>
            </DrawerHeader>
            <DrawerBody overflowY="auto">{formContent}</DrawerBody>
            <DrawerFooter gap={2} borderTopWidth="1px">
              <Button
                variant="subtle"
                colorPalette="gray"
                disabled={loading}
                type="button"
                onClick={() => onOpenChange(false)}
              >
                Закрыть
              </Button>
              <Button type="submit" disabled={loading} loading={loading}>
                {isEdit ? "Сохранить" : "Добавить"}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </DrawerRoot>
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
              <Button variant="subtle" colorPalette="gray" disabled={loading}>
                Отмена
              </Button>
            </DialogActionTrigger>
            <Button type="submit" disabled={loading} loading={loading}>
              {isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}
