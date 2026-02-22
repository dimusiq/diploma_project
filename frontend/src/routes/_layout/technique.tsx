import { Container, Heading } from "@chakra-ui/react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/technique")({
  component: TechniqueLayout,
})

function TechniqueLayout() {
  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} py={6}>
        Техника
      </Heading>
      <Outlet />
    </Container>
  )
}
