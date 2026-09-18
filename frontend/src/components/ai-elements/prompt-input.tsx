"use client"

/**
 * API и визуал в духе AI Elements Prompt Input
 * https://elements.ai-sdk.dev/components/prompt-input
 */

import {
  CornerDownLeftIcon,
  Loader2Icon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"
import {
  type ComponentProps,
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

import type { AttachmentData } from "@/components/ai-elements/attachments.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextareaWrap,
} from "@/components/ui/input-group.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx"
import { cn } from "@/lib/utils.ts"

// --- Types (совместимо с @ai-sdk/react useChat) --------------------------------

export type PromptInputChatStatus =
  | "ready"
  | "submitted"
  | "streaming"
  | "error"

export type PromptInputMessage = {
  /** Текст из textarea */
  text?: string
  /** Файлы для отправки в модель */
  files?: File[]
}

export type PromptInputAttachment = AttachmentData

type PromptInputErrorCode = "max_files" | "max_file_size" | "accept"

type PromptInputRootContextValue = {
  fileInputId: string
  attachmentListId: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  attachments: PromptInputAttachment[]
  addFiles: (files: File[] | FileList) => void
  removeAttachment: (id: string) => void
  clearAttachments: () => void
  openFileDialog: () => void
  accept: string | undefined
  multiple: boolean
}

const PromptInputRootCtx = createContext<PromptInputRootContextValue | null>(
  null,
)

function usePromptInputRoot() {
  const v = useContext(PromptInputRootCtx)
  if (!v) {
    throw new Error("PromptInput components must be used inside <PromptInput>")
  }
  return v
}

export function usePromptInputAttachments() {
  const {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    openFileDialog,
  } = usePromptInputRoot()
  return {
    files: attachments,
    add: addFiles,
    remove: removeAttachment,
    clear: clearAttachments,
    openFileDialog,
  }
}

export function usePromptInputIds() {
  const { fileInputId, attachmentListId } = usePromptInputRoot()
  return { fileInputId, attachmentListId }
}

function fileListToArray(files: File[] | FileList): File[] {
  return Array.isArray(files) ? files : Array.from(files)
}

/** Одно правило из `accept` (MIME, wildcard `type/*`, расширение `.ext`). */
function fileMatchesAcceptRule(f: File, rule: string): boolean {
  const t = rule.trim()
  if (!t) return false
  if (t.startsWith(".")) {
    return f.name.toLowerCase().endsWith(t.toLowerCase())
  }
  const mime = f.type.toLowerCase()
  if (t.endsWith("/*")) {
    const base = t.slice(0, -2).toLowerCase()
    return mime.startsWith(`${base}/`)
  }
  if (t === "*/*") return true
  return mime === t.toLowerCase()
}

// --- PromptInput --------------------------------------------------------------

type PromptInputProps = Omit<
  React.ComponentProps<"form">,
  "onSubmit" | "children"
> & {
  children: ReactNode
  /** Сообщение при отправке формы (Enter / кнопка). */
  onSubmit?: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void
  globalDrop?: boolean
  /** @deprecated Используйте встроенные вложения; оставлено для обратной совместимости */
  onExternalFiles?: (files: File[]) => void
  multiple?: boolean
  accept?: string
  maxFiles?: number
  maxFileSize?: number
  /** Ошибка валидации вложений (тип, размер, лимит). Не путать с `onError` формы. */
  onAttachmentError?: (err: {
    code: PromptInputErrorCode
    message: string
  }) => void
}

export function PromptInput({
  className,
  onSubmit,
  children,
  globalDrop = false,
  onExternalFiles,
  onDragOver,
  onDrop,
  multiple = true,
  accept,
  maxFiles = 32,
  maxFileSize = 20 * 1024 * 1024,
  onAttachmentError,
  ...props
}: PromptInputProps) {
  const fileInputId = useId()
  const attachmentListId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = React.useState<PromptInputAttachment[]>(
    [],
  )

  const revokeAll = useCallback((list: PromptInputAttachment[]) => {
    for (const a of list) {
      URL.revokeObjectURL(a.url)
    }
  }, [])

  const addFiles = useCallback(
    (incoming: File[] | FileList) => {
      let batch = fileListToArray(incoming).filter(Boolean)
      if (batch.length === 0) return

      if (accept) {
        const rules = accept.split(",").map((s) => s.trim()).filter(Boolean)
        const ok = batch.filter((f) =>
          rules.some((rule) => fileMatchesAcceptRule(f, rule)),
        )
        if (ok.length < batch.length) {
          onAttachmentError?.({
            code: "accept",
            message: "Неподходящий тип файла",
          })
        }
        if (ok.length === 0) return
        batch = ok
      }

      setAttachments((prev) => {
        const next = [...prev]
        for (const f of batch) {
          if (f.size > maxFileSize) {
            const mb = Math.round(maxFileSize / (1024 * 1024))
            onAttachmentError?.({
              code: "max_file_size",
              message: `Файл слишком большой (макс. ${mb} МБ): ${f.name}`,
            })
            continue
          }
          if (next.length >= maxFiles) {
            onAttachmentError?.({
              code: "max_files",
              message: "Слишком много вложений",
            })
            break
          }
          next.push({
            id: crypto.randomUUID(),
            file: f,
            url: URL.createObjectURL(f),
          })
        }
        return next
      })
    },
    [accept, maxFileSize, maxFiles, onAttachmentError],
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id)
      if (found) URL.revokeObjectURL(found.url)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      revokeAll(prev)
      return []
    })
  }, [revokeAll])

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const ctx = useMemo(
    (): PromptInputRootContextValue => ({
      fileInputId,
      attachmentListId,
      fileInputRef,
      attachments,
      addFiles,
      removeAttachment,
      clearAttachments,
      openFileDialog,
      accept,
      multiple,
    }),
    [
      fileInputId,
      attachmentListId,
      attachments,
      addFiles,
      removeAttachment,
      clearAttachments,
      openFileDialog,
      accept,
      multiple,
    ],
  )

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = event.currentTarget
      const ta = form.querySelector<HTMLTextAreaElement>(
        "[data-prompt-input-textarea]",
      )
      const text = ta?.value ?? ""
      const files = attachments.map((a) => a.file)
      if (!text.trim() && files.length === 0) return

      onSubmit?.(
        {
          text,
          files: files.length > 0 ? files : undefined,
        },
        event,
      )

      clearAttachments()
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [attachments, clearAttachments, onSubmit],
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
        addFiles(e.dataTransfer.files)
        onExternalFiles?.(Array.from(e.dataTransfer.files))
      }
      onDrop?.(e)
    },
    [globalDrop, onDrop, addFiles, onExternalFiles],
  )

  return (
    <PromptInputRootCtx.Provider value={ctx}>
      <form
        className="w-full min-w-0"
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        {...props}
      >
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          data-prompt-input-files
          data-slot="prompt-input-file"
          onChange={(e) => {
            const list = e.target.files
            if (list?.length) {
              addFiles(list)
              onExternalFiles?.(Array.from(list))
            }
            e.target.value = ""
          }}
        />
        <InputGroup className={className}>{children}</InputGroup>
      </form>
    </PromptInputRootCtx.Provider>
  )
}

// --- Sections ----------------------------------------------------------------

export function PromptInputHeader({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupAddon>) {
  return (
    <InputGroupAddon
      align="block-start"
      className={cn("text-foreground", className)}
      {...props}
    />
  )
}

export function PromptInputBody({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupTextareaWrap>) {
  return <InputGroupTextareaWrap className={className} {...props} />
}

export type PromptInputTextareaProps = React.ComponentProps<typeof Textarea> & {
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
        (
          forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>
        ).current = el
    },
    [forwardedRef],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: controlled `value` задаёт scrollHeight textarea
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
      data-slot="input-group-control"
      rows={rows ?? minRows}
      value={value}
      onChange={onChange}
      className={cn(
        "flex min-h-[52px] max-h-[220px] w-full flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-3 text-base leading-relaxed shadow-none outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:ring-0 md:text-sm dark:bg-transparent",
        "[field-sizing:content]",
        className,
      )}
      {...props}
    />
  )
})
PromptInputTextarea.displayName = "PromptInputTextarea"

/** Нижний аддон: слева `PromptInputTools`, справа `PromptInputSubmit` (input-group / AI Elements). */
export function PromptInputFooter({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupAddon>) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("text-foreground", className)}
      {...props}
    />
  )
}

/** @deprecated Используйте `<PromptInputFooter>` — в нём уже есть `justify-between`. */
export function PromptInputFooterBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3",
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

/** @deprecated */
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

// --- Toolbar controls ---------------------------------------------------------

export function PromptInputActionMenu({
  ...props
}: ComponentProps<typeof DropdownMenu>) {
  return <DropdownMenu {...props} />
}

export function PromptInputActionMenuTrigger({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuTrigger>) {
  return (
    <DropdownMenuTrigger asChild {...props}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(
          "size-8 shrink-0 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
          className,
        )}
        aria-label="Меню вложений"
      >
        <PlusIcon className="size-4" strokeWidth={2} />
      </Button>
    </DropdownMenuTrigger>
  )
}

export function PromptInputActionMenuContent({
  className,
  align = "start",
  ...props
}: ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      className={cn("min-w-[12rem]", className)}
      align={align}
      {...props}
    />
  )
}

type MenuItemProps = ComponentProps<typeof DropdownMenuItem>

export function PromptInputActionAddAttachments({
  label = "Add photos or files",
  ...props
}: MenuItemProps & { label?: string }) {
  const { openFileDialog } = usePromptInputAttachments()
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault()
        openFileDialog()
      }}
      {...props}
    >
      {label}
    </DropdownMenuItem>
  )
}

export function PromptInputAttachButton({
  label = "Прикрепить файл",
  tooltip = "Картинки и текстовые файлы, до 14 МБ",
  disabled,
}: {
  label?: string
  tooltip?: string
  disabled?: boolean
}) {
  const { openFileDialog } = usePromptInputAttachments()
  return (
    <PromptInputButton
      type="button"
      size="icon-sm"
      tooltip={tooltip}
      aria-label={label}
      disabled={disabled}
      onClick={() => openFileDialog()}
    >
      <PaperclipIcon className="size-4" />
    </PromptInputButton>
  )
}

type PromptInputButtonTooltip =
  | string
  | {
      content: ReactNode
      shortcut?: string
      side?: ComponentProps<typeof TooltipContent>["side"]
    }

export type PromptInputButtonProps = ComponentProps<typeof Button> & {
  tooltip?: PromptInputButtonTooltip
}

export function PromptInputButton({
  className,
  tooltip,
  variant = "ghost",
  size = "sm",
  children,
  ...props
}: PromptInputButtonProps) {
  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(
        "h-8 gap-1.5 rounded-md px-2 text-sm font-normal text-zinc-600 dark:text-zinc-400",
        variant === "default" &&
          "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  )

  if (!tooltip) return button

  const content = typeof tooltip === "string" ? tooltip : tooltip.content
  const shortcut = typeof tooltip === "object" ? tooltip.shortcut : undefined
  const side = typeof tooltip === "object" ? tooltip.side : undefined

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        <span>{content}</span>
        {shortcut ? (
          <kbd className="rounded border border-background/30 bg-background/20 px-1.5 py-0.5 font-mono text-[10px] opacity-90">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

export function PromptInputSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} />
}

export function PromptInputSelectTrigger({
  className,
  ...props
}: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      size="sm"
      className={cn(
        "h-8 w-fit min-w-0 max-w-[14rem] gap-1.5 border-0 bg-transparent px-2 shadow-none hover:bg-zinc-100 data-[placeholder]:text-zinc-500 dark:hover:bg-zinc-800 [&_svg]:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export const PromptInputSelectValue = SelectValue

export function PromptInputSelectContent({
  className,
  ...props
}: ComponentProps<typeof SelectContent>) {
  return <SelectContent className={cn(className)} {...props} />
}

export const PromptInputSelectItem = SelectItem

type PromptInputSubmitProps = Omit<ComponentProps<typeof Button>, "type"> & {
  type?: "submit" | "button"
  /** Состояние чата из `useChat` (AI SDK). */
  status?: PromptInputChatStatus
}

export function PromptInputSubmit({
  className,
  type = "submit",
  children,
  status = "ready",
  disabled,
  loading,
  ...props
}: PromptInputSubmitProps) {
  const busy =
    Boolean(loading) || status === "streaming" || status === "submitted"

  const icon =
    status === "error" ? (
      <SquareIcon className="size-4" aria-hidden />
    ) : busy ? (
      <Loader2Icon className="size-4 animate-spin" aria-hidden />
    ) : (
      <CornerDownLeftIcon className="size-4" strokeWidth={2.5} aria-hidden />
    )

  return (
    <Button
      type={type}
      variant="default"
      data-slot="prompt-input-submit"
      disabled={disabled}
      className={cn("shrink-0 rounded-md p-0 shadow-none", className)}
      size="icon-sm"
      {...props}
    >
      {children ?? icon}
    </Button>
  )
}

// --- Legacy: явный file input / чипы (без хука) --------------------------------

type PromptInputFileInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "className" | "id"
> & {
  className?: string
}

/** Пустой маркер: файл задаётся одним скрытым `<input>` внутри `<PromptInput>`. */
export function PromptInputFileInput(_props: PromptInputFileInputProps) {
  return null
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

export type PromptInputAttachmentsLegacyProps = {
  files: File[]
  onRemove: (index: number) => void
  className?: string
}

/** @deprecated Используйте `Attachments` + `usePromptInputAttachments`. */
export function PromptInputAttachments({
  files,
  onRemove,
  className,
}: PromptInputAttachmentsLegacyProps) {
  const { attachmentListId } = usePromptInputIds()
  if (files.length === 0) return null
  return (
    <ul
      id={attachmentListId}
      data-slot="prompt-input-attachments-legacy"
      className={cn("flex list-none flex-wrap gap-2 p-0", className)}
    >
      {files.map((file, i) => (
        <li
          key={`${file.name}-${file.size}-${i}`}
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
        </li>
      ))}
    </ul>
  )
}
