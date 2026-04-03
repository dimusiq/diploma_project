"use client"

import type { VariantProps } from "class-variance-authority"
import * as React from "react"

import { buttonVariants } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"

export type LinkButtonProps = React.ComponentProps<"a"> &
  VariantProps<typeof buttonVariants>

export const LinkButton = React.forwardRef<HTMLAnchorElement, LinkButtonProps>(
  function LinkButton({ className, variant, size, ...props }, ref) {
    return (
      <a
        ref={ref}
        className={cn(buttonVariants({ variant: variant ?? "default", size }), className)}
        {...props}
      />
    )
  },
)
