"use client"

import type { PropsWithChildren } from "react"
import { ColorModeProvider } from "@/components/ui/color-mode.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"

/**
 * Корневой провайдер: `next-themes` (`ColorModeProvider`) кладёт класс `dark` на
 * `document.documentElement` — совместимо с Tailwind `dark:` и shadcn.
 */
export function CustomProvider(props: PropsWithChildren) {
  return (
    <ColorModeProvider defaultTheme="light" disableTransitionOnChange>
      {props.children}
      <Toaster position="top-right" richColors closeButton />
    </ColorModeProvider>
  )
}
