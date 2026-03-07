import { Button, ButtonGroup, Text } from "@chakra-ui/react"
import {
  DialogActionTrigger,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx"

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  isLoading?: boolean
  /** "danger" для удаления (красная кнопка), иначе обычная */
  variant?: "danger" | "default"
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  onConfirm,
  isLoading = false,
  variant = "default",
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      size={{ base: "xs", md: "sm" }}
      placement="center"
      role="alertdialog"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text color="fg.muted">{description}</Text>
        </DialogBody>
        <DialogFooter>
          <ButtonGroup>
            <DialogActionTrigger asChild>
              <Button variant="outline" size="sm" disabled={isLoading}>
                {cancelLabel}
              </Button>
            </DialogActionTrigger>
            <Button
              variant="solid"
              size="sm"
              colorPalette={variant === "danger" ? "red" : "blue"}
              onClick={handleConfirm}
              loading={isLoading}
            >
              {confirmLabel}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}
