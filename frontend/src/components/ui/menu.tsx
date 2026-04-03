"use client"

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import type * as React from "react"

import { cn } from "@/lib/utils.ts"

export type MenuRootProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
  "onOpenChange"
> & {
  onOpenChange?: (details: { open: boolean }) => void
}

export function MenuRoot({ onOpenChange, ...rest }: MenuRootProps) {
  return (
    <DropdownMenuPrimitive.Root
      data-slot="menu-root"
      onOpenChange={(open) => onOpenChange?.({ open })}
      {...rest}
    />
  )
}

export function MenuTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger> & {
  asChild?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="menu-trigger"
      asChild={asChild}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Trigger>
  )
}

interface MenuContentProps
  extends Omit<
    React.ComponentProps<typeof DropdownMenuPrimitive.Content>,
    "ref"
  > {
  ref?: React.Ref<HTMLDivElement>
  portalled?: boolean
  portalRef?: React.RefObject<HTMLElement | null>
  /** legacy spacing (игнорируется в пользу className) */
  minW?: string
  bg?: string
  color?: string
  borderWidth?: string
  borderColor?: string
  boxShadow?: string
}

export function MenuContent({
  ref,
  portalled = true,
  portalRef,
  className,
  children,
  minW: _minW,
  bg: _bg,
  color: _color,
  borderWidth: _bw,
  borderColor: _bc,
  boxShadow: _bs,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  ...rest
}: MenuContentProps) {
  const content = (
    <DropdownMenuPrimitive.Content
      ref={ref}
      data-slot="menu-content"
      side={side}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-h-[var(--radix-popper-available-height)] min-w-32 origin-[var(--radix-popper-transform-origin)] overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        className,
      )}
      {...rest}
    >
      {children}
    </DropdownMenuPrimitive.Content>
  )

  if (!portalled) {
    return content
  }

  return (
    <DropdownMenuPrimitive.Portal container={portalRef?.current ?? undefined}>
      {content}
    </DropdownMenuPrimitive.Portal>
  )
}

type ChakraMenuItemLegacy = {
  value?: string
  gap?: number
  py?: number
  px?: number
  color?: string
  opacity?: number
  cursor?: string
}

export function MenuItem({
  className,
  value: _value,
  gap,
  py,
  px,
  color: _color,
  opacity,
  cursor: _cursor,
  ...rest
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> &
  ChakraMenuItemLegacy) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "flex cursor-default items-center rounded-md text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        gap === 2 && "gap-2",
        gap === 3 && "gap-3",
        py === 2 && "py-2",
        px === 2 && "px-2",
        className,
      )}
      style={opacity != null ? { opacity: Number(opacity) } : undefined}
      {...rest}
    />
  )
}
