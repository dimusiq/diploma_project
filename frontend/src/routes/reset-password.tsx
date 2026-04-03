import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FiLock } from "react-icons/fi"

import { LoginService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Label } from "@/components/ui/label.tsx"
import { PasswordField } from "@/components/ui/password-field.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { getApiErrorMessage } from "@/utils.ts"

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

type ResetState = { error: string | null; success: boolean }

async function resetPasswordAction(
  _prevState: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = new URLSearchParams(window.location.search).get("token")
  if (!token) {
    return { error: "Отсутствует токен сброса пароля", success: false }
  }
  const newPassword = formData.get("new_password") as string
  const confirmPassword = formData.get("confirm_password") as string
  if (!newPassword || newPassword.length < 8) {
    return {
      error: "Пароль должен содержать не менее 8 символов",
      success: false,
    }
  }
  if (newPassword !== confirmPassword) {
    return { error: "Пароль не совпадает", success: false }
  }
  try {
    await LoginService.resetPassword({
      requestBody: { new_password: newPassword, token },
    })
    return { error: null, success: true }
  } catch (err) {
    return { error: getApiErrorMessage(err), success: false }
  }
}

function ResetPassword() {
  const navigate = useNavigate()
  const { showSuccessToast } = useCustomToast()
  const [state, setState] = useState<ResetState>({
    error: null,
    success: false,
  })
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (state.success) {
      showSuccessToast("Пароль успешно изменен.")
      navigate({ to: "/login" })
    }
  }, [state.success, showSuccessToast, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <form
        noValidate
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setIsPending(true)
          try {
            const next = await resetPasswordAction(
              { error: null, success: false },
              new FormData(e.currentTarget),
            )
            setState(next)
          } finally {
            setIsPending(false)
          }
        }}
      >
        <h1 className="mb-2 text-center text-2xl font-semibold text-primary">
          Сброс пароля
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          Пожалуйста, введите новый пароль для вашей учетной записи.
        </p>
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="new_password">Новый пароль</Label>
          <PasswordField
            id="new_password"
            name="new_password"
            placeholder="Новый пароль"
            autoComplete="new-password"
            startElement={<FiLock />}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm_password">Подтвердите пароль</Label>
          <PasswordField
            id="confirm_password"
            name="confirm_password"
            placeholder="Подтвердите пароль"
            autoComplete="new-password"
            startElement={<FiLock />}
          />
        </div>
        <Button
          variant="solid"
          size="sm"
          type="submit"
          loading={isPending}
          disabled={isPending}
          className="w-full"
        >
          Сбросить пароль
        </Button>
      </form>
    </div>
  )
}
