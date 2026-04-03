import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FaRobot } from "react-icons/fa"

import { fetchAgentPermissions } from "@/api/agent.ts"
import { buttonVariants } from "@/components/ui/button.tsx"
import { ColorModeButton } from "@/components/ui/color-mode.tsx"
import { SidebarTrigger } from "@/components/ui/sidebar.tsx"
import { cn } from "@/lib/utils"
import { NotificationCenter } from "./NotificationCenter.tsx"
import UserMenu from "./UserMenu.tsx"

function Navbar() {
  const { data: agentPerm, isPending: agentPermPending } = useQuery({
    queryKey: ["agent-permissions"],
    queryFn: fetchAgentPermissions,
  })
  const showAssistant = !agentPermPending && agentPerm?.can_use === true

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/95 p-3 text-foreground backdrop-blur md:p-4",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showAssistant ? (
          <Link
            to="/assistant"
            aria-label="Ассистент склада"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "rounded-md hover:bg-white/10",
            )}
          >
            <FaRobot className="size-5" aria-hidden />
          </Link>
        ) : null}
        <NotificationCenter />
        <ColorModeButton className="hover:bg-white/10" />
        <UserMenu />
      </div>
    </header>
  )
}

export default Navbar
