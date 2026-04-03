"use client"

import { ThemeProvider } from "next-themes"
import type { PropsWithChildren } from "react"
import { Toaster } from "@/components/ui/sonner.tsx"

/** Корневой провайдер без Chakra: тема (next-themes) + Sonner. */
export function CustomProvider(props: PropsWithChildren) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
    >
      {props.children}
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  )
}
