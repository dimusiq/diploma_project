import { Card, type CardRootProps } from "@chakra-ui/react"
import type { ReactNode } from "react"

export type PagePanelProps = {
  title?: string
  description?: string
  headerExtra?: ReactNode
  children: ReactNode
} & Omit<CardRootProps, "children">

export function PagePanel({
  title,
  description,
  headerExtra,
  children,
  variant = "outline",
  size = "md",
  mb = 6,
  ...cardProps
}: PagePanelProps) {
  const hasHeader = Boolean(title || description || headerExtra)
  return (
    <Card.Root variant={variant} size={size} mb={mb} {...cardProps}>
      {hasHeader ? (
        <Card.Header gap={3}>
          {(title || description) && (
            <>
              {title ? <Card.Title>{title}</Card.Title> : null}
              {description ? (
                <Card.Description>{description}</Card.Description>
              ) : null}
            </>
          )}
          {headerExtra}
        </Card.Header>
      ) : null}
      <Card.Body>{children}</Card.Body>
    </Card.Root>
  )
}
