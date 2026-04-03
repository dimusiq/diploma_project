import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FiRefreshCw } from "react-icons/fi"

import { UsersService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
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
      className="gap-2 text-green-600 hover:text-green-700 dark:text-green-500"
      onClick={() => mutation.mutate()}
      loading={mutation.isPending}
    >
      <FiRefreshCw />
      Восстановить
    </Button>
  )
}

export default RestoreUser
