import { Box, Card, Text } from "@chakra-ui/react"
import type { ReactNode } from "react"

interface DashboardStatCardProps {
  label: string
  value: string | number
  helpText?: string
  valueColor?: "info" | "success" | "warning" | "error" | "muted"
  icon?: ReactNode
}

const colorMap = {
  info: "blue.500",
  success: "green.500",
  warning: "orange.500",
  error: "red.500",
  muted: "gray.600",
} as const

export function DashboardStatCard({
  label,
  value,
  helpText,
  valueColor = "info",
  icon,
}: DashboardStatCardProps) {
  const color = colorMap[valueColor]
  return (
    <Card.Root>
      <Card.Body>
        <Box display="flex" flexDirection="column" gap={2}>
          {icon && (
            <Box color={color} fontSize="xl">
              {icon}
            </Box>
          )}
          <Text fontSize="lg" fontWeight="bold">
            {label}
          </Text>
          <Text fontSize="2xl" fontWeight="bold" color={color}>
            {value}
          </Text>
          {helpText && (
            <Text fontSize="sm" color="gray.600">
              {helpText}
            </Text>
          )}
        </Box>
      </Card.Body>
    </Card.Root>
  )
}
