import type * as React from "react"
import { forwardRef } from "react"

import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<"input">

export const InputWithIcon = forwardRef<
  HTMLInputElement,
  Omit<InputProps, "className"> & {
    startElement?: React.ReactNode
    endElement?: React.ReactNode
    className?: string
    inputClassName?: string
  }
>(function InputWithIcon(
  { startElement, endElement, className, inputClassName, ...inputProps },
  ref,
) {
  return (
    <div className={cn("relative w-full", className)}>
      {startElement ? (
        <span className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {startElement}
        </span>
      ) : null}
      <input
        ref={ref}
        {...inputProps}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-2.5 pl-2.5 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          startElement && "pl-9",
          endElement && "pr-10",
          inputClassName,
        )}
      />
      {endElement ? (
        <span className="absolute top-1/2 right-1.5 z-10 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {endElement}
        </span>
      ) : null}
    </div>
  )
})
