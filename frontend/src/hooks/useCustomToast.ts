"use client"

import { toaster } from "@/components/ui/toaster"

const useCustomToast = () => {
  const showSuccessToast = (description: string) => {
    toaster.create({
      title: "Успешно!",
      description,
      type: "success",
    })
  }

  const showErrorToast = (description: string) => {
    toaster.create({
      title: "Что-то пошло не так!",
      description,
      type: "error",
    })
  }

  return { showSuccessToast, showErrorToast }
}

export default useCustomToast
