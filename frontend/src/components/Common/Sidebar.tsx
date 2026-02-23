import { Box, Flex, IconButton, Text } from "@chakra-ui/react"
import { useState } from "react"
import { FaBars } from "react-icons/fa"
import { FiLogOut } from "react-icons/fi"

import useAuth from "@/hooks/useAuth.ts"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerRoot,
  DrawerTrigger,
} from "../ui/drawer.tsx"
import SidebarItems from "./SidebarItems.tsx"

/** Контент сайдбара для вставки в Splitter.Panel на десктопе (resizable). */
export function SidebarDesktopContent() {
  const { logout } = useAuth()
  return (
    <Box
      h="100%"
      minH={0}
      overflowY="auto"
      overflowX="hidden"
      w="100%"
      p={4}
      bg="bg.subtle"
    >
      <SidebarItems />
      <Flex
        as="button"
        onClick={() => logout()}
        alignItems="center"
        gap={4}
        px={4}
        py={2}
      >
        <FiLogOut />
        <Text>Выйти</Text>
      </Flex>
    </Box>
  )
}

const Sidebar = () => {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile: drawer + hamburger */}
      <DrawerRoot
        placement="start"
        open={open}
        onOpenChange={(e) => setOpen(e.open)}
      >
        <DrawerBackdrop />
        <DrawerTrigger asChild>
          <IconButton
            variant="ghost"
            color="inherit"
            display={{ base: "flex", md: "none" }}
            aria-label="Open Menu"
            position="absolute"
            zIndex="100"
            m={4}
          >
            <FaBars />
          </IconButton>
        </DrawerTrigger>
        <DrawerContent maxW="xs">
          <DrawerCloseTrigger />
          <DrawerBody overflow="hidden" display="flex" flexDir="column" p={0}>
            <Box
              flex="1"
              minH={0}
              overflowY="auto"
              overflowX="hidden"
              px={4}
              pt={4}
              pb={4}
            >
              <SidebarItems onClose={() => setOpen(false)} />
              <Flex
                as="button"
                onClick={() => logout()}
                alignItems="center"
                gap={4}
                px={4}
                py={2}
              >
                <FiLogOut />
                <Text>Выйти</Text>
              </Flex>
            </Box>
          </DrawerBody>
          <DrawerCloseTrigger />
        </DrawerContent>
      </DrawerRoot>
    </>
  )
}

export default Sidebar
