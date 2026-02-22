import type { ButtonProps as ChakraButtonProps } from "@chakra-ui/react"
import { IconButton as ChakraIconButton } from "@chakra-ui/react"
import type * as React from "react"
import { LuX } from "react-icons/lu"

export interface CloseButtonProps extends ChakraButtonProps {
  ref?: React.Ref<HTMLButtonElement>
}

export function CloseButton({
  ref,
  children,
  ...props
}: CloseButtonProps) {
  return (
    <ChakraIconButton variant="ghost" aria-label="Close" ref={ref} {...props}>
      {children ?? <LuX />}
    </ChakraIconButton>
  )
}
