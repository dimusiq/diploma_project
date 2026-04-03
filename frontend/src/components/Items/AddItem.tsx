import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FaPlus } from "react-icons/fa"
import type { ApiError } from "@/client/core/ApiError.ts"
import {
  CategoriesService,
  type ItemCreate,
  ItemsService,
} from "@/client/index.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { handleError } from "@/utils.ts"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/app-dialog.tsx"
import { Button } from "../ui/button.tsx"
import { Field } from "../ui/field.tsx"
import { Input } from "../ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.tsx"

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
    setValue,
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
      data.storage_row != null &&
      data.storage_level != null &&
      data.storage_cell_x != null
    const body: ItemCreate = {
      ...data,
      quantity:
        typeof data.quantity === "number" && data.quantity >= 1
          ? data.quantity
          : 1,
      category_id:
        data.category_id && data.category_id !== "" ? data.category_id : null,
      expires_at:
        data.expires_at && data.expires_at !== "" ? data.expires_at : null,
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
        <Button variant="outlineSky" size="sm" value="add-item" className="my-4">
          <FaPlus className="size-4" />
          Добавить
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Добавить поступление</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="mb-4 text-sm">
              Заполните поля. Название обязательно.
            </p>
            <div className="flex flex-col gap-4">
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
                  placeholder="шт, кг, л, упак."
                  type="text"
                />
              </Field>

              <Field label="Категория">
                <Select
                  value={toSelectAll(watch("category_id") ?? "")}
                  onValueChange={(v) =>
                    setValue("category_id", fromSelectAll(v) || null, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger
                    id="category_id"
                    className="h-9 w-full text-sm"
                  >
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_ALL_VALUE}>
                      Выберите категорию
                    </SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              <p className="mt-2 text-sm font-medium">
                Ячейка хранения (склад)
              </p>
              <div className="flex flex-wrap gap-3">
                <Field label="Ряд (1–12)">
                  <Select
                    value={
                      watch("storage_row") == null
                        ? SELECT_ALL_VALUE
                        : String(watch("storage_row"))
                    }
                    onValueChange={(v) =>
                      setValue(
                        "storage_row",
                        fromSelectAll(v) === ""
                          ? null
                          : Number(fromSelectAll(v)),
                        { shouldValidate: true },
                      )
                    }
                  >
                    <SelectTrigger
                      id="storage_row"
                      className="h-9 min-w-[80px] w-full text-sm"
                    >
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_ALL_VALUE}>—</SelectItem>
                      {Array.from(
                        { length: STORAGE_ROWS },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Уровень (1–4)">
                  <Select
                    value={
                      watch("storage_level") == null
                        ? SELECT_ALL_VALUE
                        : String(watch("storage_level"))
                    }
                    onValueChange={(v) =>
                      setValue(
                        "storage_level",
                        fromSelectAll(v) === ""
                          ? null
                          : Number(fromSelectAll(v)),
                        { shouldValidate: true },
                      )
                    }
                  >
                    <SelectTrigger
                      id="storage_level"
                      className="h-9 min-w-[80px] w-full text-sm"
                    >
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_ALL_VALUE}>—</SelectItem>
                      {Array.from(
                        { length: STORAGE_LEVELS },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Позиция в ряду (1–20)">
                  <Select
                    value={
                      watch("storage_cell_x") == null
                        ? SELECT_ALL_VALUE
                        : String(watch("storage_cell_x"))
                    }
                    onValueChange={(v) =>
                      setValue(
                        "storage_cell_x",
                        fromSelectAll(v) === ""
                          ? null
                          : Number(fromSelectAll(v)),
                        { shouldValidate: true },
                      )
                    }
                  >
                    <SelectTrigger
                      id="storage_cell_x"
                      className="h-9 min-w-[100px] w-full text-sm"
                    >
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_ALL_VALUE}>—</SelectItem>
                      {Array.from(
                        { length: STORAGE_CELLS_LENGTH },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

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
            </div>
          </DialogBody>

          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button variant="outline" size="sm" disabled={isSubmitting}>
                Отмена
              </Button>
            </DialogActionTrigger>
            <Button
              variant="solid"
              size="sm"
              type="submit"
              disabled={!isValid}
              loading={isSubmitting}
            >
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
