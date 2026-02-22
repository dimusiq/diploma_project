import { Drawer as ChakraDrawer, Portal } from "@chakra-ui/react"
import type * as React from "react"
import { CloseButton } from "./close-button.tsx"

interface DrawerContentProps extends ChakraDrawer.ContentProps {
  ref?: React.Ref<HTMLDivElement>
  portalled?: boolean
  portalRef?: React.RefObject<HTMLElement>
  offset?: ChakraDrawer.ContentProps["padding"]
}

export function DrawerContent({
  ref,
  children,
  portalled = true,
  portalRef,
  offset,
  ...rest
}: DrawerContentProps) {
  return (
    <Portal disabled={!portalled} container={portalRef}>
      <ChakraDrawer.Positioner padding={offset}>
        <ChakraDrawer.Content ref={ref} {...rest} asChild={false}>
          {children}
        </ChakraDrawer.Content>
      </ChakraDrawer.Positioner>
    </Portal>
  )
}

export function DrawerCloseTrigger({
  ref,
  ...props
}: ChakraDrawer.CloseTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <ChakraDrawer.CloseTrigger
      position="absolute"
      top="2"
      insetEnd="2"
      {...props}
      asChild
    >
      <CloseButton size="sm" ref={ref} />
    </ChakraDrawer.CloseTrigger>
  )
}

export const DrawerTrigger = ChakraDrawer.Trigger
export const DrawerRoot = ChakraDrawer.Root
export const DrawerFooter = ChakraDrawer.Footer
export const DrawerHeader = ChakraDrawer.Header
export const DrawerBody = ChakraDrawer.Body
export const DrawerBackdrop = ChakraDrawer.Backdrop
export const DrawerDescription = ChakraDrawer.Description
export const DrawerTitle = ChakraDrawer.Title
export const DrawerActionTrigger = ChakraDrawer.ActionTrigger
