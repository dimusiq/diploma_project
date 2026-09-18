import type { ReactNode } from "react"
import { PalletRackFrame } from "@/components/warehouse3d/PalletRackVisuals.tsx"

export const RackFrame = PalletRackFrame

export function RackLevel({
  level,
  children,
}: {
  level: number
  children: ReactNode
}) {
  return <group userData={{ rackLevel: level }}>{children}</group>
}

export function RackBay({
  bay,
  children,
}: {
  bay: number
  children: ReactNode
}) {
  return <group userData={{ rackBay: bay }}>{children}</group>
}
