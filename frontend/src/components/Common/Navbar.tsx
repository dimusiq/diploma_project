import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FaRobot } from "react-icons/fa"
import { FiMaximize } from "react-icons/fi"

import { fetchAgentPermissions } from "@/api/agent.ts"
import { Button } from "@/components/ui/button.tsx"
import { ColorModeButton } from "@/components/ui/color-mode.tsx"
import { SidebarTrigger } from "@/components/ui/sidebar.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx"
import { cn } from "@/lib/utils"
import { BarcodeScanner } from "./BarcodeScanner.tsx"
import { GlobalSearch } from "./GlobalSearch.tsx"
import { NotificationCenter } from "./NotificationCenter.tsx"
import UserMenu from "./UserMenu.tsx"

function Navbar() {
  const [scanOpen, setScanOpen] = useState(false)
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
        <GlobalSearch />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-md hover:bg-white/10"
              aria-label="Сканировать штрихкод"
              onClick={() => setScanOpen(true)}
            >
              <FiMaximize className="size-5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Сканировать штрихкод</TooltipContent>
        </Tooltip>
        {showAssistant ? (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="rounded-md hover:bg-white/10"
          >
            <Link to="/assistant" aria-label="Ассистент склада">
              <FaRobot className="size-5" aria-hidden />
            </Link>
          </Button>
        ) : null}
        <NotificationCenter />
        <ColorModeButton className="hover:bg-white/10" />
        <UserMenu />
      </div>
      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} />
    </header>
  )
}

export default Navbar
