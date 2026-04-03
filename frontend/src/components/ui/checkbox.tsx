import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"
import type * as React from "react"
import { useId } from "react"

import { cn } from "@/lib/utils"

type LegacyChecked = boolean | "indeterminate"

export type CheckboxProps = Omit<
  CheckboxPrimitive.Root.Props,
  "checked" | "onCheckedChange" | "id"
> & {
  id?: string
  /** Chakra-совместимость: строка для промежуточного состояния «выбрать все» */
  checked?: LegacyChecked
  onCheckedChange?: (checked: boolean, eventDetails?: unknown) => void
  children?: React.ReactNode
  /** Старый API логина: проброс name/value на нативный input Base UI */
  inputProps?: { name?: string; value?: string }
  className?: string
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
  const indeterminate = checkedProp === "indeterminate"
  const checkedBool =
    checkedProp === "indeterminate" ? false : Boolean(checkedProp)

  const name = nameProp ?? inputProps?.name
  const value = valueProp ?? inputProps?.value

  const root = (
    <CheckboxPrimitive.Root
      id={controlId}
      data-slot="checkbox"
      checked={checkedBool}
      indeterminate={indeterminate}
      onCheckedChange={onCheckedChange}
      name={name}
      value={value}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
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
