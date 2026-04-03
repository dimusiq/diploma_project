"use client"

import { ChevronLeftIcon, ChevronRightIcon, EllipsisIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"
import type { LinkButtonProps } from "./link-button.tsx"
import { LinkButton } from "./link-button.tsx"

type BtnSize = React.ComponentProps<typeof Button>["size"]
type ShadcnVariant = NonNullable<React.ComponentProps<typeof Button>["variant"]>

interface VariantMap {
  current: ShadcnVariant
  default: ShadcnVariant
  ellipsis: ShadcnVariant
}

type PaginationVariant = "outline" | "solid" | "subtle"

function toLinkVariant(
  v: ShadcnVariant,
): NonNullable<LinkButtonProps["variant"]> {
  if (v === "solid" || v == null) return "default"
  if (v === "subtle") return "secondary"
  return v as NonNullable<LinkButtonProps["variant"]>
}

const VARIANT_MAP: Record<PaginationVariant, VariantMap> = {
  outline: { default: "ghost", ellipsis: "ghost", current: "outline" },
  solid: { default: "outline", ellipsis: "outline", current: "default" },
  subtle: { default: "ghost", ellipsis: "ghost", current: "secondary" },
}

function getVisiblePages(
  current: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 0) return []
  if (totalPages <= 10) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)
  for (let i = current - 2; i <= current + 2; i++) {
    if (i > 1 && i < totalPages) pages.add(i)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | "ellipsis")[] = []
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]
    if (i > 0 && n - sorted[i - 1] > 1) out.push("ellipsis")
    out.push(n)
  }
  return out
}

type PaginationContextValue = {
  count: number
  pageSize: number
  page: number
  totalPages: number
  pageRange: { start: number; end: number }
  previousPage: number | null
  nextPage: number | null
  setPage: (page: number) => void
  getHref?: (page: number) => string
  size: BtnSize
  variantMap: VariantMap
}

const PaginationContext = React.createContext<PaginationContextValue | null>(
  null,
)

function usePaginationContext() {
  const ctx = React.useContext(PaginationContext)
  if (!ctx) {
    throw new Error("Pagination components must be used within PaginationRoot")
  }
  return ctx
}

export interface PaginationRootProps
  extends Omit<React.ComponentProps<"div">, "onChange"> {
  count: number
  pageSize: number
  /** 1-based текущая страница (контролируемый режим) */
  page?: number
  defaultPage?: number
  onPageChange?: (details: { page: number }) => void
  size?: BtnSize
  variant?: PaginationVariant
  getHref?: (page: number) => string
}

export function PaginationRoot({
  count,
  pageSize,
  page: pageProp,
  defaultPage = 1,
  onPageChange,
  size = "sm",
  variant = "outline",
  getHref,
  className,
  children,
  ...rest
}: PaginationRootProps) {
  const totalPages = Math.max(
    1,
    Math.ceil(Math.max(0, count) / Math.max(1, pageSize)),
  )
  const [internalPage, setInternalPage] = React.useState(() =>
    Math.min(Math.max(1, defaultPage), totalPages),
  )
  const isControlled = pageProp !== undefined
  const page = isControlled
    ? Math.min(Math.max(1, pageProp), totalPages)
    : Math.min(Math.max(1, internalPage), totalPages)

  const setPage = React.useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(1, next), totalPages)
      if (!isControlled) setInternalPage(clamped)
      onPageChange?.({ page: clamped })
    },
    [isControlled, onPageChange, totalPages],
  )

  React.useEffect(() => {
    if (!isControlled && internalPage > totalPages) {
      setInternalPage(totalPages)
    }
  }, [isControlled, internalPage, totalPages])

  const start = (page - 1) * pageSize
  const end = Math.min(start + pageSize, count)

  const value: PaginationContextValue = React.useMemo(
    () => ({
      count,
      pageSize,
      page,
      totalPages,
      pageRange: { start, end },
      previousPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
      setPage,
      getHref,
      size,
      variantMap: VARIANT_MAP[variant],
    }),
    [
      count,
      pageSize,
      page,
      totalPages,
      start,
      end,
      setPage,
      getHref,
      size,
      variant,
    ],
  )

  return (
    <PaginationContext.Provider value={value}>
      <div
        data-slot="pagination"
        className={cn("flex flex-wrap items-center gap-1", className)}
        {...rest}
      >
        {children}
      </div>
    </PaginationContext.Provider>
  )
}

export function PaginationEllipsis({
  className,
  ...rest
}: React.ComponentProps<"span">) {
  const { size, variantMap } = usePaginationContext()
  return (
    <span
      role="presentation"
      data-slot="pagination-ellipsis"
      className={cn("inline-flex items-center justify-center", className)}
      {...rest}
    >
      <Button
        type="button"
        variant={variantMap.ellipsis}
        size={size}
        className="pointer-events-none min-w-7"
        tabIndex={-1}
        aria-hidden
      >
        <EllipsisIcon className="size-4" />
      </Button>
    </span>
  )
}

export function PaginationItem({
  value,
  className,
  ...rest
}: { value: number } & React.ComponentProps<typeof Button>) {
  const { page, setPage, getHref, size, variantMap } = usePaginationContext()
  const current = page === value
  const variant = current ? variantMap.current : variantMap.default

  if (getHref) {
    const { onClick: _onClick, ...linkRest } = rest as Record<string, unknown>
    return (
      <LinkButton
        href={getHref(value)}
        size={size}
        variant={toLinkVariant(variant)}
        className={cn("min-w-7", className)}
        data-active={current ? "" : undefined}
        {...(linkRest as React.ComponentProps<typeof LinkButton>)}
      >
        {value}
      </LinkButton>
    )
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("min-w-7", className)}
      data-active={current ? "" : undefined}
      aria-current={current ? "page" : undefined}
      onClick={() => setPage(value)}
      {...rest}
    >
      {value}
    </Button>
  )
}

export function PaginationPrevTrigger({
  asChild,
  children,
  className,
  ...rest
}: React.ComponentProps<typeof Button> & { asChild?: boolean }) {
  const { previousPage, setPage, getHref, size, variantMap } =
    usePaginationContext()

  if (getHref) {
    return (
      <LinkButton
        href={previousPage != null ? getHref(previousPage) : "#"}
        size={size}
        variant={toLinkVariant(variantMap.default)}
        className={cn(
          previousPage == null && "pointer-events-none opacity-50",
          className,
        )}
        aria-disabled={previousPage == null}
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
          if (previousPage == null) e.preventDefault()
        }}
        {...(rest as React.ComponentProps<typeof LinkButton>)}
      >
        {children ?? <ChevronLeftIcon className="size-4" />}
      </LinkButton>
    )
  }

  const go = () => {
    if (previousPage != null) setPage(previousPage)
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      {
        disabled: previousPage == null,
        onClick: (e: React.MouseEvent) => {
          go()
          const orig = (
            children as React.ReactElement<{
              onClick?: (ev: React.MouseEvent) => void
            }>
          ).props.onClick
          orig?.(e)
        },
      },
    )
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variantMap.default}
      disabled={previousPage == null}
      className={className}
      onClick={go}
      {...rest}
    >
      {children ?? <ChevronLeftIcon className="size-4" />}
    </Button>
  )
}

export function PaginationNextTrigger({
  asChild,
  children,
  className,
  ...rest
}: React.ComponentProps<typeof Button> & { asChild?: boolean }) {
  const { nextPage, setPage, getHref, size, variantMap } =
    usePaginationContext()

  if (getHref) {
    return (
      <LinkButton
        href={nextPage != null ? getHref(nextPage) : "#"}
        size={size}
        variant={toLinkVariant(variantMap.default)}
        className={cn(
          nextPage == null && "pointer-events-none opacity-50",
          className,
        )}
        aria-disabled={nextPage == null}
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
          if (nextPage == null) e.preventDefault()
        }}
        {...(rest as React.ComponentProps<typeof LinkButton>)}
      >
        {children ?? <ChevronRightIcon className="size-4" />}
      </LinkButton>
    )
  }

  const go = () => {
    if (nextPage != null) setPage(nextPage)
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      {
        disabled: nextPage == null,
        onClick: (e: React.MouseEvent) => {
          go()
          const orig = (
            children as React.ReactElement<{
              onClick?: (ev: React.MouseEvent) => void
            }>
          ).props.onClick
          orig?.(e)
        },
      },
    )
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variantMap.default}
      disabled={nextPage == null}
      className={className}
      onClick={go}
      {...rest}
    >
      {children ?? <ChevronRightIcon className="size-4" />}
    </Button>
  )
}

export function PaginationItems(props: React.HTMLAttributes<HTMLDivElement>) {
  const { page, totalPages } = usePaginationContext()
  const items = getVisiblePages(page, totalPages)
  return (
    <div className="flex flex-wrap items-center gap-1" {...props}>
      {items.map((item, index) =>
        item === "ellipsis" ? (
          <PaginationEllipsis key={`e-${index}`} />
        ) : (
          <PaginationItem key={item} value={item} />
        ),
      )}
    </div>
  )
}

export function PaginationPageText({
  format = "compact",
  className,
  ...rest
}: {
  format?: "short" | "compact" | "long"
} & React.ComponentProps<"p">) {
  const { page, totalPages, pageRange, count } = usePaginationContext()
  const content = React.useMemo(() => {
    if (format === "short") return `${page} / ${totalPages}`
    if (format === "compact") return `${page} of ${totalPages}`
    return `${pageRange.start + 1} - ${Math.min(pageRange.end, count)} of ${count}`
  }, [format, page, totalPages, pageRange, count])

  return (
    <p
      className={cn("text-sm font-medium text-foreground", className)}
      {...rest}
    >
      {content}
    </p>
  )
}
