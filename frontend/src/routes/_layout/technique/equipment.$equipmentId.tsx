import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"

const equipmentCardSearchSchema = z.object({
  tab: z
    .enum(["passport", "maintenance", "repairs", "documents", "history"])
    .optional(),
})

export const Route = createFileRoute(
  "/_layout/technique/equipment/$equipmentId",
)({
  validateSearch: (search) => equipmentCardSearchSchema.parse(search ?? {}),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/equipment/$deviceId",
      params: { deviceId: params.equipmentId },
    })
  },
  component: () => null,
})
