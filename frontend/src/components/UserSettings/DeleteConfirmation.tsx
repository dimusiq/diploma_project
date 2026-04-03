import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { type ApiError, UsersService } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import useAuth from "@/hooks/useAuth.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { handleError } from "@/utils.ts"

const DeleteConfirmation = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm()
  const { logout } = useAuth()

  const mutation = useMutation({
    mutationFn: () => UsersService.deleteUserMe(),
    onSuccess: () => {
      showSuccessToast("Your account has been successfully deleted")
      setIsOpen(false)
      logout()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })

  const onSubmit = async () => {
    mutation.mutate()
  }

  return (
    <>
      <Button
        variant="outlineDestructive"
        size="sm"
        className="mt-4"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Delete
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Confirmation Required</DialogTitle>
              <DialogDescription>
                All your account data will be{" "}
                <strong>permanently deleted.</strong> If you are sure, please
                click <strong>&quot;Confirm&quot;</strong> to proceed. This
                action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="outlineDestructive"
                size="sm"
                type="submit"
                loading={isSubmitting}
              >
                Delete
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default DeleteConfirmation
