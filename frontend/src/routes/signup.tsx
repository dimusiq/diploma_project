import { Container, Flex, Image, Input, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useActionState, useEffect } from "react"
import { FiLock, FiUser } from "react-icons/fi"
import type { UserRegister } from "@/client/index.ts"
import { UsersService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Field } from "@/components/ui/field.tsx"
import { InputGroup } from "@/components/ui/input-group.tsx"
import { PasswordInput } from "@/components/ui/password-input.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import { getApiErrorMessage } from "@/utils.ts"
import Logo from "/images/nebardak-logo.svg"

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
    return { error: "Полное имя обязательно (не менее 3 символов)", success: false }
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
  const [state, formAction, isPending] = useActionState(signupAction, {
    error: null,
    success: false,
  } as SignupState)

  useEffect(() => {
    if (state.success) {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      navigate({ to: "/login" })
    }
  }, [state.success, queryClient, navigate])

  return (
    <Flex flexDir={{ base: "column", md: "row" }} justify="center" h="100vh">
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
          src={Logo}
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
        <Field>
          <InputGroup w="100%" startElement={<FiUser />}>
            <Input
              id="full_name"
              name="full_name"
              placeholder="Полное имя"
              type="text"
              required
              minLength={3}
              autoComplete="name"
            />
          </InputGroup>
        </Field>
        <Field>
          <InputGroup w="100%" startElement={<FiUser />}>
            <Input
              id="email"
              name="email"
              placeholder="Email"
              type="email"
              required
              autoComplete="email"
            />
          </InputGroup>
        </Field>
        <PasswordInput
          name="password"
          type="password"
          startElement={<FiLock />}
          placeholder="Пароль"
          required
          minLength={8}
          errors={{}}
        />
        <PasswordInput
          name="confirm_password"
          type="confirm_password"
          startElement={<FiLock />}
          placeholder="Подтвердите пароль"
          required
          errors={{}}
        />
        <Button variant="solid" size="sm" type="submit" loading={isPending}>
          Зарегистрироваться
        </Button>
        <Text>
          Уже есть аккаунт?{" "}
          <RouterLink to="/login" className="main-link">
            Войти
          </RouterLink>
        </Text>
        </form>
      </Container>
    </Flex>
  )
}

export default SignUp
