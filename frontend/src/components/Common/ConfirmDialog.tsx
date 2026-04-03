import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
  /** "danger" для удаления, иначе основная кнопка */
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "outlineDestructive" : "default"}
            size="sm"
            type="button"
            loading={isLoading}
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
