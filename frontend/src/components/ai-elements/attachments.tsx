"use client"

import { FileIcon, XIcon } from "lucide-react"
import { createContext, type ReactNode, useContext, useMemo } from "react"

import { cn } from "@/lib/utils.ts"

/** Данные вложения (как в AI Elements). */
export type AttachmentData = {
  id: string
  file: File
  /** Object URL превью; освобождается при размонтировании Attachment. */
  url: string
}

type AttachmentItemContextValue = {
  data: AttachmentData
  onRemove: () => void
}

const AttachmentItemCtx = createContext<AttachmentItemContextValue | null>(null)

export function useAttachmentItem() {
  const v = useContext(AttachmentItemCtx)
  if (!v) {
    throw new Error("Attachment parts must be inside Attachment")
  }
  return v
}

type AttachmentsProps = {
  variant?: "inline" | "block"
  className?: string
  children: ReactNode
}

export function Attachments({
  variant = "inline",
  className,
  children,
}: AttachmentsProps) {
  return (
    <div
      data-slot="attachments"
      className={cn(
        "flex flex-wrap gap-2",
        variant === "block" && "flex-col",
        className,
      )}
    >
      {children}
    </div>
  )
}

type AttachmentProps = {
  data: AttachmentData
  onRemove: () => void
  className?: string
  children: ReactNode
}

export function Attachment({
  data,
  onRemove,
  className,
  children,
}: AttachmentProps) {
  const value = useMemo(() => ({ data, onRemove }), [data, onRemove])

  return (
    <AttachmentItemCtx.Provider value={value}>
      <div
        data-slot="attachment"
        className={cn(
          "group relative flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/90 pr-1 pl-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/80",
          className,
        )}
      >
        {children}
      </div>
    </AttachmentItemCtx.Provider>
  )
}

export function AttachmentPreview({ className }: { className?: string }) {
  const { data } = useAttachmentItem()
  const isImage = data.file.type.startsWith("image/")
  if (isImage) {
    return (
      <img
        src={data.url}
        alt=""
        className={cn("size-9 shrink-0 rounded-md object-cover", className)}
      />
    )
  }
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md bg-zinc-200/80 dark:bg-zinc-800",
        className,
      )}
    >
      <FileIcon
        className="size-4 text-zinc-600 dark:text-zinc-400"
        aria-hidden
      />
    </div>
  )
}

export function AttachmentRemove({ className }: { className?: string }) {
  const { onRemove, data } = useAttachmentItem()
  return (
    <button
      type="button"
      data-slot="attachment-remove"
      onClick={onRemove}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 opacity-70 transition-opacity hover:bg-zinc-200/80 hover:text-zinc-900 hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        className,
      )}
      aria-label={`Удалить ${data.file.name}`}
    >
      <XIcon className="size-3.5" />
    </button>
  )
}
