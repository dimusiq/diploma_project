"use client"

/**
 * Сворачиваемый блок «рассуждения» модели — по образцу AI Elements Reasoning
 * https://elements.ai-sdk.dev/components/reasoning
 */

import { ChevronDownIcon } from "lucide-react"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { cn } from "@/lib/utils.ts"

type ReasoningContextValue = {
  isStreaming: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  /** Длительность в секундах после завершения потока; во время стрима — `undefined`. */
  duration: number | undefined
}

const ReasoningCtx = createContext<ReasoningContextValue | null>(null)

export function useReasoning(): ReasoningContextValue {
  const ctx = useContext(ReasoningCtx)
  if (!ctx) {
    throw new Error("useReasoning must be used within <Reasoning>")
  }
  return ctx
}

export type ReasoningProps = React.ComponentProps<typeof Collapsible> & {
  /** Идёт ли поток reasoning (панель открывается и закрывается по завершении). */
  isStreaming?: boolean
  /** Длительность в секундах снаружи; иначе считается по таймеру стрима. */
  duration?: number
}

export function Reasoning({
  className,
  children,
  isStreaming = false,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  duration: durationProp,
  ...props
}: ReasoningProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : uncontrolledOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  const streamStartedAt = useRef<number | null>(null)
  const [computedDuration, setComputedDuration] = useState<number | undefined>(
    undefined,
  )

  useEffect(() => {
    if (isStreaming) {
      streamStartedAt.current = Date.now()
      setComputedDuration(undefined)
      setOpen(true)
    } else {
      if (streamStartedAt.current != null) {
        const sec = (Date.now() - streamStartedAt.current) / 1000
        setComputedDuration(Math.round(sec * 10) / 10)
        streamStartedAt.current = null
      }
      setOpen(false)
    }
  }, [isStreaming, setOpen])

  const duration = durationProp ?? computedDuration

  const ctx = useMemo(
    (): ReasoningContextValue => ({
      isStreaming,
      isOpen: open,
      setIsOpen: setOpen,
      duration,
    }),
    [isStreaming, open, setOpen, duration],
  )

  return (
    <ReasoningCtx.Provider value={ctx}>
      <Collapsible
        data-slot="reasoning"
        open={open}
        onOpenChange={setOpen}
        className={cn("group/reasoning w-full", className)}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningCtx.Provider>
  )
}

export type ReasoningTriggerProps = React.ComponentProps<
  typeof CollapsibleTrigger
> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode
}

export function ReasoningTrigger({
  className,
  getThinkingMessage,
  children,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning()

  const label =
    children ??
    (getThinkingMessage
      ? getThinkingMessage(isStreaming, duration)
      : defaultThinkingLabel(isStreaming, duration))

  return (
    <CollapsibleTrigger asChild {...props}>
      <button
        type="button"
        data-slot="reasoning-trigger"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-transparent px-1 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground",
          className,
        )}
      >
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 opacity-70 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
        <span
          className={cn(
            "min-w-0 flex-1 font-medium",
            isStreaming && "motion-safe:animate-pulse",
          )}
        >
          {label}
        </span>
      </button>
    </CollapsibleTrigger>
  )
}

function defaultThinkingLabel(
  isStreaming: boolean,
  duration?: number,
): ReactNode {
  if (isStreaming) return "Думаем…"
  if (duration != null && duration >= 0) return `Размышление · ${duration} с`
  return "Размышление"
}

export type ReasoningContentProps = React.ComponentProps<
  typeof CollapsibleContent
> & {
  children: ReactNode
}

export function ReasoningContent({
  className,
  children,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn(
        "overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "mt-1 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground",
          "dark:bg-muted/20",
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  )
}
