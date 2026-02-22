import type { BoxProps, InputElementProps } from "@chakra-ui/react"
import { Group, InputElement } from "@chakra-ui/react"
import * as React from "react"

export interface InputGroupProps extends BoxProps {
  ref?: React.Ref<HTMLDivElement>
  startElementProps?: InputElementProps
  endElementProps?: InputElementProps
  startElement?: React.ReactNode
  endElement?: React.ReactNode
  children: React.ReactElement<InputElementProps>
  startOffset?: InputElementProps["paddingStart"]
  endOffset?: InputElementProps["paddingEnd"]
}

export function InputGroup({
  ref,
  startElement,
  startElementProps,
  endElement,
  endElementProps,
  children,
  startOffset = "6px",
  endOffset = "6px",
  ...rest
}: InputGroupProps) {
  const child =
    React.Children.only<React.ReactElement<InputElementProps>>(children)

  return (
    <Group ref={ref} {...rest}>
      {startElement && (
        <InputElement pointerEvents="none" {...startElementProps}>
          {startElement}
        </InputElement>
      )}
      {React.cloneElement(child, {
        ...(startElement && {
          ps: `calc(var(--input-height) - ${startOffset})`,
        }),
        ...(endElement && { pe: `calc(var(--input-height) - ${endOffset})` }),
        ...children.props,
      })}
      {endElement && (
        <InputElement placement="end" {...endElementProps}>
          {endElement}
        </InputElement>
      )}
    </Group>
  )
}
