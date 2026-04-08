import { useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FiLock, FiUser } from "react-icons/fi"
import type { UserRegister } from "@/client/index.ts"
import { UsersService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { InputWithIcon } from "@/components/ui/input-with-icon.tsx"
import { Label } from "@/components/ui/label.tsx"
import { PasswordField } from "@/components/ui/password-field.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import { getApiErrorMessage } from "@/utils.ts"

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

export const Route = createFileRoute("/signup")({
  component: SignUp,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

type SignupState = { error: string | null; success: boolean }

async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const full_name = (formData.get("full_name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim()
  const password = formData.get("password") as string
  const confirm_password = formData.get("confirm_password") as string

  if (!full_name || full_name.length < 3) {
    return {
      error: "Полное имя обязательно (не менее 3 символов)",
      success: false,
    }
  }
  if (!email) {
    return { error: "Email обязателен", success: false }
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Некорректный email", success: false }
  }
  if (!password || password.length < 8) {
    return {
      error: "Пароль должен содержать не менее 8 символов",
      success: false,
    }
  }
  if (password !== confirm_password) {
    return { error: "Пароль не совпадает", success: false }
  }

  try {
    await UsersService.registerUser({
      requestBody: { full_name, email, password } as UserRegister,
    })
    return { error: null, success: true }
  } catch (err) {
    return { error: getApiErrorMessage(err), success: false }
  }
}

function SignUp() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [state, setState] = useState<SignupState>({
    error: null,
    success: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  useEffect(() => {
    if (state.success) {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      navigate({ to: "/login" })
    }
  }, [state.success, queryClient, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 md:flex-row md:justify-center">
      <form
        noValidate
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (isSubmitting) return
          const fd = new FormData(e.currentTarget)
          const password = String(fd.get("password") ?? "")
          if (password.length > 0 && password.length < 8) {
            setState({
              error: "Пароль должен содержать не менее 8 символов",
              success: false,
            })
            return
          }
          setIsSubmitting(true)
          try {
            const next = await signupAction({ error: null, success: false }, fd)
            setState(next)
          } finally {
            setIsSubmitting(false)
          }
        }}
      >
        <img
          src="/images/sklad-logo.svg"
          alt="Склад"
          className="mx-auto mb-4 h-auto w-full max-w-[12rem]"
        />
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="full_name">Полное имя</Label>
          <InputWithIcon
            id="full_name"
            name="full_name"
            placeholder="Полное имя"
            type="text"
            autoComplete="name"
            startElement={<FiUser />}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <InputWithIcon
            id="email"
            name="email"
            placeholder="Email"
            type="email"
            autoComplete="email"
            startElement={<FiUser />}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <PasswordField
            id="password"
            name="password"
            placeholder="Пароль"
            autoComplete="off"
            startElement={<FiLock />}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm_password">Подтвердите пароль</Label>
          <PasswordField
            id="confirm_password"
            name="confirm_password"
            placeholder="Подтвердите пароль"
            autoComplete="off"
            startElement={<FiLock />}
          />
        </div>
        <Button type="submit" variant="default" size="default" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Регистрация…" : "Зарегистрироваться"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Button variant="link" asChild className="inline h-auto p-0 font-normal">
            <RouterLink to="/login">Войти</RouterLink>
          </Button>
        </p>
      </form>
    </div>
  )
}

export default SignUp
