import { Container, Image, Input, Text } from "@chakra-ui/react"
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
import { Field } from "@/components/ui/field.tsx"
import { InputGroup } from "@/components/ui/input-group.tsx"
import { PasswordInput } from "@/components/ui/password-input.tsx"
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
    <Container
      h="100vh"
      maxW="sm"
      alignItems="stretch"
      justifyContent="center"
      gap={4}
      centerContent
    >
      <form
        action={formAction}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: "1rem",
          width: "100%",
        }}
      >
      <Image
        src="/images/nebardak-logo.svg"
        alt="Nebardak"
        height="auto"
        maxW="2xs"
        alignSelf="center"
        mb={4}
      />
      {state.error && (
        <Text fontSize="sm" color="red.500" role="alert">
          {state.error}
        </Text>
      )}
      <Field invalid={!!state.error} errorText={undefined}>
        <InputGroup w="100%" startElement={<FiMail />}>
          <Input
            id="username"
            name="username"
            placeholder="Email"
            type="email"
            required
            autoComplete="username"
            minLength={3}
          />
        </InputGroup>
      </Field>
      <PasswordInput
        name="password"
        type="password"
        startElement={<FiLock />}
        placeholder="Пароль"
        required
        autoComplete="current-password"
        errors={{}}
        minLength={MIN_PASSWORD_LENGTH}
      />
      <Checkbox inputProps={{ name: "remember", value: "on" }}>
        Запомнить меня
      </Checkbox>
      <RouterLink to="/recover-password" className="main-link">
        Забыли пароль?
      </RouterLink>
      <Button
        variant="solid"
        size="sm"
        type="submit"
        loading={isPending}
        disabled={isPending}
      >
        Войти
      </Button>
      <Text>
        Ещё нет аккаунта?{" "}
        <RouterLink to="/signup" className="main-link">
          Зарегистрируйтесь!
        </RouterLink>
      </Text>
      </form>
    </Container>
  )
}
