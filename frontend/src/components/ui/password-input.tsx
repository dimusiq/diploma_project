"use client"

import type * as React from "react"
import { forwardRef } from "react"

import { PasswordField } from "@/components/ui/password-field.tsx"
import { cn } from "@/lib/utils"

export interface PasswordInputProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "type"> {
  /** Ключ в `errors` (если не задан — из `name` или legacy `type`) */
  errorKey?: string
  errors?: Record<string, { message?: string } | undefined>
  startElement?: React.ReactNode
  /** @deprecated ключ для `errors`; предпочтительно `name` + `errorKey` */
  type?: string
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      errorKey,
      errors,
      startElement,
      type: legacyType,
      name,
      className,
      ...rest
    },
    ref,
  ) {
    const fieldName = String(name ?? "")
    const errKey = errorKey ?? legacyType ?? fieldName
    const err = errors?.[errKey]

    return (
      <div className={cn("w-full space-y-1.5", className)}>
        {err?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {err.message}
          </p>
        ) : null}
        <PasswordField
          ref={ref}
          name={name}
          startElement={startElement}
          {...rest}
        />
      </div>
    )
  },
)

export function PasswordStrengthMeter({
  max = 4,
  value,
  className,
}: {
  max?: number
  value: number
  className?: string
}) {
  const percent = (value / max) * 100
  const { label, barClass } = strengthSegment(percent)
  return (
    <div className={cn("flex w-full flex-col items-end gap-1", className)}>
      <div className="flex w-full gap-0.5">
        {Array.from({ length: max }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-1 flex-1 rounded-sm bg-muted",
              index < value && barClass,
            )}
          />
        ))}
      </div>
      {label ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : null}
    </div>
  )
}

function strengthSegment(percent: number) {
  if (percent < 33) return { label: "Low", barClass: "bg-red-500" }
  if (percent < 66) return { label: "Medium", barClass: "bg-orange-500" }
  return { label: "High", barClass: "bg-green-500" }
}
