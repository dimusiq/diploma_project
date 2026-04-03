"use client"

import type * as React from "react"

import { cn } from "@/lib/utils.ts"

/**
 * Группа ввода (shadcn / AI Elements): общая рамка, фокус по контролу, аддоны по краям.
 */
function InputGroup({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="input-group"
      className={cn(
        "m-0 min-w-0 p-0",
        "group/input-group border-input bg-background dark:bg-input/30 relative flex w-full min-w-0 flex-col items-stretch overflow-hidden rounded-md border border-solid shadow-xs transition-[color,box-shadow] outline-none",
        "has-[>textarea]:h-auto",
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
        "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

type InputGroupAddonAlign =
  | "inline-start"
  | "inline-end"
  | "block-start"
  | "block-end"

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & {
  align?: InputGroupAddonAlign
}) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "text-muted-foreground flex select-none items-center text-sm font-medium",
        align === "block-start" &&
          "order-first w-full border-border border-b px-3 py-2",
        align === "block-end" &&
          cn(
            "order-last h-auto w-full cursor-default justify-between gap-2 border-border border-t px-3 pt-3 pb-3",
            "[.border-t]:pt-3",
          ),
        (align === "inline-start" || align === "inline-end") &&
          "border-border px-2",
        className,
      )}
      {...props}
    />
  )
}

/** Обёртка `display: contents`, чтобы textarea стала прямым участником раскладки `InputGroup`. */
function InputGroupTextareaWrap({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("contents min-h-0", className)} {...props} />
}

export { InputGroup, InputGroupAddon, InputGroupTextareaWrap }
