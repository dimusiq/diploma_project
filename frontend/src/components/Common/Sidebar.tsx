import { useState } from "react"
import { FaBars } from "react-icons/fa"
import { FiLogOut } from "react-icons/fi"

import { Button } from "@/components/ui/button.tsx"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet.tsx"
import useAuth from "@/hooks/useAuth.ts"
import SidebarItems from "./SidebarItems.tsx"

export function SidebarDesktopContent() {
  const { logout } = useAuth()
  return (
    <div className="h-full min-h-0 w-full overflow-x-hidden overflow-y-auto bg-muted/40 p-4">
      <SidebarItems />
      <button
        type="button"
        className="mt-2 flex w-full items-center gap-4 rounded-md px-4 py-2 text-left text-sm hover:bg-muted"
        onClick={() => logout()}
      >
        <FiLogOut className="size-4 shrink-0" />
        <span>Выйти</span>
      </button>
    </div>
  )
}

const Sidebar = () => {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>
        <Button
          variant="ghost"
          size="icon"
          className="absolute z-[100] m-4 md:hidden"
          aria-label="Открыть меню"
        >
          <FaBars />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-full max-w-xs flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-4 pb-4">
            <SidebarItems onClose={() => setOpen(false)} />
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-4 rounded-md px-4 py-2 text-left text-sm hover:bg-muted"
              onClick={() => logout()}
            >
              <FiLogOut className="size-4 shrink-0" />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default Sidebar
