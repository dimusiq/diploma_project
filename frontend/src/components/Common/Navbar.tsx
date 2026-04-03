import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FaRobot } from "react-icons/fa"

import { fetchAgentPermissions } from "@/api/agent.ts"
import { buttonVariants } from "@/components/ui/button.tsx"
import { ColorModeButton } from "@/components/ui/color-mode.tsx"
import { cn } from "@/lib/utils"
import Logo from "/images/nebardak-logo.svg"
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
        "sticky top-0 z-40 hidden w-full items-center justify-between bg-muted/95 p-4 text-foreground backdrop-blur md:flex",
      )}
    >
      <Link to="/">
        <img src={Logo} alt="Nebardak" className="max-w-[10rem] p-2" />
      </Link>
      <div className="flex items-center gap-2">
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
