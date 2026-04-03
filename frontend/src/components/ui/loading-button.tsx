import { Slot, Slottable } from "@radix-ui/react-slot"
import type { VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import type * as React from "react"

import { buttonVariants } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils"

export interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

function LoadingButton({
  className,
  loading = false,
  children,
  disabled,
  variant,
  size,
  asChild = false,
  ...props
}: LoadingButtonProps) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? (
        <Loader2Icon className="mr-2 size-5 shrink-0 animate-spin" />
      ) : null}
      <Slottable>{children}</Slottable>
    </Comp>
  )
}

export { LoadingButton }
