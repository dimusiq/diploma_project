import { IconButton } from "@chakra-ui/react"
import { BsThreeDotsVertical } from "react-icons/bs"
import type { UserPublic } from "@/client/index.ts"
import DeleteUser from "../Admin/DeleteUser.tsx"
import EditUser from "../Admin/EditUser.tsx"
import { MenuContent, MenuRoot, MenuTrigger } from "../ui/menu.tsx"

interface UserActionsMenuProps {
  user: UserPublic
  disabled?: boolean
}

export const UserActionsMenu = ({ user, disabled }: UserActionsMenuProps) => {
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <IconButton variant="ghost" color="inherit" disabled={disabled}>
          <BsThreeDotsVertical />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <EditUser user={user} />
        <DeleteUser id={user.id} />
      </MenuContent>
    </MenuRoot>
  )
}
