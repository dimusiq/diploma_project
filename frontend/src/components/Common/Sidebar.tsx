"use client"

import { Link } from "@tanstack/react-router"
import { FiLogOut } from "react-icons/fi"

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  Sidebar as SidebarRoot,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar.tsx"
import useAuth from "@/hooks/useAuth.ts"
import Logo from "/images/nebardak-logo.svg"
import SidebarItems from "./SidebarItems.tsx"

export function AppSidebar() {
  const { logout } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()

  const onNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <SidebarRoot
      collapsible="offcanvas"
      variant="sidebar"
      className="shadow-sm"
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" onClick={onNavigate}>
                <img
                  src={Logo}
                  alt=""
                  className="size-8 shrink-0 rounded-md object-contain"
                />
                <span className="truncate font-semibold">Nebardak</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarItems onNavigate={onNavigate} />
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                logout()
                if (isMobile) setOpenMobile(false)
              }}
            >
              <FiLogOut className="size-4 shrink-0" aria-hidden />
              <span>Выйти</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </SidebarRoot>
  )
}

export default AppSidebar
