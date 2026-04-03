/**
 * Имена CSS custom properties из `theme/tokens.css` — для TS (графики, inline styles).
 * Значения цветов задаются только в CSS.
 *
 * Legacy Chakra: `ui.main` → `themeCssVar.primary`; `semantic.success` → `themeSemanticVar.success`.
 */
export const themeCssVar = {
  /** Бывший `ui.main` */
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  ring: "--ring",
} as const

export const themeSemanticVar = {
  success: "--semantic-success",
  warning: "--semantic-warning",
  error: "--semantic-error",
  info: "--semantic-info",
} as const

export type ThemeCssVarKey = keyof typeof themeCssVar
export type ThemeSemanticVarKey = keyof typeof themeSemanticVar

/** `var(--primary)` и т.д. */
export function themeVar(name: ThemeCssVarKey): string {
  return `var(${themeCssVar[name]})`
}

/** `hsl(var(--semantic-success))` — в CSS хранятся HSL-компоненты */
export function themeSemanticHsl(name: ThemeSemanticVarKey): string {
  return `hsl(var(${themeSemanticVar[name]}))`
}
