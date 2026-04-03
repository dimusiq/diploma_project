"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import * as React from "react"

import { CloseButton } from "@/components/ui/close-button.tsx"
import { cn } from "@/lib/utils.ts"

type Placement = `${"top" | "bottom" | "left" | "right"}-${"start" | "end"}` | "top" | "bottom" | "left" | "right"

function mapPlacement(placement?: string): {
  side: React.ComponentProps<typeof PopoverPrimitive.Positioner>["side"]
  align: React.ComponentProps<typeof PopoverPrimitive.Positioner>["align"]
} {
  if (!placement) return { side: "bottom", align: "center" }
  const [sideRaw, alignRaw] = placement.split("-") as [string, string | undefined]
  const side = (["top", "bottom", "left", "right"].includes(sideRaw)
    ? sideRaw
    : "bottom") as "top" | "bottom" | "left" | "right"
  let align: React.ComponentProps<typeof PopoverPrimitive.Positioner>["align"] =
    "center"
  if (alignRaw === "start") align = "start"
  else if (alignRaw === "end") align = "end"
  return { side, align }
}

type PositioningConfig = {
  getAnchorElement?: () => HTMLElement | null
  placement?: Placement
  gutter?: number
  flip?: boolean
  slide?: boolean
  fitViewport?: boolean
}

const PopoverPositioningContext = React.createContext<PositioningConfig | null>(
  null,
)

export type PopoverRootProps = Omit<
  PopoverPrimitive.Root.Props,
  "onOpenChange"
> & {
  onOpenChange?: (details: { open: boolean }) => void
  size?: string
  positioning?: PositioningConfig
}

export function PopoverRoot({
  onOpenChange,
  size: _size,
  positioning,
  children,
  ...rest
}: PopoverRootProps) {
  return (
    <PopoverPositioningContext.Provider value={positioning ?? null}>
      <PopoverPrimitive.Root
        data-slot="popover-root"
        onOpenChange={(open) => onOpenChange?.({ open })}
        {...rest}
      >
        {children}
      </PopoverPrimitive.Root>
    </PopoverPositioningContext.Provider>
  )
}

interface PopoverContentProps extends Omit<PopoverPrimitive.Popup.Props, "ref"> {
  ref?: React.Ref<HTMLDivElement>
  portalled?: boolean
  portalRef?: React.RefObject<HTMLElement | null>
  maxW?: string
  minW?: string
}

export function PopoverContent({
  ref,
  children,
  portalled = true,
  portalRef,
  className,
  maxW,
  minW,
  style,
  ...rest
}: PopoverContentProps) {
  const positioning = React.useContext(PopoverPositioningContext)
  const { side, align } = mapPlacement(positioning?.placement)
  const anchor = positioning?.getAnchorElement
    ? () => positioning.getAnchorElement?.() ?? null
    : undefined
  const sideOffset = positioning?.gutter ?? 8

  const popup = (
    <PopoverPrimitive.Positioner
      className="isolate z-50 outline-none"
      anchor={anchor}
      side={side}
      align={align}
      sideOffset={sideOffset}
    >
      <PopoverPrimitive.Popup
        ref={ref}
        data-slot="popover-content"
        className={cn(
          "max-h-(--available-height) origin-(--transform-origin) rounded-xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          !maxW && !minW && "w-[min(92dvw,26rem)] min-w-[18rem]",
          className,
        )}
        style={{
          ...(maxW ? { maxWidth: maxW } : {}),
          ...(minW ? { minWidth: minW } : {}),
          ...(style as React.CSSProperties),
        }}
        {...rest}
      >
        {children}
      </PopoverPrimitive.Popup>
    </PopoverPrimitive.Positioner>
  )

  if (!portalled) {
    return popup
  }

  return (
    <PopoverPrimitive.Portal container={portalRef ?? undefined}>
      {popup}
    </PopoverPrimitive.Portal>
  )
}

export function PopoverCloseTrigger({
  className,
  ...props
}: PopoverPrimitive.Close.Props) {
  return (
    <PopoverPrimitive.Close
      data-slot="popover-close-trigger"
      render={
        <CloseButton className={cn("absolute top-2 right-2", className)} />
      }
      {...props}
    >
      <span className="sr-only">Закрыть</span>
    </PopoverPrimitive.Close>
  )
}

export function PopoverHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("mb-2 flex flex-col gap-1 pr-8", className)}
      {...props}
    />
  )
}

export function PopoverBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-slot="popover-body" className={cn("min-h-0", className)} {...props} />
  )
}

export function PopoverFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-footer"
      className={cn("mt-4 flex flex-row flex-wrap justify-end gap-2", className)}
      {...props}
    />
  )
}

export function PopoverTitle({
  className,
  ...props
}: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn(
        "font-heading text-base font-medium leading-none text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export const PopoverDescription = PopoverPrimitive.Description
export const PopoverTrigger = PopoverPrimitive.Trigger
