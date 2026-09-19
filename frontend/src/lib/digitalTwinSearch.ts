import { z } from "zod"

export const DIGITAL_TWIN_TABS = [
  "overview",
  "map",
  "tasks",
  "events",
  "analytics",
] as const

export type DigitalTwinTab = (typeof DIGITAL_TWIN_TABS)[number]
export type DigitalTwinView = "2d" | "3d"

export const digitalTwinSearchSchema = z.object({
  tab: z.enum(DIGITAL_TWIN_TABS).catch("overview"),
  view: z.enum(["2d", "3d"]).catch("2d"),
  deviceId: z.string().min(1).optional(),
})

export type DigitalTwinSearch = z.infer<typeof digitalTwinSearchSchema>
