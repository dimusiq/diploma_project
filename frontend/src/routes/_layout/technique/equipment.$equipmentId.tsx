import { Container, Heading, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { equipmentApi } from "@/api/equipment.ts"
import { EquipmentFormDialog } from "@/components/Equipment/EquipmentFormDialog.tsx"

export const Route = createFileRoute(
  "/_layout/technique/equipment/$equipmentId",
)({
  component: EquipmentEditPage,
})

function EquipmentEditPage() {
  const { equipmentId } = Route.useParams()
  const navigate = useNavigate()

  const {
    data: equipment,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["equipment", equipmentId],
    queryFn: () => equipmentApi.get(equipmentId),
  })

  const handleClose = (open: boolean) => {
    if (!open) {
      navigate({ to: "/technique", search: { section: "assets" } })
    }
  }

  if (isLoading) {
    return (
      <Container maxW="full">
        <Text color="fg.muted">Загрузка...</Text>
      </Container>
    )
  }
  if (error || !equipment) {
    return (
      <Container maxW="full">
        <Text color="red">Техника не найдена</Text>
      </Container>
    )
  }

  return (
    <Container maxW="full">
      <Heading size="md" mb={6}>
        Редактирование техники
      </Heading>
      <EquipmentFormDialog
        open
        onOpenChange={handleClose}
        editItem={equipment}
        asPage
      />
    </Container>
  )
}
