import {
  createFileRoute,
  Link as RouterLink,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useActionState, useEffect } from "react"
import { FiLock, FiMail } from "react-icons/fi"

import { LoginService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { InputWithIcon } from "@/components/ui/input-with-icon.tsx"
import { Label } from "@/components/ui/label.tsx"
import { PasswordField } from "@/components/ui/password-field.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import { setAccessToken } from "@/lib/authStorage.ts"
import { getApiErrorMessage } from "@/utils.ts"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

type LoginState = { error: string | null; success: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = (formData.get("username") as string)?.trim()
  const password = formData.get("password") as string
  const remember = formData.get("remember") === "on"
  if (!username || !password) {
    return { error: "Заполните email и пароль", success: false }
  }
  if (!EMAIL_RE.test(username)) {
    return { error: "Введите корректный email", success: false }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Пароль должен быть не менее ${MIN_PASSWORD_LENGTH} символов`,
      success: false,
    }
  }
  try {
    const response = await LoginService.loginAccessToken({
      formData: { username, password },
    })
    setAccessToken(response.access_token, remember)
    return { error: null, success: true }
  } catch (err) {
    return { error: getApiErrorMessage(err), success: false }
  }
}

function Login() {
  const navigate = useNavigate()
  const [state, formAction, isPending] = useActionState(loginAction, {
    error: null,
    success: false,
  } as LoginState)

  useEffect(() => {
    if (state.success) {
      navigate({ to: "/" })
    }
  }, [state.success, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
        <img
          src="/images/nebardak-logo.svg"
          alt="Nebardak"
          className="mx-auto mb-4 h-auto w-full max-w-[12rem]"
        />
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="username">Email</Label>
          <InputWithIcon
            id="username"
            name="username"
            placeholder="Email"
            type="email"
            required
            autoComplete="username"
            minLength={3}
            startElement={<FiMail />}
            aria-invalid={!!state.error}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <PasswordField
            id="password"
            name="password"
            placeholder="Пароль"
            required
            autoComplete="current-password"
            minLength={MIN_PASSWORD_LENGTH}
            startElement={<FiLock />}
            aria-invalid={!!state.error}
          />
        </div>
        <Checkbox name="remember" value="on" className="self-start">
          Запомнить меня
        </Checkbox>
        <RouterLink to="/recover-password" className="main-link text-sm">
          Забыли пароль?
        </RouterLink>
        <Button
          variant="solid"
          size="sm"
          type="submit"
          loading={isPending}
          disabled={isPending}
          className="w-full"
        >
          Войти
        </Button>
        <p className="text-sm text-muted-foreground">
          Ещё нет аккаунта?{" "}
          <RouterLink to="/signup" className="main-link">
            Зарегистрируйтесь!
          </RouterLink>
        </p>
      </form>
    </div>
  )
}
