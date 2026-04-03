import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { Group, Panel, Separator } from "react-resizable-panels"
import { UsersService } from "@/client/index.ts"
import { Breadcrumbs } from "@/components/Common/Breadcrumbs.tsx"
import Navbar from "@/components/Common/Navbar.tsx"
import Sidebar, { SidebarDesktopContent } from "@/components/Common/Sidebar.tsx"
import { SkipLink } from "@/components/Common/SkipLink.tsx"
import { AssistantSessionProvider } from "@/contexts/AssistantSessionContext.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import { useTwinRealtime } from "@/hooks/useTwinRealtime.ts"
import { getErrorHttpStatus } from "@/lib/apiClient.ts"
import { removeAccessToken } from "@/lib/authStorage.ts"

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
      const st = getErrorHttpStatus(err)
      if (st === 401 || st === 403 || st === 404) {
        removeAccessToken()
        throw redirect({ to: "/login" })
      }
      throw err
    }
  },
})

function MainColumn() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      <Breadcrumbs />
      <Outlet />
    </div>
  )
}

function Layout() {
  useTwinRealtime()
  return (
    <AssistantSessionProvider>
      <div className="relative flex h-screen flex-col">
          <SkipLink />
          <Navbar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            {/* Mobile: контент без resizable split */}
            <main
              id="main-content"
              className="block min-w-0 flex-1 md:hidden"
            >
              <MainColumn />
            </main>
            {/* Desktop: resizable панели */}
            <div className="hidden min-h-0 min-w-0 flex-1 md:block">
              <Group
                orientation="horizontal"
                id="nebardak-shell-sidebar"
                className="h-full"
                defaultLayout={{ sidebar: 18, main: 82 }}
              >
                <Panel
                  id="sidebar"
                  defaultSize="18%"
                  minSize="14%"
                  maxSize="32%"
                  className="min-w-0"
                >
                  <SidebarDesktopContent />
                </Panel>
                <Separator className="relative w-2 shrink-0 bg-transparent">
                  <span
                    className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-border hover:bg-primary/50"
                    aria-hidden
                  />
                </Separator>
                <Panel
                  id="main"
                  defaultSize="82%"
                  minSize="48%"
                  className="min-w-0"
                >
                  <main id="main-content" className="h-full min-h-0">
                    <MainColumn />
                  </main>
                </Panel>
              </Group>
            </div>
          </div>
        </div>
    </AssistantSessionProvider>
  )
}

export default Layout
