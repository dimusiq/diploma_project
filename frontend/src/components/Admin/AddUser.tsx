import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, type SubmitHandler, useForm } from "react-hook-form"
import { FaPlus } from "react-icons/fa"
import type { ApiError } from "@/client/core/ApiError.ts"
import { RolesService, type UserCreate, UsersService } from "@/client/index.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"
import { emailPattern, handleError } from "@/utils.ts"
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
import { Checkbox } from "../ui/checkbox.tsx"
import { Field } from "../ui/field.tsx"
import { Input } from "../ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.tsx"

interface UserCreateForm extends UserCreate {
  confirm_password: string
}

const ROLE_EMPTY = ""

const AddUser = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: () => RolesService.readRoles(),
  })
  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<UserCreateForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      confirm_password: "",
      is_superuser: false,
      is_active: false,
      role_id: ROLE_EMPTY,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: UserCreate) =>
      UsersService.createUser({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Пользователь успешно создан.")
      reset()
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["users"],
      })
    },
  })

  const onSubmit: SubmitHandler<UserCreateForm> = (data) => {
    const payload: UserCreate = {
      ...data,
      role_id:
        data.role_id && data.role_id !== ROLE_EMPTY ? data.role_id : null,
    }
    mutation.mutate(payload)
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "md" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button variant="solid" size="sm" value="add-user">
          <FaPlus fontSize="16px" />
          Добавить пользователя
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Добавить пользователя</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="mb-4 text-sm">
              Заполните форму для создания нового пользователя. Все поля
              обязательны для заполнения.
            </p>
            <div className="flex flex-col gap-4">
              <Field
                required
                invalid={!!errors.email}
                errorText={errors.email?.message}
                label="Email"
              >
                <Input
                  id="email"
                  {...register("email", {
                    required: "Email обязателен",
                    pattern: emailPattern,
                  })}
                  placeholder="Email"
                  type="email"
                />
              </Field>

              <Field
                invalid={!!errors.full_name}
                errorText={errors.full_name?.message}
                label="Полное имя"
              >
                <Input
                  id="name"
                  {...register("full_name")}
                  placeholder="Полное имя"
                  type="text"
                />
              </Field>

              <Field label="Роль">
                <Select
                  value={toSelectAll(watch("role_id") ?? ROLE_EMPTY)}
                  onValueChange={(v) =>
                    setValue("role_id", fromSelectAll(v), {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="role_id" className="h-9 w-full text-sm">
                    <SelectValue placeholder="Роль" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_ALL_VALUE}>
                      — не выбрана —
                    </SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                required
                invalid={!!errors.password}
                errorText={errors.password?.message}
                label="Укажите пароль"
              >
                <Input
                  id="password"
                  {...register("password", {
                    required: "Пароль обязателен",
                    minLength: {
                      value: 8,
                      message: "Пароль должен содержать не менее 8 символов",
                    },
                  })}
                  placeholder="Пароль"
                  type="password"
                />
              </Field>

              <Field
                required
                invalid={!!errors.confirm_password}
                errorText={errors.confirm_password?.message}
                label="Подтвердите пароль"
              >
                <Input
                  id="confirm_password"
                  {...register("confirm_password", {
                    required: "Пожалуйста, подтвердите пароль",
                    validate: (value) =>
                      value === getValues().password || "Пароли не совпадают",
                  })}
                  placeholder="Пароль"
                  type="password"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <Controller
                control={control}
                name="is_superuser"
                render={({ field }) => (
                  <Field
                    disabled={field.disabled}
                    className="text-cyan-700 dark:text-cyan-400"
                  >
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(c) => field.onChange(c)}
                    >
                      Суперпользователь?
                    </Checkbox>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => (
                  <Field
                    disabled={field.disabled}
                    className="text-cyan-700 dark:text-cyan-400"
                  >
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(c) => field.onChange(c)}
                    >
                      Активный?
                    </Checkbox>
                  </Field>
                )}
              />
            </div>
          </DialogBody>

          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button variant="outline" size="sm" disabled={isSubmitting}>
                Отменить
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

export default AddUser
