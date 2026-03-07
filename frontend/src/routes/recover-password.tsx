import { Container, Heading, Input, Text } from "@chakra-ui/react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useActionState, useEffect } from "react"
import { FiMail } from "react-icons/fi"

import { LoginService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import { Field } from "@/components/ui/field.tsx"
import { InputGroup } from "@/components/ui/input-group.tsx"
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
        Восстановление пароля
      </Heading>
      <Text textAlign="center">
        Пароль будет отправлен на указанный вами email.
      </Text>
      <Field invalid={!!state.error} errorText={state.error ?? undefined}>
        <InputGroup w="100%" startElement={<FiMail />}>
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
      <Button variant="solid" size="sm" type="submit" loading={isPending}>
        Продолжить
      </Button>
      </form>
    </Container>
  )
}
