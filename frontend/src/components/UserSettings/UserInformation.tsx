import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  type ApiError,
  type UserPublic,
  UsersService,
  type UserUpdateMe,
} from "@/client/index.ts"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import { useAuthenticatedAvatarObjectUrl } from "@/hooks/useAuthenticatedAvatarObjectUrl.ts"
import { uploadUserAvatarFile } from "@/lib/uploadUserAvatar.ts"
import { initialsFromUser } from "@/lib/userInitials.ts"
import { emailPattern, handleError } from "@/utils.ts"

const UserInformation = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { showSuccessToast } = useCustomToast()
  const [editMode, setEditMode] = useState(false)
  const currentUser = useCurrentUser()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { dataUpdatedAt } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: UsersService.readUserMe,
    enabled: isLoggedIn(),
  })
  const avatarObjectUrl = useAuthenticatedAvatarObjectUrl(
    currentUser.id,
    currentUser.avatar_ext,
    dataUpdatedAt,
  )
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

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => uploadUserAvatarFile(file),
    onSuccess: async () => {
      showSuccessToast("Фото профиля обновлено.")
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      await router.invalidate()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const deleteAvatarMutation = useMutation({
    mutationFn: () => UsersService.deleteMyAvatar(),
    onSuccess: async () => {
      showSuccessToast("Фото профиля удалено.")
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      await router.invalidate()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const onAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) uploadAvatarMutation.mutate(file)
  }

  return (
    <div className="w-full max-w-full">
      <h2 className="py-4 text-lg font-medium">Информация о пользователе</h2>
      <div className="mb-8 flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="size-20">
          {avatarObjectUrl ? (
            <AvatarImage src={avatarObjectUrl} alt="" />
          ) : null}
          <AvatarFallback className="text-lg font-medium">
            {initialsFromUser(currentUser.full_name, currentUser.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            JPEG, PNG или WebP, до 2 МБ. Фото сохраняется в сжатом виде.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Выбрать фото профиля"
              onChange={onAvatarFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              loading={uploadAvatarMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              Загрузить фото
            </Button>
            {currentUser.avatar_ext ? (
              <Button
                variant="outlineDestructive"
                size="sm"
                type="button"
                loading={deleteAvatarMutation.isPending}
                onClick={() => deleteAvatarMutation.mutate()}
              >
                Удалить фото
              </Button>
            ) : null}
          </div>
        </div>
      </div>
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
                variant="outline"
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
              variant="outline"
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
