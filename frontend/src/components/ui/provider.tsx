"use client"

import { ChakraProvider } from "@chakra-ui/react"
import type { PropsWithChildren } from "react"
import { system } from "../../theme.tsx"
import { ColorModeProvider } from "./color-mode.tsx"
import { Toaster } from "./toaster.tsx"

export function CustomProvider(props: PropsWithChildren) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider defaultTheme="light">
        {props.children}
      </ColorModeProvider>
      <Toaster />
    </ChakraProvider>
  )
}
