"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as React from "react"

import { CloseButton } from "@/components/ui/close-button.tsx"
import { cn } from "@/lib/utils.ts"

type DrawerSide = "left" | "right"

const DrawerSideContext = React.createContext<DrawerSide>("right")

export type DrawerRootProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Root>,
  "onOpenChange"
> & {
  onOpenChange?: (details: { open: boolean }) => void
  size?: string
  placement?: "start" | "end"
}

export function DrawerRoot({
  onOpenChange,
  size: _size,
  placement = "end",
  children,
  ...rest
}: DrawerRootProps) {
  const side: DrawerSide = placement === "start" ? "left" : "right"
  return (
    <DrawerSideContext.Provider value={side}>
      <DialogPrimitive.Root
        data-slot="drawer-root"
        onOpenChange={(open) => onOpenChange?.({ open })}
        {...rest}
      >
        {children}
      </DialogPrimitive.Root>
    </DrawerSideContext.Provider>
  )
}

/** Оставлен для совместимости: фон рисуется внутри `DrawerContent`. */
export function DrawerBackdrop(_props: { className?: string }) {
  return null
}

interface DrawerContentProps
  extends Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "ref"> {
  ref?: React.Ref<HTMLDivElement>
  portalled?: boolean
  portalRef?: React.RefObject<HTMLElement | null>
  offset?: string
}

export function DrawerContent({
  ref,
  children,
  portalled = true,
  portalRef,
  className,
  ...rest
}: DrawerContentProps) {
  const side = React.useContext(DrawerSideContext)
  const inner = (
    <>
      <DialogPrimitive.Overlay
        data-slot="drawer-backdrop"
        className="fixed inset-0 z-50 bg-black/40 duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 supports-backdrop-filter:backdrop-blur-xs"
      />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="drawer-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex h-full max-h-full w-full max-w-md flex-col gap-0 bg-popover p-0 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "right" &&
            "top-0 right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          side === "left" &&
            "top-0 left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
          className,
        )}
        {...rest}
      >
        {children}
      </DialogPrimitive.Content>
    </>
  )

  if (!portalled) {
    return inner
  }

  return (
    <DialogPrimitive.Portal container={portalRef?.current ?? undefined}>
      {inner}
    </DialogPrimitive.Portal>
  )
}

export function DrawerCloseTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return (
    <DialogPrimitive.Close data-slot="drawer-close-trigger" asChild {...props}>
      <CloseButton className="absolute top-2 right-2" />
    </DialogPrimitive.Close>
  )
}

export function DrawerHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-1 border-b border-border px-4 py-3 pr-12",
        className,
      )}
      {...props}
    />
  )
}

export function DrawerBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-3", className)}
      {...props}
    />
  )
}

export function DrawerFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto border-t border-border px-4 py-3", className)}
      {...props}
    />
  )
}

export function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-base font-medium leading-none text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export const DrawerTrigger = DialogPrimitive.Trigger
export const DrawerActionTrigger = DialogPrimitive.Close
