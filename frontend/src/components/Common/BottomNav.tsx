import { useQuery } from "@tanstack/react-query"
import { Link, useLocation } from "@tanstack/react-router"
import {
  FiBox,
  FiList,
  FiMessageCircle,
  FiMoreHorizontal,
  FiTarget,
} from "react-icons/fi"
import { fetchAgentPermissions } from "@/api/agent.ts"
import { cn } from "@/lib/utils"

const baseNavItems = [
  { icon: FiTarget, label: "Tower", path: "/control-tower", requiresAssistant: false },
  { icon: FiBox, label: "Склад", path: "/warehouse", requiresAssistant: false },
  { icon: FiList, label: "Задания", path: "/warehouse-tasks", requiresAssistant: false },
  { icon: FiMessageCircle, label: "Ассистент", path: "/assistant", requiresAssistant: true },
  { icon: FiMoreHorizontal, label: "Ещё", path: "/settings", requiresAssistant: false },
]

export function BottomNav() {
  const { pathname } = useLocation()
  const { data: agentPerm, isPending: agentPermPending } = useQuery({
    queryKey: ["agent-permissions"],
    queryFn: fetchAgentPermissions,
  })

  const navItems = baseNavItems.filter((item) => {
    if (item.requiresAssistant) {
      if (agentPermPending) return false
      return agentPerm?.can_use === true
    }
    return true
  })

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex h-14 items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            item.path === "/control-tower"
              ? pathname === "/control-tower" || pathname === "/"
              : pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-1 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
