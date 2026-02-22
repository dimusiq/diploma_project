"use client"

import type { ButtonProps, TextProps } from "@chakra-ui/react"
import {
  Button,
  Pagination as ChakraPagination,
  createContext,
  IconButton,
  Text,
  usePaginationContext,
} from "@chakra-ui/react"
import * as React from "react"
import {
  HiChevronLeft,
  HiChevronRight,
  HiMiniEllipsisHorizontal,
} from "react-icons/hi2"
import { LinkButton } from "./link-button.tsx"

interface ButtonVariantMap {
  current: ButtonProps["variant"]
  default: ButtonProps["variant"]
  ellipsis: ButtonProps["variant"]
}

type PaginationVariant = "outline" | "solid" | "subtle"

interface ButtonVariantContext {
  size: ButtonProps["size"]
  variantMap: ButtonVariantMap
  getHref?: (page: number) => string
}

const [RootPropsProvider, useRootProps] = createContext<ButtonVariantContext>({
  name: "RootPropsProvider",
})

export interface PaginationRootProps
  extends Omit<ChakraPagination.RootProps, "type"> {
  ref?: React.Ref<HTMLDivElement>
  size?: ButtonProps["size"]
  variant?: PaginationVariant
  getHref?: (page: number) => string
}

const variantMap: Record<PaginationVariant, ButtonVariantMap> = {
  outline: { default: "ghost", ellipsis: "plain", current: "outline" },
  solid: { default: "outline", ellipsis: "outline", current: "solid" },
  subtle: { default: "ghost", ellipsis: "plain", current: "subtle" },
}

export function PaginationRoot({
  ref,
  size = "sm",
  variant = "outline",
  getHref,
  ...rest
}: PaginationRootProps) {
  return (
    <RootPropsProvider
      value={{ size, variantMap: variantMap[variant], getHref }}
    >
      <ChakraPagination.Root
        ref={ref}
        type={getHref ? "link" : "button"}
        {...rest}
      />
    </RootPropsProvider>
  )
}

export function PaginationEllipsis({
  ref,
  ...props
}: ChakraPagination.EllipsisProps & {
  ref?: React.Ref<HTMLDivElement>
}) {
  const { size, variantMap } = useRootProps()
  return (
    <ChakraPagination.Ellipsis ref={ref} {...props} asChild>
      <Button as="span" variant={variantMap.ellipsis} size={size}>
        <HiMiniEllipsisHorizontal />
      </Button>
    </ChakraPagination.Ellipsis>
  )
}

export function PaginationItem({
  ref,
  ...props
}: ChakraPagination.ItemProps & {
  ref?: React.Ref<HTMLButtonElement>
}) {
  const { page } = usePaginationContext()
  const { size, variantMap, getHref } = useRootProps()

  const current = page === props.value
  const variant = current ? variantMap.current : variantMap.default

  if (getHref) {
    return (
      <LinkButton href={getHref(props.value)} variant={variant} size={size}>
        {props.value}
      </LinkButton>
    )
  }

  return (
    <ChakraPagination.Item ref={ref} {...props} asChild>
      <Button variant={variant} size={size}>
        {props.value}
      </Button>
    </ChakraPagination.Item>
  )
}

export function PaginationPrevTrigger({
  ref,
  ...props
}: ChakraPagination.PrevTriggerProps & {
  ref?: React.Ref<HTMLButtonElement>
}) {
  const { size, variantMap, getHref } = useRootProps()
  const { previousPage } = usePaginationContext()

  if (getHref) {
    return (
      <LinkButton
        href={previousPage != null ? getHref(previousPage) : undefined}
        variant={variantMap.default}
        size={size}
      >
        <HiChevronLeft />
      </LinkButton>
    )
  }

  return (
    <ChakraPagination.PrevTrigger ref={ref} asChild {...props}>
      <IconButton variant={variantMap.default} size={size}>
        <HiChevronLeft />
      </IconButton>
    </ChakraPagination.PrevTrigger>
  )
}

export function PaginationNextTrigger({
  ref,
  ...props
}: ChakraPagination.NextTriggerProps & {
  ref?: React.Ref<HTMLButtonElement>
}) {
  const { size, variantMap, getHref } = useRootProps()
  const { nextPage } = usePaginationContext()

  if (getHref) {
    return (
      <LinkButton
        href={nextPage != null ? getHref(nextPage) : undefined}
        variant={variantMap.default}
        size={size}
      >
        <HiChevronRight />
      </LinkButton>
    )
  }

  return (
    <ChakraPagination.NextTrigger ref={ref} asChild {...props}>
      <IconButton variant={variantMap.default} size={size}>
        <HiChevronRight />
      </IconButton>
    </ChakraPagination.NextTrigger>
  )
}

export const PaginationItems = (props: React.HTMLAttributes<HTMLElement>) => {
  return (
    <ChakraPagination.Context>
      {({ pages }) =>
        pages.map((page, index) => {
          return page.type === "ellipsis" ? (
            <PaginationEllipsis key={index} index={index} {...props} />
          ) : (
            <PaginationItem
              key={index}
              type="page"
              value={page.value}
              {...props}
            />
          )
        })
      }
    </ChakraPagination.Context>
  )
}

interface PageTextProps extends TextProps {
  ref?: React.Ref<HTMLParagraphElement>
  format?: "short" | "compact" | "long"
}

export function PaginationPageText({
  ref,
  format = "compact",
  ...rest
}: PageTextProps) {
  const { page, totalPages, pageRange, count } = usePaginationContext()
  const content = React.useMemo(() => {
    if (format === "short") return `${page} / ${totalPages}`
    if (format === "compact") return `${page} of ${totalPages}`
    return `${pageRange.start + 1} - ${Math.min(
      pageRange.end,
      count,
    )} of ${count}`
  }, [format, page, totalPages, pageRange, count])

  return (
    <Text fontWeight="medium" ref={ref} {...rest}>
      {content}
    </Text>
  )
}
