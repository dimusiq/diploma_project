import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { UsersService } from "@/client/index.ts"
import { BottomNav } from "@/components/Common/BottomNav.tsx"
import { Breadcrumbs } from "@/components/Common/Breadcrumbs.tsx"
import Navbar from "@/components/Common/Navbar.tsx"
import { AppSidebar } from "@/components/Common/Sidebar.tsx"
import { SkipLink } from "@/components/Common/SkipLink.tsx"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx"
import { AssistantSessionProvider } from "@/contexts/AssistantSessionContext.tsx"
import { isLoggedIn } from "@/hooks/useAuth.ts"
import { useItemsRealtime } from "@/hooks/useItemsRealtime.ts"
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 pb-20 md:pb-4">
      <Breadcrumbs />
      <Outlet />
    </div>
  )
}

function Layout() {
  useTwinRealtime()
  useItemsRealtime()
  return (
    <AssistantSessionProvider>
      <SidebarProvider>
        <SkipLink />
        <div className="flex min-h-screen w-full flex-col">
          <div className="flex min-h-0 flex-1">
            <AppSidebar />
            <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Navbar />
              <main id="main-content" className="flex min-h-0 flex-1 flex-col">
                <MainColumn />
              </main>
              <BottomNav />
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </AssistantSessionProvider>
  )
}

export default Layout
