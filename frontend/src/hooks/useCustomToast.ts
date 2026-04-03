"use client"

import { toast } from "sonner"

const useCustomToast = () => {
  const showSuccessToast = (description: string) => {
    toast.success("Успешно!", { description })
  }

  const showErrorToast = (description: string) => {
    toast.error("Что-то пошло не так!", { description })
  }

  return { showSuccessToast, showErrorToast }
}

export default useCustomToast
