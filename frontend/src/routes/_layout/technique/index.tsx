import { createFileRoute } from "@tanstack/react-router"

import { EquipmentList } from "@/components/Equipment/EquipmentList.tsx"

export const Route = createFileRoute("/_layout/technique/")({
  component: AssetsSection,
})

function AssetsSection() {
  return <EquipmentList />
}
