import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Button,
  DialogActionTrigger,
  DialogTitle,
  Flex,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useState } from "react"
import { FaPlus } from "react-icons/fa"

import { CategoriesService, type ItemCreate, ItemsService } from "@/client"
import type { ApiError } from "@/client/core/ApiError"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTrigger,
} from "../ui/dialog"
import { Field } from "../ui/field"

const STORAGE_ROWS = 12
const STORAGE_LEVELS = 4
const STORAGE_CELLS_LENGTH = 20

const defaultValues: Partial<ItemCreate> = {
  title: "",
  description: "",
  quantity: 1,
  sku: "",
  barcode: "",
  unit: "",
  category_id: null,
  expires_at: null,
  location: "",
  storage_row: null,
  storage_level: null,
  storage_cell_x: null,
  storage_cell_z: 1,
}

const AddItem = () => {
  const [isOpen, setIsOpen] = useState(false)
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
    formState: { errors, isValid, isSubmitting },
  } = useForm<ItemCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues,
  })

  const mutation = useMutation({
    mutationFn: (data: ItemCreate) =>
      ItemsService.createItem({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Поступление добавлено")
      reset(defaultValues)
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })

  const onSubmit: SubmitHandler<ItemCreate> = (data) => {
    const hasStorage =
      data.storage_row != null && data.storage_level != null &&
      data.storage_cell_x != null
    const body: ItemCreate = {
      ...data,
      quantity: (typeof data.quantity === "number" && data.quantity >= 1) ? data.quantity : 1,
      category_id: data.category_id && data.category_id !== "" ? data.category_id : null,
      expires_at: data.expires_at && data.expires_at !== "" ? data.expires_at : null,
      storage_row: hasStorage ? data.storage_row : null,
      storage_level: hasStorage ? data.storage_level : null,
      storage_cell_x: hasStorage ? data.storage_cell_x : null,
      storage_cell_z: hasStorage ? (data.storage_cell_z ?? 1) : null,
    }
    mutation.mutate(body)
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "lg" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button value="add-item" my={4}>
          <FaPlus fontSize="16px" />
          Добавить
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Добавить поступление</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>Заполните поля. Название обязательно.</Text>
            <VStack gap={4}>
              <Field
                required
                invalid={!!errors.title}
                errorText={errors.title?.message}
                label="Название"
              >
                <Input
                  id="title"
                  {...register("title", { required: "Название обязательно" })}
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
                  placeholder="1"
                  type="number"
                  min={1}
                />
              </Field>

              <Field invalid={!!errors.sku} errorText={errors.sku?.message} label="Артикул (SKU)">
                <Input
                  id="sku"
                  {...register("sku")}
                  placeholder="Артикул"
                  type="text"
                />
              </Field>

              <Field invalid={!!errors.barcode} errorText={errors.barcode?.message} label="Штрихкод">
                <Input
                  id="barcode"
                  {...register("barcode")}
                  placeholder="Штрихкод"
                  type="text"
                />
              </Field>

              <Field invalid={!!errors.unit} errorText={errors.unit?.message} label="Ед. измерения">
                <Input
                  id="unit"
                  {...register("unit")}
                  placeholder="шт, кг, л, упак."
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

              <Field invalid={!!errors.expires_at} errorText={errors.expires_at?.message} label="Срок годности">
                <Input
                  id="expires_at"
                  {...register("expires_at")}
                  type="date"
                />
              </Field>

              <Text fontSize="sm" fontWeight="medium" mt={2}>Ячейка хранения (склад)</Text>
              <Flex gap={3} flexWrap="wrap">
                <Field label="Ряд (1–12)">
                  <select
                    id="storage_row"
                    {...register("storage_row", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
                    style={{
                      width: "100%",
                      minWidth: "80px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <option value="">—</option>
                    {Array.from({ length: STORAGE_ROWS }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Уровень (1–4)">
                  <select
                    id="storage_level"
                    {...register("storage_level", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
                    style={{
                      width: "100%",
                      minWidth: "80px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <option value="">—</option>
                    {Array.from({ length: STORAGE_LEVELS }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Позиция в ряду (1–20)">
                  <select
                    id="storage_cell_x"
                    {...register("storage_cell_x", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
                    style={{
                      width: "100%",
                      minWidth: "100px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <option value="">—</option>
                    {Array.from({ length: STORAGE_CELLS_LENGTH }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </Field>
              </Flex>

              <Field invalid={!!errors.location} errorText={errors.location?.message} label="Зона / примечание">
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
            <DialogActionTrigger asChild>
              <Button variant="subtle" colorPalette="gray" disabled={isSubmitting}>
                Отмена
              </Button>
            </DialogActionTrigger>
            <Button variant="solid" type="submit" disabled={!isValid} loading={isSubmitting}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default AddItem
