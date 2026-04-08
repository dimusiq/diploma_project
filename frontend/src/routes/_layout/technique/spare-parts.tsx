import { createFileRoute } from "@tanstack/react-router"

import { SparePartsList } from "@/components/Equipment/SparePartsList.tsx"

export const Route = createFileRoute("/_layout/technique/spare-parts")({
  component: SparePartsSection,
})

function SparePartsSection() {
  return <SparePartsList />
}
