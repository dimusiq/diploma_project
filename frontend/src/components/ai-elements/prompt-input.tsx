"use client"

/**
 * Стили и разметка в духе AI Elements Prompt Input
 * https://elements.ai-sdk.dev/components/prompt-input
 */

import { CornerDownLeftIcon, PlusIcon, XIcon } from "lucide-react"
import * as React from "react"
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react"

import { Button } from "@/components/ui/button.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { cn } from "@/lib/utils.ts"

type PromptInputContextValue = {
  fileInputId: string
  attachmentListId: string
}

const PromptInputCtx = createContext<PromptInputContextValue | null>(null)

export function usePromptInputIds() {
  const v = useContext(PromptInputCtx)
  if (!v) {
    throw new Error("PromptInput components must be inside PromptInput")
  }
  return v
}

type PromptInputProps = Omit<
  React.ComponentProps<"form">,
  "onSubmit" | "children"
> & {
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
  globalDrop?: boolean
  onExternalFiles?: (files: File[]) => void
}

export function PromptInput({
  className,
  onSubmit,
  children,
  globalDrop = false,
  onExternalFiles,
  onDragOver,
  onDrop,
  ...props
}: PromptInputProps) {
  const fileInputId = useId()
  const attachmentListId = useId()
  const ctx = useMemo(
    () => ({ fileInputId, attachmentListId }),
    [fileInputId, attachmentListId],
  )

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onSubmit?.(event)
    },
    [onSubmit],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLFormElement>) => {
      if (globalDrop) {
        e.preventDefault()
        e.stopPropagation()
      }
      onDragOver?.(e)
    },
    [globalDrop, onDragOver],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLFormElement>) => {
      if (globalDrop && e.dataTransfer.files?.length) {
        e.preventDefault()
        e.stopPropagation()
        onExternalFiles?.(Array.from(e.dataTransfer.files))
      }
      onDrop?.(e)
    },
    [globalDrop, onDrop, onExternalFiles],
  )

  return (
    <PromptInputCtx.Provider value={ctx}>
      <form
        className={cn(
          "flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
          className,
        )}
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        {...props}
      >
        {children}
      </form>
    </PromptInputCtx.Provider>
  )
}

export function PromptInputHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-b border-zinc-200/80 px-4 py-2.5 dark:border-zinc-800",
        className,
      )}
      {...props}
    />
  )
}

export function PromptInputBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("min-h-0 px-4 pb-2 pt-4", className)} {...props} />
  )
}

export type PromptInputTextareaProps =
  React.ComponentProps<typeof Textarea> & {
    minRows?: number
    maxHeightPx?: number
  }

export const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(function PromptInputTextareaInner(
  {
    className,
    minRows = 2,
    maxHeightPx = 220,
    rows,
    onChange,
    value,
    ...props
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el
      if (typeof forwardedRef === "function") forwardedRef(el)
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
          el
    },
    [forwardedRef],
  )

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = "auto"
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20
    const minH = (rows ?? minRows) * lineHeight + 16
    const next = Math.min(Math.max(el.scrollHeight, minH), maxHeightPx)
    el.style.height = `${next}px`
  }, [value, maxHeightPx, minRows, rows])

  return (
    <Textarea
      ref={setRefs}
      data-prompt-input-textarea
      data-slot="prompt-input-textarea"
      rows={rows ?? minRows}
      value={value}
      onChange={onChange}
      className={cn(
        "min-h-[52px] max-h-[220px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-zinc-900 shadow-none placeholder:text-zinc-500 focus-visible:ring-0 dark:text-zinc-100 dark:placeholder:text-zinc-500",
        className,
      )}
      {...props}
    />
  )
})
PromptInputTextarea.displayName = "PromptInputTextarea"

/** Нижняя полоса: слева инструменты, справа отправка (как в AI Elements). */
export function PromptInputFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 border-t border-zinc-200 px-4 pb-3 pt-2.5 dark:border-zinc-800",
        className,
      )}
      {...props}
    />
  )
}

/** Одна строка: `justify-between` — инструменты и кнопка отправки. */
export function PromptInputFooterBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3",
        className,
      )}
      {...props}
    />
  )
}

export function PromptInputTools({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-2 text-zinc-600 dark:text-zinc-400",
        className,
      )}
      {...props}
    />
  )
}

/** @deprecated Используйте строку инструментов внутри PromptInputFooter. */
export function PromptInputToolbar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-2",
        className,
      )}
      {...props}
    />
  )
}

type PromptInputFileInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "className"
> & {
  className?: string
}

export function PromptInputFileInput({
  className,
  multiple = true,
  ...props
}: PromptInputFileInputProps) {
  const { fileInputId } = usePromptInputIds()
  return (
    <input
      id={fileInputId}
      type="file"
      data-prompt-input-files
      data-slot="prompt-input-file"
      multiple={multiple}
      className={cn("sr-only", className)}
      {...props}
    />
  )
}

export function PromptInputFileTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"label">) {
  const { fileInputId } = usePromptInputIds()
  return (
    <label
      htmlFor={fileInputId}
      data-slot="prompt-input-file-trigger"
      className={cn(
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        className,
      )}
      {...props}
    >
      {children ?? <PlusIcon className="size-4" strokeWidth={2} aria-hidden />}
      <span className="sr-only">Прикрепить файлы</span>
    </label>
  )
}

export type PromptInputAttachmentsProps = {
  files: File[]
  onRemove: (index: number) => void
  className?: string
}

export function PromptInputAttachments({
  files,
  onRemove,
  className,
}: PromptInputAttachmentsProps) {
  const { attachmentListId } = usePromptInputIds()
  if (files.length === 0) return null
  return (
    <div
      id={attachmentListId}
      role="list"
      data-slot="prompt-input-attachments"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {files.map((file, i) => (
        <span
          key={`${file.name}-${file.size}-${i}`}
          role="listitem"
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <span className="truncate" title={file.name}>
            {file.name}
          </span>
          <span className="shrink-0 text-zinc-500">
            ({Math.round(file.size / 1024)} КБ)
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="ml-0.5 rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label={`Удалить ${file.name}`}
          >
            <XIcon className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  )
}

type PromptInputSubmitProps = React.ComponentProps<typeof Button>

export function PromptInputSubmit({
  className,
  type = "submit",
  children,
  ...props
}: PromptInputSubmitProps) {
  return (
    <Button
      type={type}
      data-slot="prompt-input-submit"
      className={cn(
        "shrink-0 rounded-lg bg-blue-600 p-0 text-white shadow-none hover:bg-blue-700 focus-visible:ring-blue-500/40 dark:bg-blue-600 dark:hover:bg-blue-500",
        className,
      )}
      size="icon-sm"
      {...props}
    >
      {children ?? (
        <CornerDownLeftIcon className="size-4" aria-hidden strokeWidth={2.5} />
      )}
    </Button>
  )
}
