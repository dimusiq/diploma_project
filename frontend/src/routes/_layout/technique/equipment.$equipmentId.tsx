import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { EquipmentCard } from "@/components/Equipment/EquipmentCard.tsx"

const equipmentCardSearchSchema = z.object({
  tab: z
    .enum(["passport", "maintenance", "repairs", "documents", "history"])
    .optional(),
})

export const Route = createFileRoute(
  "/_layout/technique/equipment/$equipmentId",
)({
  component: EquipmentEditPage,
  validateSearch: (search) => equipmentCardSearchSchema.parse(search ?? {}),
})

function EquipmentEditPage() {
  const { equipmentId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()

  const handleBack = () => {
    navigate({ to: "/technique", search: { section: "assets" } })
  }

  return (
    <div className="mx-auto w-full max-w-full px-4">
      <EquipmentCard
        equipmentId={equipmentId}
        initialTab={tab ?? "passport"}
        onBack={handleBack}
      />
    </div>
  )
}
