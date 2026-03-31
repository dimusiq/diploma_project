import { Box, Flex, Splitter } from "@chakra-ui/react"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { ApiError, UsersService } from "@/client/index.ts"
import { Breadcrumbs } from "@/components/Common/Breadcrumbs.tsx"
import { removeAccessToken } from "@/lib/authStorage.ts"
import Navbar from "@/components/Common/Navbar.tsx"
import Sidebar, { SidebarDesktopContent } from "@/components/Common/Sidebar.tsx"
import { SkipLink } from "@/components/Common/SkipLink.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import { AssistantSessionProvider } from "@/contexts/AssistantSessionContext.tsx"
import { useTwinRealtime } from "@/hooks/useTwinRealtime.ts"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async ({ context }) => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
    try {
      const user = await context.queryClient.fetchQuery({
        queryKey: ["currentUser"],
        queryFn: UsersService.readUserMe,
      })
      return { user }
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
        removeAccessToken()
        throw redirect({ to: "/login" })
      }
      throw err
    }
  },
})

function Layout() {
  useTwinRealtime()
  return (
    <AssistantSessionProvider>
      <Flex direction="column" h="100vh" position="relative">
        <SkipLink />
        <Navbar />
        <Flex flex="1" minH={0} overflow="hidden">
          <Sidebar />
          {/* Mobile: контент рядом с drawer */}
          <Box
            id="main-content"
            flex="1"
            minW={0}
            display={{ base: "block", md: "none" }}
            as="main"
          >
            <Flex h="100%" direction="column" p={4} overflowY="auto">
              <Breadcrumbs />
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
              defaultSize={[16, 78]}
              panels={[
                { id: "sidebar", minSize: 16, maxSize: 28 },
                { id: "content", minSize: 50 },
              ]}
              h="100%"
            >
              <Splitter.Panel id="sidebar" minW={0}>
                <SidebarDesktopContent />
              </Splitter.Panel>
              <Splitter.ResizeTrigger id="sidebar:content" />
              <Splitter.Panel id="content" minW={0} as="main">
                <Flex
                  id="main-content"
                  h="100%"
                  direction="column"
                  p={4}
                  overflowY="auto"
                >
                  <Breadcrumbs />
                  <Outlet />
                </Flex>
              </Splitter.Panel>
            </Splitter.Root>
          </Box>
        </Flex>
      </Flex>
    </AssistantSessionProvider>
  )
}

export default Layout
