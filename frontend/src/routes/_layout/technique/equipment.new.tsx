import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { EquipmentFormDialog } from "@/components/Equipment/EquipmentFormDialog.tsx"

export const Route = createFileRoute("/_layout/technique/equipment/new")({
  component: EquipmentNewPage,
})

function EquipmentNewPage() {
  const navigate = useNavigate()

  const handleClose = (open: boolean) => {
    if (!open) {
      navigate({ to: "/technique" })
    }
  }

  return (
    <div className="mx-auto w-full max-w-full px-4">
      <h1 className="font-heading mb-6 text-lg font-semibold">
        Добавить технику
      </h1>
      <EquipmentFormDialog
        open
        onOpenChange={handleClose}
        editItem={null}
        asPage
      />
    </div>
  )
}
