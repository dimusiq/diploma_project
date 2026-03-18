import { Container } from "@chakra-ui/react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/technique")({
  component: TechniqueLayout,
})

function TechniqueLayout() {
  return (
    <Container maxW="full">
      <Outlet />
    </Container>
  )
}
