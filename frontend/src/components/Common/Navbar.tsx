import { Box, Button, Flex, Image, useBreakpointValue } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FaRobot } from "react-icons/fa"

import { fetchAgentPermissions } from "@/api/agent.ts"
import Logo from "/images/nebardak-logo.svg"
import { ColorModeButton } from "@/components/ui/color-mode.tsx"
import { NotificationCenter } from "./NotificationCenter.tsx"
import UserMenu from "./UserMenu.tsx"

function Navbar() {
  const display = useBreakpointValue({
    base: "none",
    md: "flex",
  })

  const { data: agentPerm, isPending: agentPermPending } = useQuery({
    queryKey: ["agent-permissions"],
    queryFn: fetchAgentPermissions,
  })
  const showAssistant = !agentPermPending && agentPerm?.can_use === true

  return (
    <Flex
      display={display}
      justify="space-between"
      position="sticky"
      color="white"
      align="center"
      bg="bg.muted"
      w="100%"
      top={0}
      p={4}
    >
      <Link to="/">
        <Image src={Logo} alt="Nebardak" maxW="3xs" p={2} />
      </Link>
      <Flex gap={2} alignItems="center">
        {showAssistant ? (
          <Button
            variant="ghost"
            size="sm"
            asChild
            borderRadius="md"
            cursor="pointer"
            _hover={{ bg: "whiteAlpha.300" }}
            _active={{ bg: "whiteAlpha.400" }}
          >
            <Link to="/assistant" aria-label="Ассистент склада">
              <Box
                as={FaRobot}
                boxSize="5"
                aria-hidden
                css={{ "& svg": { fill: "currentColor" } }}
              />
            </Link>
          </Button>
        ) : null}
        <NotificationCenter />
        <ColorModeButton />
        <UserMenu />
      </Flex>
    </Flex>
  )
}

export default Navbar
