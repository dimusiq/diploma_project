"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import * as React from "react"

import { cn } from "@/lib/utils.ts"

export type MenuRootProps = Omit<
  MenuPrimitive.Root.Props,
  "onOpenChange"
> & {
  onOpenChange?: (details: { open: boolean }) => void
}

export function MenuRoot({ onOpenChange, ...rest }: MenuRootProps) {
  return (
    <MenuPrimitive.Root
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
}: MenuPrimitive.Trigger.Props & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return (
      <MenuPrimitive.Trigger
        data-slot="menu-trigger"
        nativeButton={false}
        render={children as React.ReactElement<Record<string, unknown>>}
        {...props}
      />
    )
  }
  return (
    <MenuPrimitive.Trigger data-slot="menu-trigger" {...props}>
      {children}
    </MenuPrimitive.Trigger>
  )
}

interface MenuContentProps extends Omit<MenuPrimitive.Popup.Props, "ref"> {
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
  ...rest
}: MenuContentProps) {
  const inner = (
    <MenuPrimitive.Positioner
      className="isolate z-50 outline-none"
      side="bottom"
      align="start"
      sideOffset={4}
    >
      <MenuPrimitive.Popup
        ref={ref}
        data-slot="menu-content"
        className={cn(
          "max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...rest}
      >
        {children}
      </MenuPrimitive.Popup>
    </MenuPrimitive.Positioner>
  )

  if (!portalled) {
    return inner
  }

  return (
    <MenuPrimitive.Portal container={portalRef ?? undefined}>
      {inner}
    </MenuPrimitive.Portal>
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
}: MenuPrimitive.Item.Props & ChakraMenuItemLegacy) {
  return (
    <MenuPrimitive.Item
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
