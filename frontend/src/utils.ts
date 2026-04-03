import { ApiError } from "./client/index.ts"
import useCustomToast from "./hooks/useCustomToast.ts"

/** Извлечь сообщение об ошибке из ApiError или unknown (для useActionState и т.д.) */
export function getApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: string | Array<{ msg?: string }> })
      ?.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
    return err.message
  }
  return err instanceof Error ? err.message : "Что-то пошло не так."
}

export const emailPattern = {
  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
  message: "Некорректный email",
}

export const namePattern = {
  value: /^[A-Za-z\s\u00C0-\u017F]{1,30}$/,
  message: "Некорректное имя",
}

export const passwordRules = (isRequired = true) => {
  const rules: any = {
    minLength: {
      value: 8,
      message: "Пароль должен содержать не менее 8 символов",
    },
  }

  if (isRequired) {
    rules.required = "Требуется пароль"
  }

  return rules
}

export const confirmPasswordRules = (
  getValues: () => any,
  isRequired = true,
) => {
  const rules: any = {
    validate: (value: string) => {
      const password = getValues().password || getValues().new_password
      return value === password ? true : "Пароль не совпадает"
    },
  }

  if (isRequired) {
    rules.required = "Требуется подтверждение пароля"
  }

  return rules
}

export const handleError = (err: ApiError) => {
  const { showErrorToast } = useCustomToast()
  const errDetail = (err.body as any)?.detail
  let errorMessage = errDetail || "Что-то пошло не так."
  if (Array.isArray(errDetail) && errDetail.length > 0) {
    errorMessage = errDetail[0].msg
  }
  showErrorToast(errorMessage)
}
