"use client"

import type * as React from "react"

import { cn } from "@/lib/utils.ts"

export type MessageProps = React.ComponentProps<"div"> & {
  from: "user" | "assistant"
}

/** Сообщение чата — разметка в духе AI Elements `Message`. */
export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-slot="message"
      data-from={from}
      className={cn(
        "group/message w-full motion-safe:animate-in motion-safe:fade-in",
        from === "user" ? "flex justify-end" : "flex justify-start",
        className,
      )}
      {...props}
    />
  )
}

export type MessageContentProps = React.ComponentProps<"div">

export function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      data-slot="message-content"
      className={cn("min-w-0", className)}
      {...props}
    />
  )
}

export type MessageResponseProps = React.ComponentProps<"div">

/** Текст ответа ассистента (plain text; при необходимости оберните в prose снаружи). */
export function MessageResponse({ className, ...props }: MessageResponseProps) {
  return (
    <div
      data-slot="message-response"
      className={cn(
        "text-foreground text-sm leading-relaxed whitespace-pre-wrap",
        className,
      )}
      {...props}
    />
  )
}
