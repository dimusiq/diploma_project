import { useMutation } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiLock } from "react-icons/fi"

import {
  type ApiError,
  type UpdatePassword,
  UsersService,
} from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { PasswordInput } from "@/components/ui/password-input.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { confirmPasswordRules, handleError, passwordRules } from "@/utils.ts"

interface UpdatePasswordForm extends UpdatePassword {
  confirm_password: string
}

const ChangePassword = () => {
  const { showSuccessToast } = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<UpdatePasswordForm>({
    mode: "onChange",
    criteriaMode: "all",
  })

  const mutation = useMutation({
    mutationFn: (data: UpdatePassword) =>
      UsersService.updatePasswordMe({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Password updated successfully.")
      reset()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const onSubmit: SubmitHandler<UpdatePasswordForm> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <div className="w-full max-w-full">
      <h2 className="py-4 text-lg font-medium">Изменить пароль</h2>
      <form className="max-w-sm space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <PasswordInput
          type="current_password"
          startElement={<FiLock />}
          {...register("current_password", passwordRules())}
          placeholder="Текущий пароль"
          errors={errors}
        />
        <PasswordInput
          type="new_password"
          startElement={<FiLock />}
          {...register("new_password", passwordRules())}
          placeholder="Новый пароль"
          errors={errors}
        />
        <PasswordInput
          type="confirm_password"
          startElement={<FiLock />}
          {...register("confirm_password", confirmPasswordRules(getValues))}
          placeholder="Подвердите новый пароль"
          errors={errors}
        />
        <Button
          variant="solid"
          size="sm"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.isPending}
        >
          Сохранить изменения
        </Button>
      </form>
    </div>
  )
}
export default ChangePassword
