import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  type ApiError,
  type UserPublic,
  UsersService,
  type UserUpdateMe,
} from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { emailPattern, handleError } from "@/utils.ts"

const UserInformation = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { showSuccessToast } = useCustomToast()
  const [editMode, setEditMode] = useState(false)
  const currentUser = useCurrentUser()
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { isSubmitting, errors, isDirty },
  } = useForm<UserPublic>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      full_name: currentUser.full_name,
      email: currentUser.email,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: UserUpdateMe) =>
      UsersService.updateUserMe({ requestBody: data }),
    onSuccess: async () => {
      showSuccessToast("Пользователь успешно обновлен.")
      setEditMode(false)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      await router.invalidate()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const onSubmit: SubmitHandler<UserUpdateMe> = async (data) => {
    mutation.mutate(data)
  }

  const onCancel = () => {
    reset()
    setEditMode(false)
  }

  return (
    <div className="w-full max-w-full">
      <h2 className="py-4 text-lg font-medium">Информация о пользователе</h2>
      <form className="w-full max-w-sm" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="full_name">Полное имя</Label>
          {editMode ? (
            <Input
              id="full_name"
              {...register("full_name", { maxLength: 30 })}
              type="text"
            />
          ) : (
            <p
              className={`rounded-md py-2 text-sm ${
                !currentUser.full_name ? "text-muted-foreground" : ""
              }`}
            >
              {currentUser.full_name || "N/A"}
            </p>
          )}
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="email">Email</Label>
          {editMode ? (
            <>
              <Input
                id="email"
                {...register("email", {
                  required: "Email is required",
                  pattern: emailPattern,
                })}
                type="email"
                aria-invalid={!!errors.email}
              />
              {errors.email?.message ? (
                <p className="text-sm text-destructive" role="alert">
                  {String(errors.email.message)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="truncate py-2 text-sm">{currentUser.email}</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {editMode ? (
            <>
              <Button
                variant="solid"
                size="sm"
                type="submit"
                loading={isSubmitting}
                disabled={!isDirty || !getValues("email")}
              >
                Сохранить
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Отмена
              </Button>
            </>
          ) : (
            <Button
              variant="solid"
              size="sm"
              type="button"
              onClick={() => setEditMode(true)}
            >
              Изменить
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

export default UserInformation
