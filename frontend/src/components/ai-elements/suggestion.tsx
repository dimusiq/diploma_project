"use client"

import type * as React from "react"

import { cn } from "@/lib/utils.ts"

export type SuggestionsProps = React.ComponentProps<"div">

/** Горизонтальная лента подсказок над полем ввода (AI Elements). */
export function Suggestions({ className, ...props }: SuggestionsProps) {
  return (
    <div
      data-slot="suggestions"
      className={cn("flex flex-wrap gap-2", className)}
      {...props}
    />
  )
}

export type SuggestionProps = Omit<
  React.ComponentProps<"button">,
  "children"
> & {
  suggestion: string
}

export function Suggestion({
  suggestion,
  className,
  type = "button",
  ...props
}: SuggestionProps) {
  return (
    <button
      type={type}
      data-slot="suggestion"
      className={cn(
        "border-border bg-background text-foreground hover:bg-muted/80 inline-flex max-w-full cursor-pointer items-center rounded-full border px-3 py-1.5 text-left text-xs leading-snug transition-colors md:text-sm",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="line-clamp-2">{suggestion}</span>
    </button>
  )
}
