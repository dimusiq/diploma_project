import { Popover as ChakraPopover, Portal } from "@chakra-ui/react"
import type * as React from "react"
import { CloseButton } from "./close-button.tsx"

interface PopoverContentProps extends ChakraPopover.ContentProps {
  ref?: React.Ref<HTMLDivElement>
  portalled?: boolean
  portalRef?: React.RefObject<HTMLElement | null>
}

export function PopoverContent({
  ref,
  children,
  portalled = true,
  portalRef,
  ...rest
}: PopoverContentProps) {
  return (
    <Portal disabled={!portalled} container={portalRef}>
      <ChakraPopover.Positioner>
        <ChakraPopover.Content ref={ref} {...rest} asChild={false}>
          {children}
        </ChakraPopover.Content>
      </ChakraPopover.Positioner>
    </Portal>
  )
}

export function PopoverCloseTrigger({
  ref,
  children,
  ...props
}: ChakraPopover.CloseTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <ChakraPopover.CloseTrigger
      position="absolute"
      top="2"
      insetEnd="2"
      {...props}
      asChild
    >
      <CloseButton size="sm" ref={ref}>
        {children}
      </CloseButton>
    </ChakraPopover.CloseTrigger>
  )
}

export const PopoverRoot = ChakraPopover.Root
export const PopoverFooter = ChakraPopover.Footer
export const PopoverHeader = ChakraPopover.Header
export const PopoverBody = ChakraPopover.Body
export const PopoverTitle = ChakraPopover.Title
export const PopoverDescription = ChakraPopover.Description
export const PopoverTrigger = ChakraPopover.Trigger
export const PopoverAnchor = ChakraPopover.Anchor
