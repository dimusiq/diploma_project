import { useNavigate } from "@tanstack/react-router"
import { FaHardHat } from "react-icons/fa"
import { FiLogOut, FiUser } from "react-icons/fi"

import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import useAuth from "@/hooks/useAuth.ts"

const UserMenu = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          data-testid="user-menu"
          variant="default"
          size="sm"
          className="max-w-xs truncate"
        >
          <FaHardHat className="size-[18px] shrink-0" />
          <span className="truncate">{user?.full_name ?? "Пользователь"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem
          onClick={() => navigate({ to: "/settings" })}
          className="cursor-pointer gap-2"
        >
          <FiUser className="size-4" />
          Мой профиль
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={handleLogout}
          className="cursor-pointer gap-2"
        >
          <FiLogOut className="size-4" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserMenu
