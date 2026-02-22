import { RadioGroup as ChakraRadioGroup } from "@chakra-ui/react"
import type * as React from "react"

export interface RadioProps extends ChakraRadioGroup.ItemProps {
  ref?: React.Ref<HTMLInputElement>
  rootRef?: React.Ref<HTMLDivElement>
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
}

export function Radio({
  ref,
  children,
  inputProps,
  rootRef,
  ...rest
}: RadioProps) {
  return (
    <ChakraRadioGroup.Item ref={rootRef} {...rest}>
      <ChakraRadioGroup.ItemHiddenInput ref={ref} {...inputProps} />
      <ChakraRadioGroup.ItemIndicator />
      {children && (
        <ChakraRadioGroup.ItemText>{children}</ChakraRadioGroup.ItemText>
      )}
    </ChakraRadioGroup.Item>
  )
}

export const RadioGroup = ChakraRadioGroup.Root
