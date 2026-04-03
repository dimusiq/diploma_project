import { BsThreeDotsVertical } from "react-icons/bs"
import type { UserPublic } from "@/client/index.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import DeleteUser from "../Admin/DeleteUser.tsx"
import EditUser from "../Admin/EditUser.tsx"

interface UserActionsMenuProps {
  user: UserPublic
  disabled?: boolean
}

export const UserActionsMenu = ({ user, disabled }: UserActionsMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-inherit"
          disabled={disabled}
          aria-label="Действия с пользователем"
        >
          <BsThreeDotsVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-[12rem] p-2">
        <div className="flex flex-col gap-1">
          <EditUser user={user} />
          <DeleteUser id={user.id} />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
