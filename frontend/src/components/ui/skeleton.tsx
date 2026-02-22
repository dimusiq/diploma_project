import type {
  SkeletonProps as ChakraSkeletonProps,
  CircleProps,
} from "@chakra-ui/react"
import { Skeleton as ChakraSkeleton, Circle, Stack } from "@chakra-ui/react"
import type * as React from "react"

export interface SkeletonCircleProps extends ChakraSkeletonProps {
  ref?: React.Ref<HTMLDivElement>
  size?: CircleProps["size"]
}

export function SkeletonCircle({ ref, size, ...rest }: SkeletonCircleProps) {
  return (
    <Circle size={size} asChild ref={ref}>
      <ChakraSkeleton {...rest} />
    </Circle>
  )
}

export interface SkeletonTextProps extends ChakraSkeletonProps {
  ref?: React.Ref<HTMLDivElement>
  noOfLines?: number
}

export function SkeletonText({
  ref,
  noOfLines = 3,
  gap,
  ...rest
}: SkeletonTextProps) {
  return (
    <Stack gap={gap} width="full" ref={ref}>
      {Array.from({ length: noOfLines }).map((_, index) => (
        <ChakraSkeleton
          height="4"
          key={index}
          _last={{ maxW: "80%" }}
          {...rest}
        />
      ))}
    </Stack>
  )
}

export const Skeleton = ChakraSkeleton
