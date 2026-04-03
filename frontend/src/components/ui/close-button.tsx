import { LuX } from "react-icons/lu"
import type { ButtonProps } from "@/components/ui/button.tsx"
import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"

export type CloseButtonProps = ButtonProps

export function CloseButton({ className, children, ...props }: CloseButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Закрыть"
      className={cn(className)}
      {...props}
    >
      {children ?? <LuX className="size-4" />}
    </Button>
  )
}
