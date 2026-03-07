import { Container, Heading, Text } from "@chakra-ui/react"
import {
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useActionState, useEffect } from "react"
import { FiLock } from "react-icons/fi"

import { LoginService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { PasswordInput } from "@/components/ui/password-input.tsx"
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
  const [state, formAction, isPending] = useActionState(resetPasswordAction, {
    error: null,
    success: false,
  } as ResetState)

  useEffect(() => {
    if (state.success) {
      showSuccessToast("Пароль успешно изменен.")
      navigate({ to: "/login" })
    }
  }, [state.success, showSuccessToast, navigate])

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
      <Heading size="xl" color="ui.main" textAlign="center" mb={2}>
        Сброс пароля
      </Heading>
      <Text textAlign="center">
        Пожалуйста, введите новый пароль для вашей учетной записи.
      </Text>
      {state.error && (
        <Text fontSize="sm" color="red.500" role="alert">
          {state.error}
        </Text>
      )}
      <PasswordInput
        name="new_password"
        type="new_password"
        startElement={<FiLock />}
        placeholder="Новый пароль"
        required
        minLength={8}
        autoComplete="new-password"
        errors={{}}
      />
      <PasswordInput
        name="confirm_password"
        type="confirm_password"
        startElement={<FiLock />}
        placeholder="Подтвердите пароль"
        required
        autoComplete="new-password"
        errors={{}}
      />
      <Button variant="solid" size="sm" type="submit" loading={isPending}>
        Сбросить пароль
      </Button>
      </form>
    </Container>
  )
}
