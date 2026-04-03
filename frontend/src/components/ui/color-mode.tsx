"use client"

/**
 * Тёмная тема: `next-themes` + `attribute="class"` (класс `dark` на корневом
 * элементе документа). Замена Chakra `ColorModeProvider` / `chakra-theme`.
 */

import { MoonIcon, SunIcon } from "lucide-react"
import type { ThemeProviderProps } from "next-themes"
import { ThemeProvider, useTheme } from "next-themes"
import type * as React from "react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils"

export interface ColorModeProviderProps extends ThemeProviderProps {}

export function ColorModeProvider(props: ColorModeProviderProps) {
  return (
    <ThemeProvider attribute="class" disableTransitionOnChange {...props} />
  )
}

export type ColorMode = "light" | "dark"

export interface UseColorModeReturn {
  colorMode: ColorMode
  setColorMode: (colorMode: ColorMode) => void
  toggleColorMode: () => void
}

export function useColorMode(): UseColorModeReturn {
  const { resolvedTheme, setTheme } = useTheme()
  const toggleColorMode = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }
  return {
    colorMode: (resolvedTheme as ColorMode) ?? "light",
    setColorMode: setTheme,
    toggleColorMode,
  }
}

export function useColorModeValue<T>(light: T, dark: T) {
  const { colorMode } = useColorMode()
  return colorMode === "dark" ? dark : light
}

export function ColorModeIcon() {
  const { colorMode } = useColorMode()
  return colorMode === "dark" ? <MoonIcon /> : <SunIcon />
}

function ClientOnly({
  children,
  fallback,
}: {
  children: React.ReactNode
  fallback: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return fallback
  return children
}

export function ColorModeButton({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Button> & {
  ref?: React.Ref<HTMLButtonElement>
}) {
  const { toggleColorMode } = useColorMode()
  return (
    <ClientOnly
      fallback={
        <div
          className="size-8 shrink-0 animate-pulse rounded-md bg-muted"
          aria-hidden
        />
      }
    >
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(className)}
        aria-label="Переключить тему"
        onClick={toggleColorMode}
        {...props}
      >
        <ColorModeIcon />
      </Button>
    </ClientOnly>
  )
}

/** Опциональные обёртки для сегментов с принудительной темой (редко нужны). */
export function LightMode({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span className={cn(className)} {...props} />
}

export function DarkMode({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span className={cn(className)} {...props} />
}
