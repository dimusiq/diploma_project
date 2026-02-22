import { Box, Flex, Splitter } from "@chakra-ui/react"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { UsersService } from "@/client/index.ts"
import Navbar from "@/components/Common/Navbar.tsx"
import Sidebar, { SidebarDesktopContent } from "@/components/Common/Sidebar.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async ({ context }) => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
    const user = await context.queryClient.fetchQuery({
      queryKey: ["currentUser"],
      queryFn: UsersService.readUserMe,
    })
    return { user }
  },
})

function Layout() {
  return (
    <Flex direction="column" h="100vh">
      <Navbar />
      <Flex flex="1" minH={0} overflow="hidden">
        <Sidebar />
        {/* Mobile: контент рядом с drawer */}
        <Box flex="1" minW={0} display={{ base: "block", md: "none" }}>
          <Flex h="100%" direction="column" p={4} overflowY="auto">
            <Outlet />
          </Flex>
        </Box>
        {/* Desktop: resizable Splitter (Chakra v3.30+) */}
        <Box
          flex="1"
          minW={0}
          minH={0}
          display={{ base: "none", md: "block" }}
        >
          <Splitter.Root
            defaultSize={[22, 78]}
            panels={[
              { id: "sidebar", minSize: 16, maxSize: 40 },
              { id: "content", minSize: 50 },
            ]}
            h="100%"
          >
            <Splitter.Panel id="sidebar" minW={0}>
              <SidebarDesktopContent />
            </Splitter.Panel>
            <Splitter.ResizeTrigger id="sidebar:content" />
            <Splitter.Panel id="content" minW={0}>
              <Flex h="100%" direction="column" p={4} overflowY="auto">
                <Outlet />
              </Flex>
            </Splitter.Panel>
          </Splitter.Root>
        </Box>
      </Flex>
    </Flex>
  )
}

export default Layout
