import {
  Button,
  ButtonGroup,
  DialogActionTrigger,
  Flex,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FaExchangeAlt } from "react-icons/fa"

import {
  type ApiError,
  CategoriesService,
  type ItemPublic,
  ItemsService,
  type ItemUpdate,
} from "@/client/index.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { handleError } from "@/utils.ts"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog.tsx"
import { Field } from "../ui/field.tsx"

const STORAGE_ROWS = 12
const STORAGE_LEVELS = 4
const STORAGE_CELLS_LENGTH = 20

interface EditItemProps {
  item: ItemPublic
  /** Controlled: open dialog from outside (e.g. from URL ?open=id). */
  open?: boolean
  onOpenChange?: (e: { open: boolean }) => void
}

const EditItem = ({
  item,
  open: controlledOpen,
  onOpenChange,
}: EditItemProps) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined && onOpenChange != null
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled
    ? (next: boolean) => onOpenChange?.({ open: next })
    : setInternalOpen
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => CategoriesService.readCategories(),
  })
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ItemUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: item.title,
      description: item.description ?? undefined,
      quantity: item.quantity ?? 1,
      sku: item.sku ?? undefined,
      barcode: item.barcode ?? undefined,
      unit: item.unit ?? undefined,
      expires_at: item.expires_at ?? undefined,
      location: item.location ?? undefined,
      category_id: item.category_id ?? undefined,
      storage_row: item.storage_row ?? undefined,
      storage_level: item.storage_level ?? undefined,
      storage_cell_x: item.storage_cell_x ?? undefined,
      storage_cell_z: item.storage_cell_z ?? undefined,
    },
  })

  useEffect(() => {
    if (isOpen && item) {
      reset({
        title: item.title,
        description: item.description ?? undefined,
        quantity: item.quantity ?? 1,
        sku: item.sku ?? undefined,
        barcode: item.barcode ?? undefined,
        unit: item.unit ?? undefined,
        expires_at: item.expires_at ?? undefined,
        location: item.location ?? undefined,
        category_id: item.category_id ?? undefined,
        storage_row: item.storage_row ?? undefined,
        storage_level: item.storage_level ?? undefined,
        storage_cell_x: item.storage_cell_x ?? undefined,
        storage_cell_z: item.storage_cell_z ?? undefined,
      })
    }
  }, [isOpen, item, reset])

  const mutation = useMutation({
    mutationFn: (data: ItemUpdate) =>
      ItemsService.updateItem({ id: item.id, requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Поступление успешно обновлено.")
      reset()
      setOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })

  const onSubmit: SubmitHandler<ItemUpdate> = (data) => {
    const body: ItemUpdate = {
      ...data,
      quantity:
        typeof data.quantity === "number" && data.quantity >= 1
          ? data.quantity
          : undefined,
      category_id:
        data.category_id && data.category_id !== "" ? data.category_id : null,
      expires_at:
        data.expires_at && data.expires_at !== "" ? data.expires_at : null,
    }
    mutation.mutate(body)
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "lg" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setOpen(open)}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <FaExchangeAlt fontSize="16px" />
            Изменить поступление
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Изменить поступление</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>Обновите поля ниже.</Text>
            <VStack gap={4}>
              <Field
                required
                invalid={!!errors.title}
                errorText={errors.title?.message}
                label="Название"
              >
                <Input
                  id="title"
                  {...register("title", { required: "Название обязательно." })}
                  placeholder="Название"
                  type="text"
                />
              </Field>
              <Field
                invalid={!!errors.description}
                errorText={errors.description?.message}
                label="Описание"
              >
                <Input
                  id="description"
                  {...register("description")}
                  placeholder="Описание"
                  type="text"
                />
              </Field>
              <Field
                invalid={!!errors.quantity}
                errorText={errors.quantity?.message}
                label="Количество"
              >
                <Input
                  id="quantity"
                  {...register("quantity", {
                    valueAsNumber: true,
                    min: { value: 1, message: "Минимум 1" },
                  })}
                  type="number"
                  min={1}
                />
              </Field>
              <Field
                invalid={!!errors.sku}
                errorText={errors.sku?.message}
                label="Артикул (SKU)"
              >
                <Input
                  id="sku"
                  {...register("sku")}
                  placeholder="Артикул"
                  type="text"
                />
              </Field>
              <Field
                invalid={!!errors.barcode}
                errorText={errors.barcode?.message}
                label="Штрихкод"
              >
                <Input
                  id="barcode"
                  {...register("barcode")}
                  placeholder="Штрихкод"
                  type="text"
                />
              </Field>
              <Field
                invalid={!!errors.unit}
                errorText={errors.unit?.message}
                label="Ед. измерения"
              >
                <Input
                  id="unit"
                  {...register("unit")}
                  placeholder="шт, кг, л"
                  type="text"
                />
              </Field>
              <Field label="Категория">
                <select
                  id="category_id"
                  {...register("category_id")}
                  value={watch("category_id") ?? ""}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <option value="">Выберите категорию</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                invalid={!!errors.expires_at}
                errorText={errors.expires_at?.message}
                label="Срок годности"
              >
                <Input
                  id="expires_at"
                  {...register("expires_at")}
                  type="date"
                />
              </Field>
              <Text fontSize="sm" fontWeight="medium" mt={2}>
                Ячейка хранения (склад)
              </Text>
              <Flex gap={3} flexWrap="wrap">
                <Field label="Ряд (1–12)">
                  <select
                    id="storage_row"
                    {...register("storage_row", {
                      setValueAs: (v) => (v === "" ? null : Number(v)),
                    })}
                    style={{
                      width: "100%",
                      minWidth: "80px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <option value="">—</option>
                    {Array.from({ length: STORAGE_ROWS }, (_, i) => i + 1).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Уровень (1–4)">
                  <select
                    id="storage_level"
                    {...register("storage_level", {
                      setValueAs: (v) => (v === "" ? null : Number(v)),
                    })}
                    style={{
                      width: "100%",
                      minWidth: "80px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <option value="">—</option>
                    {Array.from(
                      { length: STORAGE_LEVELS },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Позиция (1–20)">
                  <select
                    id="storage_cell_x"
                    {...register("storage_cell_x", {
                      setValueAs: (v) => (v === "" ? null : Number(v)),
                    })}
                    style={{
                      width: "100%",
                      minWidth: "100px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <option value="">—</option>
                    {Array.from(
                      { length: STORAGE_CELLS_LENGTH },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
              </Flex>
              <Field
                invalid={!!errors.location}
                errorText={errors.location?.message}
                label="Зона / примечание"
              >
                <Input
                  id="location"
                  {...register("location")}
                  placeholder="Доп. описание места"
                  type="text"
                />
              </Field>
            </VStack>
          </DialogBody>
          <DialogFooter gap={2}>
            <ButtonGroup>
              <DialogActionTrigger asChild>
                <Button variant="outline" size="sm" disabled={isSubmitting}>
                  Отменить
                </Button>
              </DialogActionTrigger>
              <Button variant="solid" size="sm" type="submit" loading={isSubmitting}>
                Сохранить
              </Button>
            </ButtonGroup>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default EditItem
