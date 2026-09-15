import { useNavigate } from '@tanstack/react-router';
import { FiLogOut, FiUser } from 'react-icons/fi';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import useAuth from '@/hooks/useAuth.ts';
import { useAuthenticatedAvatarObjectUrl } from '@/hooks/useAuthenticatedAvatarObjectUrl.ts';
import { initialsFromUser } from '@/lib/userInitials.ts';

const UserMenu = () => {
  const navigate = useNavigate();
  const { user, logout, userDataUpdatedAt } = useAuth();
  const avatarObjectUrl = useAuthenticatedAvatarObjectUrl(
    user?.id,
    user?.avatar_ext,
    userDataUpdatedAt,
  );

  const handleLogout = () => {
    logout();
  };

  const label = user?.full_name?.trim() || 'Профиль';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid='user-menu'
          variant='ghost'
          size='icon-sm'
          className='shrink-0 rounded-full'
          aria-label={label}
        >
          <Avatar className='size-8'>
            {avatarObjectUrl ? (
              <AvatarImage src={avatarObjectUrl} alt='' />
            ) : null}
            <AvatarFallback className='bg-primary text-xs font-medium text-primary-foreground'>
              {user
                ? initialsFromUser(
                    user.full_name,
                    user.email,
                  )
                : '?'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-48'>
        <DropdownMenuItem
          onClick={() => navigate({ to: '/settings' })}
          className='cursor-pointer gap-2'
        >
          <FiUser className='size-4' />
          Мой профиль
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant='destructive'
          onClick={handleLogout}
          className='cursor-pointer gap-2'
        >
          <FiLogOut className='size-4' />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
