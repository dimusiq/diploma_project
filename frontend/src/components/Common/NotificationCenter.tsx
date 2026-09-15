/**
 * Центр уведомлений: иконка-колокольчик, бейдж непрочитанных, выпадающая панель.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { FaExclamationTriangle } from 'react-icons/fa';
import {
  FiBell,
  FiCheck,
  FiClock,
  FiInfo,
  FiPackage,
} from 'react-icons/fi';

import {
  type NotificationPublic,
  notificationsApi,
  SEVERITY_LABELS,
} from '@/api/notifications.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { useNotificationSse } from '@/hooks/useNotificationSse.ts';
import { cn } from '@/lib/utils';

const SEVERITY_ICON = {
  critical: FaExclamationTriangle,
  warning: FiClock,
  info: FiInfo,
} as const;

const SEVERITY_BADGE = {
  critical: 'bg-destructive text-destructive-foreground',
  warning:
    'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  info: 'bg-primary/15 text-primary',
} as const;

function NotificationItem({
  item,
  onMarkRead,
}: {
  item: NotificationPublic;
  onMarkRead: (id: string) => void;
}) {
  const severity = (
    item.severity in SEVERITY_ICON ? item.severity : 'info'
  ) as keyof typeof SEVERITY_ICON;
  const Icon = SEVERITY_ICON[severity];
  const badgeClass = SEVERITY_BADGE[severity];

  return (
    <div
      className={cn(
        'border-b border-border p-3 last:border-b-0',
        !item.is_read && 'bg-muted/50',
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-1 gap-2'>
          <div
            className={cn(
              'mt-0.5 shrink-0',
              severity === 'critical' && 'text-destructive',
              severity === 'warning' && 'text-orange-500',
              severity === 'info' && 'text-primary',
            )}
          >
            <Icon size={18} />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-medium'>
              {item.title}
            </p>
            {item.body ? (
              <p className='mt-0.5 text-xs text-muted-foreground'>
                {item.body}
              </p>
            ) : null}
            {item.source ? (
              <div className='mt-1 flex items-center gap-1.5 text-xs text-muted-foreground'>
                {item.source === 'Склад' ? (
                  <FiPackage
                    size={14}
                    className='text-orange-500'
                    title='Склад'
                  />
                ) : null}
                <span>Источник: {item.source}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
              badgeClass,
            )}
          >
            {SEVERITY_LABELS[
              severity as keyof typeof SEVERITY_LABELS
            ] ?? item.severity}
          </span>
          {!item.is_read ? (
            <Button
              type='button'
              variant='ghost'
              size='icon-xs'
              className='size-7'
              aria-label='Отметить прочитанным'
              onClick={() => onMarkRead(item.id)}
            >
              <FiCheck className='size-4' />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const queryClient = useQueryClient();
  useNotificationSse();

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
  });
  const unreadCount = unreadData?.count ?? 0;

  const { data: listData, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationsApi.list({ limit: 100 }),
  });
  const notifications = listData?.data ?? [];

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notifications'],
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notifications'],
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => notificationsApi.clearAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notifications'],
      });
    },
  });

  const ensureMutation = useMutation({
    mutationFn: () => notificationsApi.ensure(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notifications'],
      });
    },
  });

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) ensureMutation.mutate();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='relative rounded-md text-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/15 dark:hover:text-primary'
          aria-label='Уведомления'
        >
          <FiBell className='size-5' />
          {unreadCount > 0 ? (
            <span className='absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground'>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-[400px] max-w-[95vw] p-0'
        sideOffset={8}
      >
        <div className='border-b border-border p-4 pb-2'>
          <p className='text-base font-bold'>
            Центр уведомлений
          </p>
          <p className='mt-1 text-sm text-muted-foreground'>
            Сюда выводятся важные события по технике, складу
            и доступам.
          </p>
        </div>
        <div className='max-h-[360px] overflow-y-auto'>
          {isLoading ? (
            <div className='p-4 text-sm text-muted-foreground'>
              Загрузка…
            </div>
          ) : notifications.length === 0 ? (
            <div className='p-4 text-sm text-muted-foreground'>
              Нет уведомлений
            </div>
          ) : (
            <div className='flex flex-col'>
              {notifications.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  onMarkRead={(id) =>
                    markReadMutation.mutate(id)
                  }
                />
              ))}
            </div>
          )}
        </div>
        {(notifications.length > 0 || unreadCount > 0) && (
          <div className='flex flex-col gap-1 border-t border-border p-2'>
            {unreadCount > 0 ? (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='w-full justify-center'
                loading={markAllReadMutation.isPending}
                onClick={() => markAllReadMutation.mutate()}
              >
                Отметить все прочитанными
              </Button>
            ) : null}
            <Button
              type='button'
              variant='outlineDestructive'
              size='sm'
              className='w-full justify-center'
              loading={clearAllMutation.isPending}
              onClick={() => clearAllMutation.mutate()}
            >
              Очистить уведомления
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
