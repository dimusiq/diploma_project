"use client"

import type {
  ButtonProps,
  GroupProps,
  InputProps,
  StackProps,
} from "@chakra-ui/react"
import {
  Box,
  HStack,
  IconButton,
  Input,
  mergeRefs,
  Stack,
  useControllableState,
} from "@chakra-ui/react"
import { useRef } from "react"
import { FiEye, FiEyeOff } from "react-icons/fi"
import { Field } from "./field.tsx"
import { InputGroup } from "./input-group.tsx"

export interface PasswordVisibilityProps {
  defaultVisible?: boolean
  visible?: boolean
  onVisibleChange?: (visible: boolean) => void
  visibilityIcon?: { on: React.ReactNode; off: React.ReactNode }
}

export interface PasswordInputProps
  extends InputProps,
    PasswordVisibilityProps {
  ref?: React.Ref<HTMLInputElement>
  rootProps?: GroupProps
  startElement?: React.ReactNode
  type: string
  errors: any
}

function VisibilityTrigger({
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <IconButton
      tabIndex={-1}
      ref={ref}
      me="-2"
      aspectRatio="square"
      size="sm"
      variant="ghost"
      height="calc(100% - {spacing.2})"
      aria-label="Toggle password visibility"
      color="inherit"
      {...props}
    />
  )
}

export function PasswordInput({
  ref,
  rootProps,
  defaultVisible,
  visible: visibleProp,
  onVisibleChange,
  visibilityIcon = { on: <FiEye />, off: <FiEyeOff /> },
  startElement,
  type,
  errors,
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useControllableState({
    value: visibleProp,
    defaultValue: defaultVisible || false,
    onChange: onVisibleChange,
  })

  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Field
      invalid={!!errors[type]}
      errorText={errors[type]?.message}
      alignSelf="start"
    >
      <InputGroup
        width="100%"
        startElement={startElement}
        endElement={
          <VisibilityTrigger
            disabled={rest.disabled}
            onPointerDown={(e) => {
              if (rest.disabled) return
              if (e.button !== 0) return
              e.preventDefault()
              setVisible(!visible)
            }}
          >
            {visible ? visibilityIcon.off : visibilityIcon.on}
          </VisibilityTrigger>
        }
        {...rootProps}
      >
        <Input
          {...rest}
          ref={mergeRefs(ref, inputRef)}
          type={visible ? "text" : "password"}
        />
      </InputGroup>
    </Field>
  )
}

interface PasswordStrengthMeterProps extends StackProps {
  ref?: React.Ref<HTMLDivElement>
  max?: number
  value: number
}

export function PasswordStrengthMeter({
  ref,
  max = 4,
  value,
  ...rest
}: PasswordStrengthMeterProps) {
  const percent = (value / max) * 100
  const { label, colorPalette } = getColorPalette(percent)

  return (
    <Stack align="flex-end" gap="1" ref={ref} {...rest}>
      <HStack width="full">
        {Array.from({ length: max }).map((_, index) => (
          <Box
            key={index}
            height="1"
            flex="1"
            rounded="sm"
            data-selected={index < value ? "" : undefined}
            layerStyle="fill.subtle"
            colorPalette="gray"
            _selected={{
              colorPalette,
              layerStyle: "fill.solid",
            }}
          />
        ))}
      </HStack>
      {label && <HStack textStyle="xs">{label}</HStack>}
    </Stack>
  )
}

function getColorPalette(percent: number) {
  switch (true) {
    case percent < 33:
      return { label: "Low", colorPalette: "red" }
    case percent < 66:
      return { label: "Medium", colorPalette: "orange" }
    default:
      return { label: "High", colorPalette: "green" }
  }
}
