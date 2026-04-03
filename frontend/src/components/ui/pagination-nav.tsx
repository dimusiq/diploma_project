/**
 * Низкоуровневые блоки пагинации как в fastapi/full-stack-fastapi-template.
 * Для контекстной пагинации (PaginationRoot и т.д.) см. `pagination.tsx`.
 */
import type { VariantProps } from "class-variance-authority"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"
import type * as React from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function PaginationNav({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination-nav"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationNavContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-nav-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationNavItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-nav-item" {...props} />
}

type PaginationNavLinkProps = {
  isActive?: boolean
} & Pick<VariantProps<typeof buttonVariants>, "size"> &
  React.ComponentProps<"a">

function PaginationNavLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationNavLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-nav-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className,
      )}
      {...props}
    />
  )
}

function PaginationNavPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationNavLink>) {
  return (
    <PaginationNavLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon />
      <span className="hidden sm:block">Previous</span>
    </PaginationNavLink>
  )
}

function PaginationNavNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationNavLink>) {
  return (
    <PaginationNavLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
      {...props}
    >
      <span className="hidden sm:block">Next</span>
      <ChevronRightIcon />
    </PaginationNavLink>
  )
}

function PaginationNavEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-nav-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  PaginationNav,
  PaginationNavContent,
  PaginationNavLink,
  PaginationNavItem,
  PaginationNavPrevious,
  PaginationNavNext,
  PaginationNavEllipsis,
}
