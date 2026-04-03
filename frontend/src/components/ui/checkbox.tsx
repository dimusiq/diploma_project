"use client"

import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"
import type * as React from "react"
import { useId } from "react"

import { cn } from "@/lib/utils"

type LegacyChecked = boolean | "indeterminate"

export type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "checked" | "onCheckedChange"
> & {
  id?: string
  checked?: LegacyChecked
  onCheckedChange?: (checked: boolean, eventDetails?: unknown) => void
  children?: React.ReactNode
  inputProps?: { name?: string; value?: string }
  name?: string
  value?: string
}

function Checkbox({
  className,
  checked: checkedProp,
  onCheckedChange,
  children,
  inputProps,
  name: nameProp,
  value: valueProp,
  id: idProp,
  ...rest
}: CheckboxProps) {
  const autoId = useId()
  const controlId = idProp ?? `cb-${autoId}`
  const checked: boolean | "indeterminate" =
    checkedProp === "indeterminate" ? "indeterminate" : Boolean(checkedProp)

  const name = nameProp ?? inputProps?.name
  const value = valueProp ?? inputProps?.value

  const root = (
    <CheckboxPrimitive.Root
      id={controlId}
      data-slot="checkbox"
      checked={checked}
      onCheckedChange={(state) => {
        onCheckedChange?.(state === true)
      }}
      name={name}
      value={value}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary",
        className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (children) {
    return (
      <label
        htmlFor={controlId}
        className="flex cursor-pointer items-start gap-2"
      >
        {root}
        <span className="min-w-0 flex-1 text-sm leading-tight">{children}</span>
      </label>
    )
  }

  return root
}

export { Checkbox }
