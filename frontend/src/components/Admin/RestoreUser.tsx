import { Button } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FiRefreshCw } from "react-icons/fi"

import { UsersService } from "@/client/index.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"

const RestoreUser = ({ id }: { id: string }) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: () => UsersService.restoreUser({ userId: id }),
    onSuccess: () => {
      showSuccessToast("Пользователь восстановлен")
    },
    onError: () => {
      showErrorToast("Не удалось восстановить пользователя")
    },
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  return (
    <Button
      variant="ghost"
      size="sm"
      colorPalette="green"
      onClick={() => mutation.mutate()}
      loading={mutation.isPending}
      gap={2}
    >
      <FiRefreshCw />
      Восстановить
    </Button>
  )
}

export default RestoreUser
