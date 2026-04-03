import { createFileRoute, redirect } from "@tanstack/react-router"
import { useActionState, useEffect } from "react"
import { FiMail } from "react-icons/fi"

import { LoginService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { InputWithIcon } from "@/components/ui/input-with-icon.tsx"
import { Label } from "@/components/ui/label.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { getApiErrorMessage } from "@/utils.ts"

export const Route = createFileRoute("/recover-password")({
  component: RecoverPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

type RecoverState = { error: string | null; success: boolean }

async function recoverAction(
  _prevState: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const email = (formData.get("email") as string)?.trim()
  if (!email) {
    return { error: "Введите email", success: false }
  }
  try {
    await LoginService.recoverPassword({ email })
    return { error: null, success: true }
  } catch (err) {
    return { error: getApiErrorMessage(err), success: false }
  }
}

function RecoverPassword() {
  const { showSuccessToast } = useCustomToast()
  const [state, formAction, isPending] = useActionState(recoverAction, {
    error: null,
    success: false,
  } as RecoverState)

  useEffect(() => {
    if (state.success) {
      showSuccessToast("Пароль успешно отправлен на email.")
    }
  }, [state.success, showSuccessToast])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <h1 className="mb-2 text-center text-2xl font-semibold text-primary">
          Восстановление пароля
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          Пароль будет отправлен на указанный вами email.
        </p>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <InputWithIcon
            id="email"
            name="email"
            placeholder="Email"
            type="email"
            required
            autoComplete="email"
            startElement={<FiMail />}
            aria-invalid={!!state.error}
          />
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </div>
        <Button
          variant="solid"
          size="sm"
          type="submit"
          loading={isPending}
          disabled={isPending}
          className="w-full"
        >
          Продолжить
        </Button>
      </form>
    </div>
  )
}
