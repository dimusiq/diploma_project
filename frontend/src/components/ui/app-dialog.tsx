"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import type * as React from "react"
import { createContext, useContext } from "react"

import { cn } from "@/lib/utils.ts"
import { CloseButton } from "./close-button.tsx"

/** Props passed from DialogRoot to size/role the popup (Chakra-compatible). */
type DialogLayoutValue = {
  size?: DialogRootCompatProps["size"]
  role?: React.AriaRole
}

const DialogLayoutContext = createContext<DialogLayoutValue>({})

function useDialogLayout() {
  return useContext(DialogLayoutContext)
}

const SIZE_MAP: Record<string, string> = {
  xs: "max-w-xs",
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  full: "max-w-[calc(100%-2rem)]",
}

function sizeToMaxWidthClass(
  size: DialogRootCompatProps["size"],
): string | undefined {
  if (!size) return "sm:max-w-lg"
  if (typeof size === "string") {
    return cn("w-full", SIZE_MAP[size] ?? "sm:max-w-lg")
  }
  const r = size as { base?: string; sm?: string; md?: string; lg?: string }
  return cn(
    "w-full",
    r.base && SIZE_MAP[r.base],
    r.sm && `sm:${SIZE_MAP[r.sm]}`,
    r.md && `md:${SIZE_MAP[r.md]}`,
    r.lg && `lg:${SIZE_MAP[r.lg]}`,
  )
}

export type DialogRootCompatProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Root>,
  "onOpenChange"
> & {
  /** Chakra-style handler */
  onOpenChange?: (details: { open: boolean }) => void
  size?: string | { base?: string; sm?: string; md?: string; lg?: string }
  placement?: string
  role?: React.AriaRole
}

export function DialogRoot({
  onOpenChange,
  size,
  placement: _placement,
  role,
  children,
  ...rest
}: DialogRootCompatProps) {
  return (
    <DialogLayoutContext.Provider value={{ size, role }}>
      <DialogPrimitive.Root
        data-slot="chakra-compat-dialog-root"
        onOpenChange={(open) => onOpenChange?.({ open })}
        {...rest}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogLayoutContext.Provider>
  )
}

interface DialogContentProps
  extends Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "ref"> {
  ref?: React.Ref<HTMLDivElement>
  portalled?: boolean
  portalRef?: React.RefObject<HTMLElement | null>
  backdrop?: boolean
}

export function DialogContent({
  ref,
  children,
  portalled = true,
  portalRef,
  backdrop = true,
  className,
  ...rest
}: DialogContentProps) {
  const { size, role } = useDialogLayout()
  const maxW = sizeToMaxWidthClass(size)
  const popupRole = (role ?? "dialog") as React.AriaRole

  const popup = (
    <>
      {backdrop && (
        <DialogPrimitive.Overlay
          data-slot="chakra-compat-dialog-backdrop"
          className={cn(
            "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
      )}
      <DialogPrimitive.Content
        ref={ref}
        data-slot="chakra-compat-dialog-content"
        role={popupRole}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[min(90vh,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          maxW,
          className,
        )}
        {...rest}
      >
        {children}
      </DialogPrimitive.Content>
    </>
  )

  if (!portalled) {
    return popup
  }

  return (
    <DialogPrimitive.Portal container={portalRef?.current ?? undefined}>
      {popup}
    </DialogPrimitive.Portal>
  )
}

export function DialogCloseTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close data-slot="chakra-compat-dialog-close-trigger" asChild {...props}>
      <CloseButton className={cn("absolute top-2 right-2", className)}>
        {children}
      </CloseButton>
    </DialogPrimitive.Close>
  )
}

export function DialogFooter({
  className,
  gap,
  ...props
}: React.ComponentProps<"div"> & { gap?: number }) {
  const gapClass =
    gap === 2
      ? "gap-2"
      : gap === 3
        ? "gap-3"
        : gap === 4
          ? "gap-4"
          : gap != null
            ? "gap-2"
            : "gap-2"
  return (
    <div
      data-slot="chakra-compat-dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-row flex-wrap items-center justify-end border-t border-border bg-muted/30 px-4 py-3 sm:justify-end",
        gapClass,
        className,
      )}
      {...props}
    />
  )
}

export function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chakra-compat-dialog-header"
      className={cn("flex flex-col gap-2 pr-8", className)}
      {...props}
    />
  )
}

export function DialogBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chakra-compat-dialog-body"
      className={cn("min-h-0 flex-1", className)}
      {...props}
    />
  )
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export function DialogBackdrop(
  props: React.ComponentProps<typeof DialogPrimitive.Overlay>,
) {
  return (
    <DialogPrimitive.Overlay
      data-slot="chakra-compat-dialog-backdrop-only"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
        props.className,
      )}
      {...props}
    />
  )
}

export function DialogTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger> & {
  asChild?: boolean
}) {
  return (
    <DialogPrimitive.Trigger
      data-slot="chakra-compat-dialog-trigger"
      asChild={asChild}
      {...props}
    >
      {children}
    </DialogPrimitive.Trigger>
  )
}

export function DialogActionTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close> & {
  asChild?: boolean
}) {
  return (
    <DialogPrimitive.Close
      data-slot="chakra-compat-dialog-action-trigger"
      asChild={asChild}
      {...props}
    >
      {children}
    </DialogPrimitive.Close>
  )
}
