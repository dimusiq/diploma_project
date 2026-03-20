import { Flex, Image, useBreakpointValue } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import Logo from "/images/nebardak-logo.svg"
import { ColorModeButton } from "@/components/ui/color-mode.tsx"
import { NotificationCenter } from "./NotificationCenter.tsx"
import UserMenu from "./UserMenu.tsx"

function Navbar() {
  const display = useBreakpointValue({
    base: "none",
    md: "flex",
  })

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
        <NotificationCenter />
        <ColorModeButton />
        <UserMenu />
      </Flex>
    </Flex>
  )
}

export default Navbar
