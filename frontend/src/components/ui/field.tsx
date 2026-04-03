import type * as React from "react"

import { Label } from "@/components/ui/label.tsx"
import { cn } from "@/lib/utils.ts"

export interface FieldProps extends React.ComponentProps<"div"> {
  label?: React.ReactNode
  helperText?: React.ReactNode
  errorText?: React.ReactNode
  optionalText?: React.ReactNode
  required?: boolean
  invalid?: boolean
  disabled?: boolean
}

export function Field({
  ref,
  label,
  children,
  helperText,
  errorText,
  optionalText,
  required,
  invalid,
  disabled,
  className,
  ...rest
}: FieldProps & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-invalid={invalid ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "group/field flex w-full flex-col gap-2",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      {...rest}
    >
      {label != null && label !== false && (
        <Label className="flex w-full flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <span>{label}</span>
          {required ? (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          ) : optionalText ? (
            <span className="text-muted-foreground font-normal text-xs">
              {optionalText}
            </span>
          ) : null}
        </Label>
      )}
      {children}
      {helperText ? (
        <p className="text-muted-foreground text-xs">{helperText}</p>
      ) : null}
      {errorText ? (
        <p className="text-destructive text-xs" role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  )
}
