import type * as React from "react"

import { cn } from "@/lib/utils.ts"

type SkeletonLegacySpace = {
  /** Совместимость со старым API: размеры как в Tailwind spacing (4 → 1rem) */
  h?: string
  w?: string
  minH?: string
  maxW?: string
  height?: string
  width?: string
  borderRadius?: string
  mb?: number
  mt?: number
}

export type SkeletonProps = Omit<React.ComponentProps<"div">, "children"> &
  SkeletonLegacySpace & {
    ref?: React.Ref<HTMLDivElement>
  }

function borderRadiusPropToClass(r?: string) {
  if (!r) return undefined
  if (r === "md") return "rounded-md"
  if (r === "lg") return "rounded-lg"
  if (r === "full") return "rounded-full"
  return undefined
}

export function Skeleton({
  className,
  ref,
  h,
  w,
  minH,
  maxW,
  height,
  width,
  borderRadius,
  mb,
  mt,
  style,
  ...props
}: SkeletonProps) {
  const cls: string[] = []
  const st: React.CSSProperties = { ...style }
  const H = height ?? h
  const W = width ?? w
  if (H) {
    if (/^\d+$/.test(H)) cls.push(`h-${H}`)
    else st.height = H
  }
  if (W) {
    if (W.includes("%") || W.includes("px") || W.includes("rem")) st.width = W
    else if (/^\d+$/.test(W)) cls.push(`w-${W}`)
    else st.width = W
  }
  if (minH) {
    if (/^\d+$/.test(minH)) cls.push(`min-h-${minH}`)
    else st.minHeight = minH
  }
  if (maxW) {
    if (maxW.includes("%") || maxW.includes("px")) st.maxWidth = maxW
    else if (/^\d+$/.test(maxW)) cls.push(`max-w-${maxW}`)
    else st.maxWidth = maxW
  }
  if (mb != null) cls.push(`mb-${mb}`)
  if (mt != null) cls.push(`mt-${mt}`)
  const rad = borderRadiusPropToClass(borderRadius)
  if (rad) cls.push(rad)

  return (
    <div
      ref={ref}
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", cls, className)}
      style={Object.keys(st).length ? st : undefined}
      {...props}
    />
  )
}

export interface SkeletonCircleProps extends SkeletonProps {
  size?: number | string
}

export function SkeletonCircle({
  size = 40,
  className,
  ref,
  ...rest
}: SkeletonCircleProps) {
  const s = typeof size === "number" ? `${size}px` : size
  return (
    <Skeleton
      ref={ref}
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: s, height: s }}
      {...rest}
    />
  )
}

export type SkeletonTextProps = Omit<SkeletonProps, "w"> & {
  noOfLines?: number
  gap?: string
  w?: number | string
}

export function SkeletonText({
  noOfLines = 3,
  gap = "0.5rem",
  w,
  className,
  ref,
  ...rest
}: SkeletonTextProps) {
  const width =
    w === undefined ? undefined : typeof w === "number" ? `${w}px` : w
  return (
    <div
      ref={ref}
      className={cn("flex flex-col", width ? undefined : "w-full", className)}
      style={{ gap, width }}
    >
      {Array.from({ length: noOfLines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4 w-full", index === noOfLines - 1 && "max-w-[80%]")}
          {...rest}
        />
      ))}
    </div>
  )
}
