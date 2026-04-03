"use client"

import * as PopoverPrimitive from "@radix-ui/react-popover"
import type { Measurable } from "@radix-ui/rect"
import * as React from "react"

import { CloseButton } from "@/components/ui/close-button.tsx"
import { cn } from "@/lib/utils.ts"

type Placement =
  | `${"top" | "bottom" | "left" | "right"}-${"start" | "end"}`
  | "top"
  | "bottom"
  | "left"
  | "right"

function mapPlacement(placement?: string): {
  side: "top" | "bottom" | "left" | "right"
  align: "start" | "center" | "end"
} {
  if (!placement) return { side: "bottom", align: "center" }
  const [sideRaw, alignRaw] = placement.split("-") as [
    string,
    string | undefined,
  ]
  const side = (
    ["top", "bottom", "left", "right"].includes(sideRaw) ? sideRaw : "bottom"
  ) as "top" | "bottom" | "left" | "right"
  let align: "start" | "center" | "end" = "center"
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
  React.ComponentProps<typeof PopoverPrimitive.Root>,
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
  const anchorGetterRef = React.useRef(positioning?.getAnchorElement)
  anchorGetterRef.current = positioning?.getAnchorElement

  const virtualMeasurable = React.useMemo(
    () =>
      ({
        getBoundingClientRect() {
          return (
            anchorGetterRef.current?.()?.getBoundingClientRect() ??
            new DOMRect(0, 0, 0, 0)
          )
        },
      }) satisfies Measurable,
    [],
  )

  const virtualRef = React.useMemo(
    () => ({ current: virtualMeasurable }) as React.RefObject<Measurable>,
    [virtualMeasurable],
  )

  return (
    <PopoverPositioningContext.Provider value={positioning ?? null}>
      <PopoverPrimitive.Root
        data-slot="popover-root"
        onOpenChange={(open) => onOpenChange?.({ open })}
        {...rest}
      >
        {positioning?.getAnchorElement ? (
          <PopoverPrimitive.Anchor virtualRef={virtualRef} />
        ) : null}
        {children}
      </PopoverPrimitive.Root>
    </PopoverPositioningContext.Provider>
  )
}

interface PopoverContentProps
  extends Omit<React.ComponentProps<typeof PopoverPrimitive.Content>, "ref"> {
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
  const sideOffset = positioning?.gutter ?? 8
  const avoidCollisions = positioning?.flip !== false
  const collisionPadding = positioning?.fitViewport === false ? 0 : 8
  const sticky =
    positioning?.slide === false
      ? undefined
      : positioning?.slide === true
        ? "partial"
        : undefined

  const content = (
    <PopoverPrimitive.Content
      ref={ref}
      data-slot="popover-content"
      side={side}
      align={align}
      sideOffset={sideOffset}
      avoidCollisions={avoidCollisions}
      collisionPadding={collisionPadding}
      sticky={sticky}
      className={cn(
        "max-h-[var(--radix-popper-available-height)] origin-[var(--radix-popper-transform-origin)] rounded-xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
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
    </PopoverPrimitive.Content>
  )

  if (!portalled) {
    return content
  }

  return (
    <PopoverPrimitive.Portal container={portalRef?.current ?? undefined}>
      {content}
    </PopoverPrimitive.Portal>
  )
}

export function PopoverCloseTrigger({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Close>) {
  return (
    <PopoverPrimitive.Close
      data-slot="popover-close-trigger"
      asChild
      {...props}
    >
      <CloseButton className={cn("absolute top-2 right-2", className)} />
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
    <div
      data-slot="popover-body"
      className={cn("min-h-0", className)}
      {...props}
    />
  )
}

export function PopoverFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-footer"
      className={cn(
        "mt-4 flex flex-row flex-wrap justify-end gap-2",
        className,
      )}
      {...props}
    />
  )
}

export function PopoverTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="popover-title"
      className={cn(
        "font-heading text-base font-medium leading-none text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export const PopoverTrigger = PopoverPrimitive.Trigger
