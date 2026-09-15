import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link as RouterLink } from '@tanstack/react-router';
import { Button } from '@/components/ui/button.tsx';
import { formatExpiredDaysLabel } from '@/components/warehouse3d/twin3dDerived.ts';
import type { CellItemInfo } from '@/components/warehouse3d/warehouse3dTypes.ts';

export function CellPopup({
  cellLabel,
  items,
  occupied,
  onClose,
}: {
  cellLabel: string;
  items: CellItemInfo[];
  occupied?: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className='cell-popup rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md'
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        minWidth: '220px',
        maxWidth: '320px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        animation: 'cellPopupIn 0.18s ease-out',
      }}
    >
      <style>{`
        @keyframes cellPopupIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div className='mb-2 text-sm font-semibold'>
        {cellLabel}
      </div>
      {items.length > 0 ? (
        <>
          {items.length > 1 && (
            <div className='mb-1.5 text-xs text-muted-foreground'>
              В ячейке {items.length} поз.
            </div>
          )}
          {items.slice(0, 4).map((item, idx) => (
            <div
              key={item.id ?? `${item.title}-${idx}`}
              className={
                idx < Math.min(items.length, 4) - 1
                  ? 'mb-2.5 border-b border-border pb-2'
                  : undefined
              }
            >
              <div className='mb-1 font-semibold'>
                {item.title}
              </div>
              {item.description && (
                <div className='mb-1.5 text-xs text-muted-foreground'>
                  {item.description}
                </div>
              )}
              <div className='mb-1 flex flex-wrap gap-2.5'>
                <span>Кол-во: {item.quantity ?? 1}</span>
                {item.unit && <span>Ед.: {item.unit}</span>}
                {item.sku && (
                  <span>Артикул: {item.sku}</span>
                )}
              </div>
              {item.expires_at && (
                <div className='mb-1'>
                  Срок годности:{' '}
                  {new Date(item.expires_at).toLocaleDateString(
                    'ru-RU',
                  )}
                  {item.isExpired &&
                    item.expiredDays != null && (
                      <span className='ml-1.5 font-semibold text-red-900 dark:text-red-300'>
                        Просрочено на{' '}
                        {formatExpiredDaysLabel(
                          item.expiredDays,
                        )}
                      </span>
                    )}
                  {item.expiringSoon && !item.isExpired && (
                    <span className='ml-1.5 font-semibold text-red-600'>
                      Скоро истекает
                    </span>
                  )}
                </div>
              )}
              {item.location && (
                <div className='text-xs text-muted-foreground'>
                  Место: {item.location}
                </div>
              )}
              <div className='mt-1.5 text-[11px] text-muted-foreground'>
                Статус: {item.status}
              </div>
              {item.id && (
                <Button
                  asChild
                  size='sm'
                  variant='outline'
                  className='mt-2 h-7 text-xs'
                >
                  <RouterLink
                    to='/items'
                    search={{ open: item.id }}
                    onClick={(e: ReactMouseEvent) =>
                      e.stopPropagation()
                    }
                  >
                    Подробнее →
                  </RouterLink>
                </Button>
              )}
            </div>
          ))}
          {items.length > 4 && (
            <div className='mt-1.5 text-xs text-muted-foreground'>
              Ещё {items.length - 4}…
            </div>
          )}
        </>
      ) : occupied ? (
        <div className='text-muted-foreground'>
          Ячейка занята (карточка товара ещё не загружена)
        </div>
      ) : (
        <div className='text-muted-foreground'>
          Ячейка свободна
        </div>
      )}
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='mt-2.5 h-7 text-xs'
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        Закрыть
      </Button>
    </div>
  );
}
