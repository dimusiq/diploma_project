"use client"

/**
 * Составной ввод в духе AI Elements Prompt Input
 * (https://elements.ai-sdk.dev/components/prompt-input): форма, зона вложений, textarea, футер с инструментами.
 */

import { PaperclipIcon, XIcon } from "lucide-react"
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
  /** Принимать файлы перетаскиванием на форму */
  globalDrop?: boolean
  /** Вызывается при drop файлов (вместе с globalDrop) */
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
          "flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/50",
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
        "border-b border-border bg-muted/30 px-3 py-2",
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
    <div className={cn("relative min-h-0", className)} {...props} />
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
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
    },
    [forwardedRef],
  )

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = "auto"
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20
    const minH = (rows ?? minRows) * lineHeight + 24
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
        "min-h-16 max-h-[220px] resize-none rounded-none border-0 bg-transparent px-4 py-4 pb-14 pr-4 text-sm leading-relaxed shadow-none focus-visible:ring-0 md:pb-12",
        className,
      )}
      {...props}
    />
  )
})
PromptInputTextarea.displayName = "PromptInputTextarea"

export function PromptInputFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2",
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
        "pointer-events-auto flex flex-wrap items-center gap-1.5",
        className,
      )}
      {...props}
    />
  )
}

export function PromptInputToolbar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2",
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

/** Скрытый input[type=file]; открывается с `PromptInputFileTrigger` (label). */
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
        "inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? <PaperclipIcon className="size-4" aria-hidden />}
      <span className="sr-only">Прикрепить файлы</span>
    </label>
  )
}

export type PromptInputAttachmentsProps = {
  files: File[]
  onRemove: (index: number) => void
  className?: string
}

/** Список чипов вложений под хедером или над полем ввода. */
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
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
        >
          <span className="truncate" title={file.name}>
            {file.name}
          </span>
          <span className="shrink-0 text-muted-foreground">
            ({Math.round(file.size / 1024)} КБ)
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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
  ...props
}: PromptInputSubmitProps) {
  return (
    <Button
      type={type}
      data-slot="prompt-input-submit"
      size="icon-sm"
      className={cn(
        "pointer-events-auto shrink-0 rounded-full",
        className,
      )}
      {...props}
    />
  )
}
