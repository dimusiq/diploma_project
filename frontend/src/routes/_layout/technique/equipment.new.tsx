import { Container, Heading } from "@chakra-ui/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { EquipmentFormDialog } from "@/components/Equipment/EquipmentFormDialog.tsx"

export const Route = createFileRoute("/_layout/technique/equipment/new")({
  component: EquipmentNewPage,
})

function EquipmentNewPage() {
  const navigate = useNavigate()

  const handleClose = (open: boolean) => {
    if (!open) {
      navigate({ to: "/technique", search: { section: "assets" } })
    }
  }

  return (
    <Container maxW="full">
      <Heading size="md" mb={6}>
        Добавить технику
      </Heading>
      <EquipmentFormDialog
        open
        onOpenChange={handleClose}
        editItem={null}
        asPage
      />
    </Container>
  )
}
