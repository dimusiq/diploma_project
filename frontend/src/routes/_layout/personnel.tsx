import { createFileRoute } from "@tanstack/react-router"
import { PersonnelPage } from "@/components/personnel/PersonnelPage.tsx"

export const Route = createFileRoute("/_layout/personnel")({
  component: PersonnelPage,
})
