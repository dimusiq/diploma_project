import { Text, type TextProps } from "@chakra-ui/react"

export function FetchingIndicator({
  active,
  children = "Обновление…",
  minH = "20px",
  ...props
}: Omit<TextProps, "children"> & {
  active: boolean
  children?: React.ReactNode
  minH?: TextProps["minH"]
}) {
  return (
    <Text
      fontSize="sm"
      color="fg.muted"
      minH={minH}
      visibility={active ? "visible" : "hidden"}
      {...props}
    >
      {children}
    </Text>
  )
}

